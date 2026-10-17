/**
 * Location fixes the phone took but could not send yet.
 *
 * The GPS does not need a network. An engineer in a basement, a lift or on a
 * village stretch is still being located — the fixes just cannot leave the
 * phone. They used to be thrown away, so an outage came back as a hole in the
 * day. They are kept here instead and posted when the signal returns.
 *
 * Stored in localStorage rather than memory: the queue has to survive the app
 * being backgrounded and the WebView being reloaded, which is the normal life
 * of a phone in a pocket.
 *
 * Each fix carries `owner`, the user whose duty it was, and is only ever sent
 * by that user (belongsTo in trackingRules.js). Fixes queued before the tag
 * existed have none, and go with whoever is signed in, as they always did.
 *
 * Every function takes the storage it works on so this can be exercised without
 * a browser. Defaults to localStorage, which is what the app passes.
 */

const KEY = "tracking.pending_fixes";

// About seventeen hours at the 30-second cadence. Past this the phone has been
// offline longer than a shift, and holding more would only grow a queue nobody
// is going to act on.
export const MAX_QUEUED = 2000;

// What the phone's own tracker can hand over at once: its store holds this
// many (APK 1.4.1's buffer and 1.5's outbox alike). A handover is kept whole up
// to here -- trimming it to MAX_QUEUED dropped its oldest before a single send
// had been tried.
export const MAX_HANDED_OVER = 6000;

// The server refuses a fix older than this, so carrying one to it wastes a
// request and a slot. Kept in step with MAX_BACKLOG_HOURS in cases/pings.py.
export const MAX_AGE_HOURS = 48;

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Some WebViews throw on the accessor itself when site data is blocked.
    return null;
  }
}

export function loadQueue(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((f) => f && f.client_key) : [];
  } catch {
    // A corrupt queue is not worth a crash on the duty screen. Start over.
    return [];
  }
}

export function saveQueue(fixes, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(fixes));
    return true;
  } catch {
    // Quota, or a WebView with storage disabled. The fix is lost, but tracking
    // carries on — which is the right way round.
    return false;
  }
}

/** Drop what the server would refuse anyway, oldest first when over the cap. */
export function prune(fixes, now = Date.now(), cap = MAX_QUEUED) {
  const cutoff = now - MAX_AGE_HOURS * 3600 * 1000;
  const fresh = fixes.filter((fix) => {
    const taken = Date.parse(fix.timestamp);
    return Number.isNaN(taken) ? false : taken >= cutoff;
  });
  // Over the cap, the OLDEST go. What is left is the most recent stretch, which
  // is the part anybody is still going to act on.
  return fresh.length > cap ? fresh.slice(fresh.length - cap) : fresh;
}

export function enqueue(fix, storage = defaultStorage(), now = Date.now()) {
  return enqueueAll([fix], storage, now);
}

/**
 * Queue several at once, in one read and one write -- a phone handing over a
 * few thousand held fixes used to rewrite the whole queue once per fix.
 *
 * A fix whose key is already waiting is skipped. It is the same fix: a live
 * one that failed again, or one the phone's tracker handed over twice. The
 * server would skip it anyway; keeping it twice only fills the cap.
 *
 * A queue already over MAX_QUEUED holds a handover still being sent (see
 * enqueueHandover), and a fix joining it does not cut it back down.
 */
export function enqueueAll(fixes, storage = defaultStorage(), now = Date.now(), cap = MAX_QUEUED) {
  const queued = loadQueue(storage);
  const limit = queued.length > MAX_QUEUED ? Math.max(cap, MAX_HANDED_OVER) : cap;
  const waiting = new Set(queued.map((fix) => fix.client_key));
  for (const fix of fixes) {
    if (!fix?.client_key || waiting.has(fix.client_key)) continue;
    waiting.add(fix.client_key);
    queued.push(fix);
  }
  const kept = prune(queued, now, limit);
  saveQueue(kept, storage);
  return kept.length;
}

/** What the phone's own tracker handed over: kept whole, up to MAX_HANDED_OVER. */
export function enqueueHandover(fixes, storage = defaultStorage(), now = Date.now()) {
  return enqueueAll(fixes, storage, now, MAX_HANDED_OVER);
}

/**
 * Forget the fixes the server has taken.
 *
 * By key, not by count: while a batch was in flight the watcher may well have
 * added more, and dropping "the first N" would throw away fixes that were never
 * sent.
 */
export function forget(keys, storage = defaultStorage()) {
  const delivered = new Set(keys);
  const left = loadQueue(storage).filter((fix) => !delivered.has(fix.client_key));
  saveQueue(left, storage);
  return left.length;
}

export function queueSize(storage = defaultStorage()) {
  return loadQueue(storage).length;
}

/** A fresh id for one fix, so a batch the server already took is not stored twice. */
export function newClientKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // Older WebViews, or a non-secure context.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
