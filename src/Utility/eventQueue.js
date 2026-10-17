/**
 * What the phone saw happen to the tracking itself, waiting to be sent.
 *
 * A fix says where the engineer was. It cannot say why there are none for an
 * hour: Location switched off, no network, the phone stopping the app, or the
 * engineer simply standing still -- and the office's rail used to call every
 * one of those "Not tracked". These are the phone's own notes of which it was,
 * posted to /api/tracking/events/ AHEAD of the fixes, so the server already
 * knows why there is a hole when the fixes either side of it arrive.
 *
 * Kept like the fixes in pingQueue.js, and for the same reasons: in
 * localStorage, so a reload or a backgrounded WebView does not lose them; each
 * with its own key, so a post the phone never heard the answer to is not
 * stored twice; and each with the user whose duty it was.
 *
 * Every function takes the storage it works on so this can be exercised without
 * a browser. Defaults to localStorage, which is what the app passes.
 */

import { newClientKey } from "./pingQueue";

const KEY = "tracking.pending_events";

// A day of duty notes a few dozen at most. Five hundred is a phone that has
// been offline far longer than a shift -- and the most the server takes in one
// post, so the queue can always be cleared in one go.
export const MAX_QUEUED_EVENTS = 500;

// The server refuses an event older than this, as it does a fix.
export const MAX_EVENT_AGE_HOURS = 48;

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Some WebViews throw on the accessor itself when site data is blocked.
    return null;
  }
}

export function loadEvents(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((e) => e && e.client_key && e.kind) : [];
  } catch {
    // A corrupt queue is not worth a crash on the duty screen. Start over.
    return [];
  }
}

export function saveEvents(events, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(events));
    return true;
  } catch {
    // Quota, or a WebView with storage disabled. The note is lost, but
    // tracking carries on -- which is the right way round.
    return false;
  }
}

/** Drop what the server would refuse anyway, oldest first when over the cap. */
export function pruneEvents(events, now = Date.now()) {
  const cutoff = now - MAX_EVENT_AGE_HOURS * 3600 * 1000;
  const fresh = events.filter((event) => {
    const at = Date.parse(event.at);
    return Number.isNaN(at) ? false : at >= cutoff;
  });
  return fresh.length > MAX_QUEUED_EVENTS ? fresh.slice(fresh.length - MAX_QUEUED_EVENTS) : fresh;
}

/** Add events, skipping any whose key is already waiting. Returns the queue length. */
export function enqueueEvents(events, storage = defaultStorage(), now = Date.now()) {
  const queued = loadEvents(storage);
  const waiting = new Set(queued.map((event) => event.client_key));
  for (const event of events) {
    if (!event?.client_key || !event.kind || waiting.has(event.client_key)) continue;
    waiting.add(event.client_key);
    queued.push(event);
  }
  const kept = pruneEvents(queued, now);
  saveEvents(kept, storage);
  return kept.length;
}

/** Forget the events the server has taken, by key -- more may have been added meanwhile. */
export function forgetEvents(keys, storage = defaultStorage()) {
  const delivered = new Set(keys);
  const left = loadEvents(storage).filter((event) => !delivered.has(event.client_key));
  saveEvents(left, storage);
  return left.length;
}

/**
 * One event, ready to queue: what happened, when, whose duty it was, and where
 * the phone last was when it is known. `at` is milliseconds or anything Date
 * reads; a time that is not one becomes now, rather than an event lost.
 */
export function newEvent(kind, at, { owner = null, detail = "", latitude, longitude } = {}) {
  let when = new Date(at ?? NaN);
  if (Number.isNaN(when.getTime())) when = new Date();
  const event = { kind, at: when.toISOString(), client_key: newClientKey(), owner };
  if (detail) event.detail = detail;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    event.latitude = latitude;
    event.longitude = longitude;
  }
  return event;
}
