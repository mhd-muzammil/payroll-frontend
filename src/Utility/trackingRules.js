/**
 * The small decisions the duty tracker makes about what the phone tells it.
 *
 * Kept apart from React and from Capacitor so that each one can be run on its
 * own, with plain inputs. They are the parts that decide whether a kilometre
 * is counted, whether the office reads "No signal", and whose positions a
 * phone may send -- so they are the parts worth being able to check without a
 * phone in hand. Nothing here reads storage, the network or the clock unless
 * it is handed them.
 */

// --- When a fix was taken ---------------------------------------------------

// How far either side of the phone's own clock a fix's time may be and still be
// believed. Ahead: a little skew, never minutes. Behind: what the server keeps.
export const FIX_TIME_AHEAD_MS = 2 * 60 * 1000;
export const FIX_TIME_BEHIND_MS = 48 * 60 * 60 * 1000;

/**
 * When a live fix was TAKEN, in milliseconds.
 *
 * It used to be stamped with the WebView's clock at the moment the callback
 * finally ran. A phone in a pocket holds those callbacks back and lets them
 * all go at once, so a twelve-kilometre stretch arrived stamped with a single
 * second -- #174's day on 16 Oct -- and the order of the fixes inside that
 * second was anybody's guess, which is how his distance went from 158.2 to
 * 151.3 in front of him. Both plugins report the time the fix was taken; that
 * is used, unless it is plainly not a time.
 *
 * Ahead of the phone's clock it is CAPPED at the limit, not swapped for the
 * phone's clock: on a phone a few minutes slow the newest fixes of a burst are
 * all "ahead", and putting them back to the phone's time stamped them before
 * the older fixes in front of them -- a zig-zag in the route. The smaller of
 * two times that both only go forward only goes forward.
 */
export function fixTakenAt(time, now = Date.now()) {
  if (typeof time !== "number" || !Number.isFinite(time)) return now;
  if (time < now - FIX_TIME_BEHIND_MS) return now;
  return Math.min(time, now + FIX_TIME_AHEAD_MS);
}

/** An ISO time from milliseconds or an ISO string, or null when it is not a time. */
function isoTime(value) {
  const ms = Number.isFinite(value) ? value : Date.parse(value ?? "");
  const at = new Date(ms);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * A fix the phone's own tracker held, as an entry for the send queue -- or
 * null when it has no position or no usable time, because the server could
 * only refuse it.
 *
 * Its own key and owner are kept when it has them (APK 1.5): a fix the
 * tracker already delivered is then recognised by the server rather than
 * stored twice, and a held fix is never handed to a different user. APK 1.4.1
 * held neither, so they are made here, as they always were.
 *
 * Its time is held to the live fix's limit (fixTakenAt) as it is handed over,
 * so on a phone whose clock is slow the held fixes and the live ones are on
 * the same clock and keep their order. A time days ahead is no clock's skew --
 * a broken GPS -- and is left as it was, for the server to refuse, rather than
 * moved onto today's route.
 */
export function heldFixEntry(fix, { owner = null, level = null, charging = null, makeKey, now = Date.now() }) {
  const latitude = fix?.latitude;
  const longitude = fix?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const taken = isoTime(Number.isFinite(fix.time) ? fix.time : fix.timestamp);
  if (!taken) return null;
  const takenMs = Date.parse(taken);
  const timestamp =
    takenMs <= now + FIX_TIME_BEHIND_MS ? isoTime(Math.min(takenMs, now + FIX_TIME_AHEAD_MS)) : taken;
  return {
    latitude,
    longitude,
    accuracy: fix.accuracy ?? null,
    speed: fix.speed ?? null,
    // Set by APK 1.5 on the first fix after Location was switched off. Never
    // by 1.4.1, and no longer by a restart: a restart is not a reason to drop
    // the stretch the engineer drove across it.
    after_gap: fix.after_gap === true,
    status: typeof fix.status === "string" ? fix.status : "",
    case_id: fix.case_id ?? fix.caseId ?? null,
    timestamp,
    client_key: fix.client_key || makeKey(),
    battery_level: fix.battery_level ?? level,
    is_charging: fix.is_charging ?? charging,
    owner: fix.owner ?? owner,
  };
}

/** The same for an event APK 1.5 held: its kind, time, key and owner kept. */
export function heldEventEntry(event, { owner = null, makeKey }) {
  if (!event?.kind) return null;
  const at = isoTime(event.at);
  if (!at) return null;
  const entry = {
    kind: String(event.kind),
    at,
    client_key: event.client_key || makeKey(),
    owner: event.owner ?? owner,
  };
  if (event.detail) entry.detail = String(event.detail);
  if (Number.isFinite(event.latitude) && Number.isFinite(event.longitude)) {
    entry.latitude = event.latitude;
    entry.longitude = event.longitude;
  }
  return entry;
}

// --- Whose positions these are ----------------------------------------------

/** The signed-in user's id, from the token's claims -- the id the server knows. */
export function userIdOf(claims) {
  return claims?.user_id ?? null;
}

/**
 * Whether the signed-in user may send this queued fix or event.
 *
 * Every entry is tagged with the user whose duty it was. A supervisor who
 * signs in on an engineer's phone must not post that engineer's route as their
 * own -- the server would store it under the supervisor, and the engineer's
 * day would lose it. An entry queued before tags existed belongs to whoever is
 * signed in, which is what every entry meant until now. Signed out, nothing
 * belongs to anyone: nothing can be sent without a token anyway.
 */
export function belongsTo(entry, userId) {
  if (userId == null) return false;
  return entry?.owner == null || String(entry.owner) === String(userId);
}

export function ownedBy(entries, userId) {
  return entries.filter((entry) => belongsTo(entry, userId));
}

// --- The connection ---------------------------------------------------------

/**
 * What one request's outcome says about the phone's connection.
 *
 * "ok" for a success, the HTTP status for any other answer, "network" when
 * nothing came back at all, and null for an error that was never a request.
 * Only "network" means the phone was offline: a server answering 500 is the
 * server's problem, and blaming the engineer's signal for it would put a false
 * "Net off" on their day.
 */
export function requestOutcome(error) {
  if (!error) return "ok";
  const status = error.response?.status;
  if (Number.isInteger(status) && status > 0) return status;
  return error.isAxiosError || error.request ? "network" : null;
}

/**
 * The connection as this page's own sends saw it -- "unknown" until one
 * succeeds, then "on" or "off" -- and the event the step records, if any.
 *
 * net_off only after a success: a page opened with no signal has no moment
 * the network was lost, only one it was found missing. net_on at the next
 * success, which closes the stretch.
 */
export function nextNetState(state, outcome) {
  if (outcome === "ok") return { state: "on", kind: state === "off" ? "net_on" : null };
  if (outcome === "network" && state === "on") return { state: "off", kind: "net_off" };
  return { state, kind: null };
}

/**
 * Where the connection stood when the page went away, from what is still
 * waiting to be sent. A net_off cannot have left the phone -- it is noted at a
 * failed send and goes out with the next success, which notes net_on in the
 * same moment -- so the newest one waiting says whether an outage is open.
 */
export function netStateFromQueue(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const kind = events[i]?.kind;
    if (kind === "net_off") return "off";
    if (kind === "net_on") return "on";
  }
  return "unknown";
}

// --- The Location switch ----------------------------------------------------

/**
 * Whether an error is the phone saying its Location is switched off: the
 * Geolocation plugin's permission check ("Location services are not enabled",
 * OS-PLUG-GLOC-0007), or the community plugin's watcher ("Location services
 * disabled.", under the same NOT_AUTHORIZED code as a refused permission, so
 * only the words tell them apart).
 */
export function saysLocationIsOff(error) {
  if (!error) return false;
  if (error.code === "OS-PLUG-GLOC-0007") return true;
  return /location services (are not enabled|disabled)/i.test(String(error.message ?? ""));
}

/**
 * The Location switch as this page has seen it -- "unknown", "on" or "off" --
 * and what to record on a change.
 *
 * Always "found": the page only ever finds Location off or on when it looks,
 * it never sees the switch being flipped. That difference is the whole point
 * of the detail -- the server drops a stretch for a switch it saw flipped
 * ("switched", from the phone's own tracker), never for one merely found off,
 * because a page that looks after an hour away cannot say the hour was dark.
 */
export function nextGpsState(state, seen) {
  if (seen === "off" && state !== "off") return { state: "off", kind: "gps_off", detail: "found_off" };
  if (seen === "on" && state === "off") return { state: "on", kind: "gps_on", detail: "found_on" };
  if (seen === "on") return { state: "on", kind: null, detail: "" };
  return { state, kind: null, detail: "" };
}

// --- Starting the tracker ---------------------------------------------------

/**
 * Whether the phone's own tracker refused to start, rather than stumbling once
 * it had. Only these are worth falling back to the community watcher for: no
 * permission, or a service Android would not start. Anything else is reported
 * and left alone -- two trackers running side by side would zig-zag the route
 * and count the zig-zag.
 */
export function isStartRefusal(error) {
  if (!error) return false;
  if (error.code === "NOT_AUTHORIZED" || error.code === "START_FAILED") return true;
  return /^could not start the tracker/i.test(String(error.message ?? ""));
}

// A duty the server opened less than this long ago was opened by this very
// tap. Older, and the tap found a duty already open.
export const JUST_OPENED_MINUTES = 2;

/**
 * Whether start_duty's answer is a Login -- a duty the server has just opened
 * -- rather than one that was already open. start_duty is idempotent, and is
 * called on a reload too (Attendance repairs a duty it thinks is missing, and
 * can ask before the duty poll has answered); that is the same duty carrying
 * on, and must not cut the route. Read from the server's own minutes since the
 * session opened, so the phone's clock has no say. An answer without them
 * counts as a Login, as every start_duty did until now.
 */
export function isLogin(duty) {
  return !(duty?.duration_minutes >= JUST_OPENED_MINUTES);
}

// The server's DutySession.MAX_DURATION_HOURS, and the tracker's own limit.
export const MAX_DUTY_MS = 16 * 60 * 60 * 1000;

/** Whether a duty that started at `startedAt` has run past sixteen hours. */
export function pastDutyLimit(startedAt, now = Date.now()) {
  const started = Number.isFinite(startedAt) ? startedAt : Date.parse(startedAt ?? "");
  return Number.isFinite(started) && now - started >= MAX_DUTY_MS;
}

// --- Events before fixes ----------------------------------------------------

// The longest the fixes wait behind events the server keeps refusing.
export const EVENTS_HOLD_MAX_MS = 10 * 60 * 1000;

/**
 * Whether the fixes wait this cycle because the events in front of them did
 * not go, and since when they have been waiting.
 *
 * They wait only when events were actually refused: not for a 404 (a server
 * without the endpoint, which will never take them), not for no network
 * (the fixes will fail too, and wait anyway), and not for an empty heartbeat
 * (nothing is in front of them). And for ten minutes at most -- after that the
 * fixes go regardless, because a route held back for ever is a route lost.
 *
 * Except a GPS off or on: behind one of those the fixes wait on ANY failure,
 * no network included. On a connection that comes and goes the fix after a
 * GPS off can get through where the event in front of it did not, and the
 * stretch it closes is then counted for good. Not for a 404, still, and for
 * the same ten minutes at most.
 */
export function holdFixesBehindEvents({ outcome, carried, carriesGps = false, since, now }) {
  if (outcome === "ok" || outcome === 404 || !carried) return { hold: false, since: null };
  const refused = Number.isInteger(outcome);
  if (!refused && !carriesGps) return { hold: false, since: null };
  const first = since ?? now;
  return { hold: now - first < EVENTS_HOLD_MAX_MS, since: first };
}

/** Whether a batch of events carries a GPS off or on. */
export function carriesGpsEvent(events) {
  return events.some((event) => event?.kind === "gps_off" || event?.kind === "gps_on");
}

/**
 * The keys of the events the server refused only as "in the future": the
 * phone's clock is ahead of the server's, and the same event is taken once the
 * server's clock has caught up -- so it is kept and sent again, not forgotten.
 * Any other refusal never will be taken.
 */
export function keysToRetry(result, batch) {
  const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
  return rejected
    .filter((item) => /in the future/i.test(String(item?.reason ?? "")))
    .map((item) => batch[item.index]?.client_key)
    .filter(Boolean);
}

// --- When APK 1.5 sends for itself ------------------------------------------

export const TAKEOVER_AFTER_MS = 5 * 60 * 1000;
export const JS_SUCCESS_WINDOW_MS = 60 * 1000;

export function isHttpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599;
}

const countOf = (value) => {
  if (Array.isArray(value)) return value.length;
  if (Number.isFinite(value)) return value;
  return Number.isFinite(value?.count) ? value.count : 0;
};

/** How much the phone's own tracker has waiting to send: fixes and events. */
export function waitingInTracker(state) {
  return countOf(state?.outbox) + countOf(state?.events);
}

/**
 * Whether this page should take over sending from APK 1.5's own uploader.
 *
 * Only when all of it is true: the tracker has had something waiting for more
 * than five minutes; its last attempt got an answer from the server and the
 * answer was a refusal (so it is not simply out of signal, which a takeover
 * cannot fix); and this page itself was answered successfully within the last
 * minute (so the page could do better). Anything looser fires on every
 * ordinary dead zone and moves the tracker's outbox into a WebView that stops
 * running the moment the phone goes back in a pocket.
 *
 * "Waiting for more than five minutes" is both how long this page has seen
 * something waiting and, when the tracker says (state().oldestAt), how old its
 * oldest fix is -- so one refused upload just after a long dead zone, whose
 * fixes are old, is not taken for a tracker that keeps being refused.
 */
export function shouldTakeOver({ state, now, waitingSince, jsSuccessAt }) {
  if (waitingInTracker(state) <= 0 || waitingSince == null) return false;
  const oldestAt = state?.oldestAt;
  const since = Number.isFinite(oldestAt) ? Math.max(oldestAt, waitingSince) : waitingSince;
  if (now - since <= TAKEOVER_AFTER_MS) return false;
  const status = state?.lastUploadStatus;
  if (!isHttpStatus(status) || (status >= 200 && status < 300)) return false;
  return Number.isFinite(jsSuccessAt) && jsSuccessAt > 0 && now - jsSuccessAt < JS_SUCCESS_WINDOW_MS;
}

/**
 * Where APK 1.5 posts to. The web app calls the API on its own origin when no
 * base is configured, which a native uploader cannot: it needs the full
 * address.
 */
export function absoluteBaseUrl(base, origin) {
  return /^https?:\/\//i.test(base || "") ? base : origin;
}

// --- Reusing the live fix ---------------------------------------------------

/**
 * Whether the live fix is recent enough to reuse -- for a punch -- judged by
 * when this page GOT it (`seen_at`, the phone's clock), not when the GPS took
 * it: the two clocks need not agree, and on a phone running two minutes fast
 * a fix would never be recent enough. A fix without `seen_at` goes by its own
 * time, as every fix did.
 */
export function seenWithin(fix, maxAgeMs, now = Date.now()) {
  const seen = Number.isFinite(fix?.seen_at) ? fix.seen_at : Date.parse(fix?.timestamp ?? "");
  return Number.isFinite(seen) && now - seen < maxAgeMs;
}

// --- The figure on the engineer's screen -----------------------------------

// A fall smaller than this, on the same day, is not shown. Kept in metres so
// that 10.0 - 9.6 is a fall of 0.4 and not of 0.40000000000000036.
//
// Four hundred, not two: 1,350 simulated backlogs joining a real-shaped trail
// moved it down by up to 230 m (twice the wander floor, which can reach 200 m),
// so 200 m let the dip through.
export const KM_STEADY_METRES = 400;

/**
 * "Travelled today" as the engineer should see it.
 *
 * The distance is re-measured from the day's fixes on every read, and a late
 * backlog joining fixes already held can move it a few metres either way. An
 * engineer watching their own figure go DOWN reads that as kilometres being
 * taken off them, so a fall of less than 0.4 km on the same day keeps the
 * higher figure. A bigger fall is real and shown, and so is every rise; a new
 * day starts from what the server says.
 */
export function steadyKm(shown, next) {
  if (
    shown &&
    shown.day === next.day &&
    next.km < shown.km &&
    Math.round((shown.km - next.km) * 1000) < KM_STEADY_METRES
  ) {
    return shown;
  }
  return next;
}

/** The phone's calendar day, as a key: the server's day is the same one. */
export function localDay(at = new Date()) {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}
