import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { trackingService } from "../services/trackingService";
import { appVersionHeader, Base_URL, lastSuccessAt } from "../api/Api";
import { AUTH_CHANGED_EVENT, getAccessToken, getRefreshToken, getTokenClaims } from "../auth/rbac";
import { enqueue, enqueueHandover, forget, loadQueue, newClientKey } from "../Utility/pingQueue";
import { enqueueEvents, forgetEvents, loadEvents, newEvent } from "../Utility/eventQueue";
import { batteryState } from "../Utility/phoneBattery";
import {
  absoluteBaseUrl,
  belongsTo,
  carriesGpsEvent,
  fixTakenAt,
  heldEventEntry,
  heldFixEntry,
  holdFixesBehindEvents,
  isStartRefusal,
  keysToRetry,
  netStateFromQueue,
  nextGpsState,
  nextNetState,
  ownedBy,
  pastDutyLimit,
  requestOutcome,
  saysLocationIsOff,
  shouldTakeOver,
  userIdOf,
  waitingInTracker,
} from "../Utility/trackingRules";

const PING_INTERVAL_MS = 30000; // send a position every 30s while on duty
const MAX_ACCURACY_M = 100; // drop noisy readings worse than this
// Metres of movement before Android bothers us again. Zero would report
// constantly while an engineer stands still and drain the battery for nothing;
// the 30s ping keeps re-sending the last fix either way, so the office still
// sees them alive and standing where they are.
const NATIVE_DISTANCE_FILTER_M = 10;
// Most fixes to hand over in one batch. Matches MAX_BATCH in cases/pings.py —
// the server refuses more, and a refused batch would leave the queue stuck.
const MAX_BATCH = 500;
// An engineer standing at a customer produces no new fixes, and re-sending the
// last one stores nothing -- so to the server a phone recording perfectly and
// a phone that had stopped looked the same, and the board read "No signal"
// ten minutes into every visit. An empty events/ post at least this often,
// while the tracker is running and Location is on, says it is alive.
const HEARTBEAT_MS = 60000;
// A server without events/ (404, not yet updated) is asked again this often,
// not on every cycle: what waits keeps waiting, and the fixes go meanwhile.
const EVENTS_MISSING_RETRY_MS = 10 * 60 * 1000;
// The longest a cycle waits on the phone for an answer. Plugin calls share one
// thread on the phone, and one stuck there must not stop this page sending.
const PLUGIN_WAIT_MS = 5000;
// Batches a Logout sends before leaving the rest for the next duty: well past
// a full queue of fixes, so it is only ever reached by a server refusing them.
const MAX_FLUSH_ROUNDS = 16;
// APK 1.5 hands over at most 2000 fixes per drain() and holds at most 6000, so
// a Logout asks it again until it has nothing left -- four asks cover it all.
const MAX_DRAIN_ROUNDS = 4;

// THE DUTY WHOSE LOGIN HAS ALREADY BEEN MARKED.
//
// Attendance can ask for the same duty to start again a minute after the
// Login -- its repair, a second tap -- and the server still calls that a
// Login. Marking it again put the "duty began here" stamp on a second fix.
// Kept on the phone, so a reload in between does not forget it.
const FLAGGED_SESSION_KEY = "tracking.login_flagged_session";

const loginAlreadyMarked = (sessionId) => {
  if (sessionId == null) return false;
  try {
    return localStorage.getItem(FLAGGED_SESSION_KEY) === String(sessionId);
  } catch {
    return false;
  }
};

const markLogin = (sessionId) => {
  if (sessionId == null) return;
  try {
    localStorage.setItem(FLAGGED_SESSION_KEY, String(sessionId));
  } catch {
    // Storage blocked: a repeated start marks once more, as it always did.
  }
};

// HOW CLOSE TOGETHER THE TRAIL IS KEPT.
//
// The distance is the sum of straight lines between the fixes we hold, and the
// road bends between them, so the further apart they are the more of the
// journey is missed. Measured on a real day: the same trail read at one fix a
// minute instead of one every thirty seconds is 3.2% shorter, at ninety
// seconds 5.8%, at three minutes 10.7%.
//
// Twelve seconds is roughly a hundred metres at road speed. Denser than that
// buys very little -- a hundred metres of road is nearly straight -- and costs
// a row every time, on every engineer, for ever.
const MIN_KEEP_GAP_MS = 12000;
// And a distance floor as well, so a phone sitting at a customer for an hour
// does not fill the table with the same spot three hundred times.
const MIN_KEEP_METERS = 15;

/** Metres between two fixes, as the crow flies. */
const metresApart = (a, b) => {
  if (!a || !b) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/** The promise's answer, or undefined if it has not come within `ms`. */
const within = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });

// Registered by hand because the plugin ships only its native halves and type
// definitions — there is no JS entry point to import.
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
// Our own tracker, in the APK from version 1.4. It keeps reporting after the
// app is swiped off the recents list, which the community plugin cannot: its
// service is bound only, so the swipe destroys it and the engineer's drive home
// goes unmeasured. See android/app/src/main/java/in/systimus/payroll/.
const DutyTracker = registerPlugin("DutyTracker");
// The stock Geolocation plugin, compiled into the APK since 1.4.1 though
// nothing here used it. Asked one thing only: is the phone's Location switched
// on? Neither tracker says when it goes off, and this plugin's permission check
// refuses with "Location services are not enabled" while it is.
const Geolocation = registerPlugin("Geolocation");
const IS_NATIVE = Capacitor?.isNativePlatform?.() ?? false;

/**
 * Ask, once, to be allowed to show the tracking notification.
 *
 * From Android 13 a notification needs its own permission, and this app never
 * asked for one. The foreground service still ran -- the phone said "Recording
 * in the background" quite correctly -- but its notification was hidden, so an
 * engineer had no way to see that they were being tracked, and no way to see
 * that they had STOPPED being tracked either. The first phone this shipped to
 * reported exactly that: everything working, no notification anywhere.
 *
 * It is also what keeps the service alive: a foreground notification the
 * engineer can see is the deal Android strikes for letting us keep running,
 * and a phone's own battery rules treat a silent one far less kindly.
 *
 * Android shows the box once. After that this resolves with whatever was
 * decided and shows nothing, so it is safe to call on every Login. A refusal
 * changes nothing about the tracking -- it is not worth a single line of
 * error, and the duty card already says what is being recorded.
 */
const askToShowTheNotification = async () => {
  if (!IS_NATIVE) return;
  try {
    const state = await LocalNotifications.checkPermissions();
    if (state?.display === "granted" || state?.display === "denied") return;
    await LocalNotifications.requestPermissions();
  } catch {
    // An APK without the notifications plugin, or a phone that refuses to be
    // asked. Neither stops a single position being recorded.
  }
};
// Whether THIS phone has it. An older APK does not, and takes the old path
// unchanged. Set this to false to put every phone back on the old path at once
// without building anything -- the app loads the live site.
const USE_DUTY_TRACKER =
  IS_NATIVE && (Capacitor?.isPluginAvailable?.("DutyTracker") ?? false);
// Whether this phone can be asked about its Location switch. An APK without the
// plugin is simply not asked.
const CAN_ASK_LOCATION = IS_NATIVE && (Capacitor?.isPluginAvailable?.("Geolocation") ?? false);

// What the phone's own tracker does by itself. APK 1.5 sends its positions and
// events to the server on its own, and reports Location and the network
// itself. 1.4.1 has no capabilities() at all, and Capacitor refuses a method an
// APK does not have -- which is the answer: the page does all of it, as it
// always has. Asked once; the answer cannot change while the app runs.
const OLD_TRACKER = { nativeUpload: false, gpsEvents: false, netEvents: false };
let trackerCapabilitiesAsked = null;
function trackerCapabilities() {
  if (!USE_DUTY_TRACKER) return Promise.resolve(OLD_TRACKER);
  if (!trackerCapabilitiesAsked) {
    trackerCapabilitiesAsked = DutyTracker.capabilities()
      .then((caps) => ({
        nativeUpload: caps?.nativeUpload === true,
        gpsEvents: caps?.gpsEvents === true,
        netEvents: caps?.netEvents === true,
      }))
      .catch(() => OLD_TRACKER);
  }
  return trackerCapabilitiesAsked;
}

/** The signed-in user, as the server knows them. */
const signedInUserId = () => userIdOf(getTokenClaims());

/**
 * What APK 1.5's uploader needs to post as the engineer: the full address (it
 * has no page origin to be relative to), the tokens, the version header, and
 * the user whose fixes are the only ones it may send.
 */
function uploaderAuth(owner) {
  return {
    baseUrl: absoluteBaseUrl(Base_URL, window.location.origin),
    access: getAccessToken(),
    refresh: getRefreshToken(),
    appVersion: appVersionHeader(),
    userId: owner,
  };
}

/**
 * Live location sender for a field engineer. Start it when the engineer goes on
 * duty; it posts the latest good fix to the backend every PING_INTERVAL_MS, and
 * can tag each ping with the active case + a working status.
 *
 * Two ways of getting positions, because the browser cannot do the job the
 * engineers actually need:
 *
 *   In the ANDROID APP, an Android foreground service. It keeps reporting with
 *   the app in the background and the screen off, which is the normal state of a
 *   phone in a pocket on a bike — the whole point of the distance figure. Android
 *   makes us show a notification for the privilege, which is fair: the engineer
 *   can see at a glance that they are being tracked, and it disappears the moment
 *   they end duty.
 *
 *   IN A BROWSER, navigator.geolocation, exactly as before. It works only while
 *   the tab is open and in front — Android suspends a backgrounded WebView — so
 *   distance from a browser is a floor, not a total. There is no way around that
 *   from a web page; it is why the app exists.
 *
 * Beside the positions it notes what happened to the tracking itself -- the
 * network or Location going off and on, the phone stopping the tracker, the app
 * being opened -- and sends those first, so the office's day reads "Net off" or
 * "GPS off" where it used to read "Not tracked".
 */
export function useLiveTracking() {
  const [tracking, setTracking] = useState(false);
  const [lastFix, setLastFix] = useState(null); // {latitude, longitude, accuracy, speed}
  const [error, setError] = useState(null);
  // THE FIRST FIX AFTER A LOGIN, AND ONLY THAT ONE, IS STAMPED `after_gap`.
  //
  // Whatever the engineer covered before going on duty is not this duty's
  // travel, and the stamp is the phone saying where the duty began. It used to
  // be set by every reload, every watcher error and every restart of the
  // service as well, and each of those threw away a stretch the engineer really
  // drove: a late batch whose first fix carried a restart flag took seven
  // kilometres off a day that had already been shown (30.34 -> 23.35). A
  // stretch the phone did not watch is now counted as the straight line it must
  // at least have been, and the events below say why it was not watched.
  const loginBoundaryRef = useRef(false);
  // Whether our own tracker is the one running, so stopping shuts down the one
  // that was actually started.
  const dutyTrackerRef = useRef(false);
  // What that tracker does for itself, once it has said (see
  // trackerCapabilities). While it sends its own positions this page sends
  // none: two senders racing is how the fix after a hole reaches the server
  // before the reason for the hole does.
  const capsRef = useRef(OLD_TRACKER);
  // Bumped by every start and stop of our tracker, so an answer that arrives
  // from an older one -- a callback, a state() reply -- is recognised as such
  // and ignored rather than acted on.
  const trackerGenerationRef = useRef(0);
  // Whether the current start of our tracker has delivered a fix. A refusal
  // before the first one means it never ran; after it, it is not a refusal.
  const trackerFixSeenRef = useRef(false);
  // The last moment the tracker was known to be alive -- a fix, or state()
  // saying it is wanted. When it is found stopped, that is when it stopped.
  const aliveAtRef = useRef(0);
  // The next fix is the first since the tracker was restarted -- by us, after
  // finding it stopped, or by Android -- and says so, which is what tells the
  // day's rail the tracking came back rather than leaving a hole.
  const restartPendingRef = useRef(false);
  // The duty being tracked: whose it is (the user signed in when it started),
  // and the server's session, for the sixteen-hour rule.
  const ownerRef = useRef(null);
  const sessionRef = useRef({ id: null, startedAt: null });
  // Whether this page is tracking, for the paths that carry on after an await.
  const runningRef = useRef(false);
  // The connection and the Location switch as this page last saw them -- see
  // nextNetState and nextGpsState.
  const netStateRef = useRef("unknown");
  const gpsStateRef = useRef("unknown");
  // When the page found Location off. Only a fix taken after it says Location
  // is back on: one held back from before the switch-off proves nothing.
  const gpsOffAtRef = useRef(0);
  // Whether the recorder is delivering, as far as the page can tell: false
  // from an error that is not Location being off -- a refused permission above
  // all, which leaves the plugin "running" with nothing coming -- until the
  // next fix. The heartbeat says "alive and recording", so it waits on this.
  const recordingRef = useRef(false);
  // When an events/ post last went out. Any post is proof of life.
  const lastEventsPostRef = useRef(0);
  // Until when events/ is not asked again: the server answered 404.
  const eventsMissingUntilRef = useRef(0);
  // Since when events/ has been refused with fixes waiting behind it.
  const eventsRefusedSinceRef = useRef(null);
  // Since when APK 1.5's tracker has had something waiting to send.
  const trackerWaitingSinceRef = useRef(null);
  // checkTracker restarts a tracker it finds stopped, and starting one needs
  // the send cycle that checkTracker is part of -- so it is reached through
  // here rather than as a dependency.
  const restartTrackerRef = useRef(null);
  // How many fixes are waiting on the phone. Surfaced so the duty screen can say
  // "12 saved, will send when you have signal" instead of looking broken.
  const [queued, setQueued] = useState(() => loadQueue().length);
  // WHICH tracker is actually running -- "app" for our own foreground service,
  // "plugin" for the community watcher, "browser" for a desktop, null for
  // nothing. Surfaced because a tracker that quietly does nothing looks
  // exactly like one that works, and telling them apart took a person walking
  // a kilometre and coming back to an empty map.
  const [source, setSource] = useState(null);
  // How many fixes the native service is holding that the app has not been
  // handed yet. Normally zero; anything else is worth seeing on the duty card,
  // because it means positions are being taken and not delivered.
  const [held, setHeld] = useState(0);

  const watchIdRef = useRef(null); // browser watchPosition id
  const nativeWatcherRef = useRef(null); // foreground service watcher id
  // Set while addWatcher is in flight, so a stop() that lands first is not lost.
  const nativeStartingRef = useRef(false);
  const intervalRef = useRef(null);
  const latestRef = useRef(null);
  // The last fix that is definitely going to the server -- either sent on its
  // own or put in the queue. What comes next is measured against it, so the
  // trail is kept at an even spacing rather than at whatever rate the OS feels
  // like reporting.
  const lastKeptRef = useRef(null);
  // When we last actually attempted a send, so the native callback and the timer
  // cannot double-send between them.
  const lastSendAtRef = useRef(0);
  // Kept in refs so the running interval always reads current values.
  const caseIdRef = useRef(null);
  const statusRef = useRef("");

  const setContext = useCallback((caseId, status) => {
    caseIdRef.current = caseId ?? null;
    statusRef.current = status ?? "";
    // APK 1.5 tags the fixes it sends itself, so it needs the case as well.
    if (dutyTrackerRef.current && capsRef.current.nativeUpload) {
      DutyTracker.setContext({ caseId: caseIdRef.current, status: statusRef.current }).catch(
        () => {},
      );
    }
  }, []);

  /**
   * Note something that happened to the tracking itself. Queued like a fix,
   * with the duty's owner, and sent ahead of the fixes -- so the server already
   * knows why there is a hole when the fixes either side of it arrive.
   */
  const recordEvent = useCallback(
    (kind, { at = Date.now(), detail = "", position = latestRef.current } = {}) => {
      enqueueEvents([
        newEvent(kind, at, {
          owner: ownerRef.current,
          detail,
          latitude: position?.latitude,
          longitude: position?.longitude,
        }),
      ]);
    },
    [],
  );

  /** What one of this page's sends says about the phone's connection. */
  const noteOutcome = useCallback(
    (outcome, attemptedAt) => {
      // APK 1.5's tracker notes the network itself, from its own uploads; two
      // reporters would put every outage on the day twice.
      if (dutyTrackerRef.current && capsRef.current.netEvents) return;
      const { state, kind } = nextNetState(netStateRef.current, outcome);
      netStateRef.current = state;
      if (kind === "net_off") recordEvent("net_off", { at: attemptedAt });
      else if (kind === "net_on") recordEvent("net_on");
    },
    [recordEvent],
  );

  // Whether this page is the one that reports the Location switch. APK 1.5's
  // tracker reports it itself, and two reporters would put it on the day twice.
  const pageWatchesLocation = useCallback(
    () => !(dutyTrackerRef.current && capsRef.current.gpsEvents),
    [],
  );

  /** What the page saw of the Location switch: "on", "off", or null for no answer. */
  const noteLocation = useCallback(
    (seen, options = {}) => {
      const at = options.at ?? Date.now();
      const { state, kind, detail } = nextGpsState(gpsStateRef.current, seen);
      gpsStateRef.current = state;
      if (kind === "gps_off") gpsOffAtRef.current = at;
      if (kind) recordEvent(kind, { ...options, at, detail });
    },
    [recordEvent],
  );

  const noteAppOpened = useCallback(
    (detail) => recordEvent("app_opened", { detail, position: null }),
    [recordEvent],
  );

  /**
   * Hand over whatever the phone could not send earlier.
   *
   * Runs BEFORE the newest fix, so a recovered signal fills the route in in
   * travel order rather than putting the current position ahead of the journey
   * that led to it.
   *
   * Failure is silent on purpose. Still offline is not news — the engineer is
   * being told that by the fix that is about to be queued behind it.
   *
   * Only the signed-in user's own: a fix queued during somebody else's duty on
   * this phone waits for them. Returns whether the batch went (or there was
   * nothing to send).
   */
  const drainQueue = useCallback(
    async (userId) => {
      const pending = ownedBy(loadQueue(), userId);
      if (!pending.length) return true;
      const batch = pending.slice(0, MAX_BATCH);
      const attemptedAt = Date.now();
      try {
        await trackingService.pingBatch(batch);
        // By key, not by count: the watcher may have added fixes while the request
        // was in flight, and dropping "the first N" would throw those away.
        forget(batch.map((fix) => fix.client_key));
        setQueued(loadQueue().length);
        noteOutcome("ok", attemptedAt);
        return true;
      } catch (e) {
        // Still no signal. The fixes stay where they are.
        noteOutcome(requestOutcome(e), attemptedAt);
        return false;
      }
    },
    [noteOutcome],
  );

  /**
   * Post what the phone has noted, ahead of the fixes. With nothing to say it
   * posts an empty list now and then -- the heartbeat.
   *
   * The fixes wait while the server REFUSES the events in front of them: a fix
   * that lands before the event explaining the hole behind it is counted as if
   * nothing happened, and taking that back later would make the day's
   * kilometres go down. Not for a 404 (a server without the endpoint), not for
   * no network (the fixes fail too) unless a GPS off or on is among them, and
   * for ten minutes at most -- see holdFixesBehindEvents.
   *
   * `delivered` is whether the server took any of them (or there were none).
   */
  const sendEvents = useCallback(
    async (userId, { heartbeat }) => {
      const batch = ownedBy(loadEvents(), userId).slice(0, MAX_BATCH);
      const attemptedAt = Date.now();
      // A server without events/ yet: left alone for a while, not asked again
      // on every cycle with everything that is waiting.
      if (attemptedAt < eventsMissingUntilRef.current) return { delivered: false, fixesMayGo: true };
      const beatDue = heartbeat && attemptedAt - lastEventsPostRef.current >= HEARTBEAT_MS;
      if (!batch.length && !beatDue) return { delivered: false, fixesMayGo: true };
      lastEventsPostRef.current = attemptedAt;
      try {
        const result = await trackingService.events(batch);
        // Refused only as "in the future" -- the phone's clock is ahead of the
        // server's -- stays, and goes again once the server's clock catches up.
        const later = new Set(keysToRetry(result, batch));
        const taken = batch.filter((event) => !later.has(event.client_key));
        forgetEvents(taken.map((event) => event.client_key));
        eventsRefusedSinceRef.current = null;
        noteOutcome("ok", attemptedAt);
        return { delivered: taken.length > 0 || !batch.length, fixesMayGo: true };
      } catch (e) {
        const outcome = requestOutcome(e);
        noteOutcome(outcome, attemptedAt);
        if (outcome === 404) eventsMissingUntilRef.current = Date.now() + EVENTS_MISSING_RETRY_MS;
        const { hold, since } = holdFixesBehindEvents({
          outcome,
          carried: batch.length > 0,
          carriesGps: carriesGpsEvent(batch),
          since: eventsRefusedSinceRef.current,
          now: Date.now(),
        });
        eventsRefusedSinceRef.current = since;
        return { delivered: false, fixesMayGo: !hold };
      }
    },
    [noteOutcome],
  );

  /**
   * Take the fixes the phone held while the app was gone, and queue them.
   *
   * Each carries the time it was TAKEN, so the kilometres land on the day they
   * were driven rather than on the moment the app happened to be opened. They
   * go straight into the send queue -- which is stored on the phone too -- so
   * the handover from native is the moment responsibility passes, and nothing
   * is held in two places waiting to be sent twice.
   *
   * Returns how many fixes it took.
   */
  const drainNativeBuffer = useCallback(async () => {
    if (!USE_DUTY_TRACKER) return 0;
    let held;
    try {
      held = await DutyTracker.drain();
    } catch {
      return 0; // An older APK, or the service never ran. Nothing to take.
    }
    const owner = ownerRef.current;
    // APK 1.5 hands over what it noted as well, each with its own key.
    const events = (Array.isArray(held?.events) ? held.events : [])
      .map((event) => heldEventEntry(event, { owner, makeKey: newClientKey }))
      .filter(Boolean);
    if (events.length) enqueueEvents(events);
    const fixes = Array.isArray(held?.locations) ? held.locations : [];
    setHeld(fixes.length);
    // Android killed and restarted the service. The first fix after that says
    // the tracking came back, so the day shows a restart where it used to show
    // a hole -- and the stretch across it is no longer thrown away. APK 1.5
    // says so itself.
    const restarted = Boolean(held?.restarted) && !capsRef.current.nativeUpload;
    if (!fixes.length) {
      if (restarted) restartPendingRef.current = true;
      return 0;
    }
    const { level, charging } = await batteryState();
    const entries = fixes
      .map((fix) => heldFixEntry(fix, { owner, level, charging, makeKey: newClientKey }))
      .filter(Boolean);
    if (restarted && entries.length) {
      recordEvent("tracker_started", {
        at: Date.parse(entries[0].timestamp),
        position: entries[0],
      });
    }
    // Whole: the tracker may hand over more than the queue's usual cap.
    setQueued(enqueueHandover(entries));
    return fixes.length;
  }, [recordEvent]);

  /**
   * Whether our tracker is still running, asked every cycle.
   *
   * Nothing told the page when it stopped. APK 1.4.1 stops itself on the first
   * fix of a duty that follows one which never reached its own end -- a
   * reboot, a force-stop -- and the page went on saying "Recording in the
   * background" with not one fix behind it, while the office read a green
   * Login. So it is asked, and a tracker that stopped without being told to is
   * recorded as stopped and started again: as a resume, with no Login
   * boundary, because there was none.
   *
   * Left alone past sixteen hours. That is the tracker's own rule, and the
   * server's, for a duty nobody closed.
   *
   * Returns what the tracker said, or null.
   */
  const checkTracker = useCallback(async () => {
    if (!dutyTrackerRef.current) return null;
    const generation = trackerGenerationRef.current;
    let state;
    try {
      state = await within(DutyTracker.state(), PLUGIN_WAIT_MS);
    } catch {
      return null;
    }
    // Stopped or started again while we were asking: the answer is about a
    // tracker that is no longer this one.
    if (!state || generation !== trackerGenerationRef.current || !dutyTrackerRef.current) {
      return null;
    }
    if (state.wanted !== false) {
      aliveAtRef.current = Date.now();
      return state;
    }
    if (pastDutyLimit(sessionRef.current.startedAt)) return state;
    // Once per outage: until a fix arrives, a tracker still down is the same stop.
    if (!restartPendingRef.current) {
      recordEvent("tracker_stopped", { at: aliveAtRef.current || Date.now() });
    }
    restartPendingRef.current = true;
    restartTrackerRef.current?.();
    return state;
  }, [recordEvent]);

  /** Is the phone's Location switched on? Asked every cycle, where the tracker does not say. */
  const checkLocationSwitch = useCallback(async () => {
    if (!CAN_ASK_LOCATION || !pageWatchesLocation()) return;
    let seen = null;
    try {
      const answer = await within(Geolocation.checkPermissions(), PLUGIN_WAIT_MS);
      if (answer) seen = "on";
    } catch (e) {
      if (saysLocationIsOff(e)) seen = "off";
    }
    if (runningRef.current) noteLocation(seen);
  }, [noteLocation, pageWatchesLocation]);

  /**
   * APK 1.5's outbox, taken over by this page -- only when the phone's own
   * uploader is being refused while the page is plainly getting through (see
   * shouldTakeOver). Its fixes and events keep their keys, so anything the
   * phone did manage to send is recognised by the server, not stored twice.
   */
  const takeOverFromTracker = useCallback(
    async (state) => {
      const now = Date.now();
      if (waitingInTracker(state) <= 0) {
        trackerWaitingSinceRef.current = null;
      } else if (trackerWaitingSinceRef.current == null) {
        trackerWaitingSinceRef.current = now;
      }
      const due = shouldTakeOver({
        state,
        now,
        waitingSince: trackerWaitingSinceRef.current,
        jsSuccessAt: lastSuccessAt(),
      });
      if (!due) return false;
      trackerWaitingSinceRef.current = null;
      await drainNativeBuffer();
      return true;
    },
    [drainNativeBuffer],
  );

  const sendPing = useCallback(async () => {
    // One cycle per interval, whichever of the timer or a fix starts it.
    lastSendAtRef.current = Date.now();
    const nativeSends = dutyTrackerRef.current && capsRef.current.nativeUpload;

    // WHATEVER THE SERVICE IS HOLDING, EVERY CYCLE.
    //
    // It was collected only when duty started, on the assumption that the
    // service holds fixes solely while the app is dead. It does not: anything
    // taken before the app has bound to it goes to the same place, and on the
    // first phone this ran on the app sat at "waiting for GPS" while the
    // service quietly filled up. Called every cycle it costs one plugin call
    // that almost always returns nothing.
    //
    // Waited for (briefly), so what it held is queued before the queue goes.
    // Not while APK 1.5 sends for itself: taking its fixes would make this page
    // the sender of positions it may never get to send.
    if (!nativeSends) await within(drainNativeBuffer(), PLUGIN_WAIT_MS);

    const trackerState = await checkTracker();
    await checkLocationSwitch();

    // Nothing goes with nobody signed in. Fixes keep being queued meanwhile,
    // and go once the engineer signs in again.
    const userId = signedInUserId();
    if (userId == null) return;

    // APK 1.5 sends for itself. This page takes over its outbox only when the
    // phone's uploader is being refused and the page is getting through.
    if (nativeSends) await takeOverFromTracker(trackerState);

    // Events first, then the queue, then the newest fix.
    //
    // The page's own queues go on APK 1.5 too: what a Logout could not send,
    // what an older APK left, what a takeover had no time for, the page's own
    // notes. Nobody else will ever send them, and the fixes among them are
    // older than anything in the tracker's outbox, so they overtake nothing.
    // The heartbeat is the tracker's own there.
    const heartbeat =
      runningRef.current &&
      !nativeSends &&
      recordingRef.current &&
      trackerState?.wanted !== false &&
      gpsStateRef.current !== "off";
    const { fixesMayGo } = await sendEvents(userId, { heartbeat });
    if (!fixesMayGo) return;
    await drainQueue(userId);
    // The newest fix is the tracker's to send on APK 1.5.
    if (nativeSends) return;

    const fix = latestRef.current;
    if (!fix) return;
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return; // too noisy
    // Somebody else's duty, on a phone another user has signed in to: left for
    // its owner. It is queued like any other fix when the next one replaces it.
    if (!belongsTo(fix, userId)) return;

    // Sent on its own, so the next kept fix is measured from here -- otherwise
    // the one right behind it would be queued as well and the server would
    // hold the same second twice.
    lastKeptRef.current = fix;
    const attemptedAt = Date.now();
    try {
      await trackingService.ping(fix);
      noteOutcome("ok", attemptedAt);
      setError(null);
    } catch (e) {
      noteOutcome(requestOutcome(e), attemptedAt);
      // The fix is not lost. It goes to the queue with the time it was TAKEN and
      // its own id, so when the signal comes back the route fills in behind the
      // engineer instead of showing a hole where they were.
      const total = enqueue(fix);
      setQueued(total);
      setError(e?.response?.data?.detail || "No signal - saved on the phone");
    }
  }, [
    checkLocationSwitch,
    checkTracker,
    drainNativeBuffer,
    drainQueue,
    noteOutcome,
    sendEvents,
    takeOverFromTracker,
  ]);

  /**
   * Every source funnels through here, so the cadence and the "report the first
   * fix at once" rule are the same wherever the position came from.
   *
   * The fix is stamped HERE, not at send time. A fix that spends twenty minutes
   * in the queue has to arrive saying when it was taken, or the route is drawn
   * in the order the network recovered rather than the order it was travelled.
   * The id is minted here for the same reason: a retry must be the same fix, not
   * a second one.
   *
   * And stamped with the time the plugin says it was TAKEN, not the time this
   * ran -- a phone in a pocket hands over a backlog of callbacks at once. See
   * fixTakenAt.
   */
  const acceptFix = useCallback(
    async (raw) => {
      const isFirstFix = latestRef.current == null;
      const takenAt = fixTakenAt(raw.time);
      const { level, charging } = await batteryState();
      const afterGap = loginBoundaryRef.current;
      loginBoundaryRef.current = false;

      const fix = {
        latitude: raw.latitude,
        longitude: raw.longitude,
        accuracy: raw.accuracy,
        speed: raw.speed,
        // The first fix after a Login: what came before it was not this duty.
        after_gap: afterGap,
        status: statusRef.current,
        case_id: caseIdRef.current,
        timestamp: new Date(takenAt).toISOString(),
        // APK 1.5 names each fix itself; keeping its name keeps one fix one row.
        client_key: raw.client_key || newClientKey(),
        battery_level: level,
        is_charging: charging,
        // Whose duty this is, so that only they ever send it.
        owner: ownerRef.current,
      };
      aliveAtRef.current = Date.now();
      recordingRef.current = true;
      // On screen, it also says when the page GOT it, on the phone's own clock:
      // what a punch judges "a recent position" by (seenWithin). Never sent.
      const shown = { ...fix, seen_at: aliveAtRef.current };
      if (restartPendingRef.current) {
        restartPendingRef.current = false;
        recordEvent("tracker_started", { at: takenAt, position: fix });
      }
      // A fix TAKEN after Location was found off is proof it is on again.
      if (gpsStateRef.current === "off" && takenAt > gpsOffAtRef.current && pageWatchesLocation()) {
        noteLocation("on", { at: takenAt, position: fix });
      }

      // APK 1.5 sends this fix itself. Here it is for the screen only.
      if (dutyTrackerRef.current && capsRef.current.nativeUpload) {
        latestRef.current = fix;
        setLastFix(shown);
        return;
      }

      // THE FIX WE ARE ABOUT TO REPLACE.
      //
      // Only the newest was ever sent, so everything the phone reported between
      // two sends was dropped -- and with it the shape of the road between
      // them. Kept now if it is far enough, in time and in metres, from the
      // last one we kept. It goes in the queue rather than straight out: the
      // queue is drained at the start of every send, so it arrives in the same
      // request as the newest fix, in travel order, and costs nothing extra.
      const replacing = latestRef.current;
      const anchor = lastKeptRef.current;
      const spacedEnough =
        !anchor ||
        (Date.parse(replacing.timestamp) - Date.parse(anchor.timestamp) >= MIN_KEEP_GAP_MS &&
          metresApart(replacing, anchor) >= MIN_KEEP_METERS);
      const inOrder = Date.parse(fix.timestamp) >= Date.parse(replacing?.timestamp ?? 0);
      if (replacing && replacing !== anchor && inOrder && spacedEnough) {
        lastKeptRef.current = replacing;
        setQueued(enqueue(replacing));
      }

      latestRef.current = fix;
      setLastFix(shown);

      // Waiting a full interval left an engineer who just went on duty invisible
      // on the live board for 30s, which reads as "duty didn't work".
      if (isFirstFix) {
        void sendPing();
        return;
      }

      // Send from HERE as well as from the timer. Android throttles a
      // backgrounded WebView's timers - which is exactly when the phone is in a
      // pocket and the route matters most - but it does not throttle a callback
      // arriving from a native service. Without this the fixes were taken and
      // never sent.
      if (Date.now() - lastSendAtRef.current >= PING_INTERVAL_MS) {
        void sendPing();
      }
    },
    [noteLocation, pageWatchesLocation, recordEvent, sendPing],
  );


  const clearSources = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (nativeWatcherRef.current != null) {
      const id = nativeWatcherRef.current;
      nativeWatcherRef.current = null;
      void BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
    }
    // Whatever our tracker answers from here on is about one that has gone.
    trackerGenerationRef.current += 1;
    if (dutyTrackerRef.current) {
      dutyTrackerRef.current = false;
      // Takes the notification down with it. Off duty is off duty: the whole
      // point of a service that survives the app is that only this stops it.
      void DutyTracker.stop().catch(() => {});
    }
    // A start still in flight must not leave an orphaned foreground service
    // sitting in the notification tray after the engineer has gone off duty.
    nativeStartingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * The community background-geolocation watcher: the way this worked before
   * our own tracker existed, and still the fallback for any phone or any
   * moment where ours will not start.
   */
  const startCommunityWatcher = useCallback(() => {
    nativeStartingRef.current = true;
    BackgroundGeolocation.addWatcher(
      {
        // Naming the notification is what switches the plugin from
        // foreground-only to a real foreground service. Without it, Android
        // suspends us exactly like it suspends the browser.
        backgroundTitle: "On duty",
        backgroundMessage: "Recording your route. Tap Logout in the app when your day ends.",
        requestPermissions: true,
        stale: false,
        distanceFilter: NATIVE_DISTANCE_FILTER_M,
      },
      (position, watcherError) => {
        if (watcherError) {
          // "Location services disabled." is said once, as the watcher is
          // added -- which it is anyway, and fixes resume when Location comes
          // back on. Noted, so the dark stretch reads as Location switched off.
          // Anything else -- a refused permission above all -- leaves the
          // watcher added and nothing coming from it: not recording.
          if (saysLocationIsOff(watcherError)) noteLocation("off");
          else recordingRef.current = false;
          setError(watcherError.message || "Unable to get location");
          return;
        }
        if (!position) return;
        acceptFix({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          speed: position.speed,
          time: position.time,
        });
      },
    )
      .then((id) => {
        // Stopped while we were starting: shut the service straight back down.
        if (!nativeStartingRef.current) {
          void BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
          return;
        }
        nativeStartingRef.current = false;
        nativeWatcherRef.current = id;
        setSource("plugin");
      })
      .catch((e) => {
        nativeStartingRef.current = false;
        recordingRef.current = false;
        setSource(null);
        setError(e?.message || "Could not start background tracking");
      });
  }, [acceptFix, noteLocation]);

  /**
   * OURS WOULD NOT START -- so use the one that always did.
   *
   * Android can refuse a foreground service, a permission can be withdrawn, a
   * phone's own battery rules can say no. Whatever the reason, the engineer
   * must not be left with nothing: without this the first phone it was
   * installed on had no notification and recorded not one metre.
   *
   * The refusal arrives in the tracker's callback, not its promise -- Capacitor
   * resolves a callback method's promise whatever the phone answers -- so it is
   * caught there, and only before the first fix: no permission, or a service
   * Android would not start. Ours is stopped first: APK 1.4.1 has already
   * marked itself wanted by the time it refuses, and would otherwise come back
   * on its own beside the watcher.
   */
  const fallBackToCommunityWatcher = useCallback(
    (reason) => {
      dutyTrackerRef.current = false;
      trackerGenerationRef.current += 1;
      const generation = trackerGenerationRef.current;
      setSource(null);
      console.warn("DutyTracker would not start; falling back", reason);
      void DutyTracker.stop()
        .catch(() => {})
        .then(() => {
          if (generation === trackerGenerationRef.current && runningRef.current) {
            startCommunityWatcher();
          }
        });
    },
    [startCommunityWatcher],
  );

  /**
   * The app's own tracker: a started foreground service, so it is still
   * reporting after the app is swiped away, and it holds what it takes while
   * the app is gone. APK 1.5's also sends what it takes, by itself.
   *
   * Returns how many held fixes were collected on the way (old path only).
   */
  const startDutyTracker = useCallback(
    async ({ fresh }) => {
      trackerGenerationRef.current += 1;
      const generation = trackerGenerationRef.current;
      dutyTrackerRef.current = true;
      trackerFixSeenRef.current = false;
      aliveAtRef.current = Date.now();
      const caps = await trackerCapabilities();
      // Stopped, or started again, while the phone was saying what it can do.
      if (generation !== trackerGenerationRef.current || !dutyTrackerRef.current) return 0;
      capsRef.current = caps;
      const options = {
        title: "On duty",
        text: "Recording your route. Tap Logout in the app when your day ends.",
        distanceFilter: NATIVE_DISTANCE_FILTER_M,
        interval: PING_INTERVAL_MS,
      };
      if (caps.nativeUpload) {
        // Everything it needs to send as the engineer, for this duty.
        Object.assign(options, uploaderAuth(ownerRef.current), {
          fresh: Boolean(fresh),
          sessionId: sessionRef.current.id,
          sessionStartedAt: sessionRef.current.startedAt,
          caseId: caseIdRef.current,
          status: statusRef.current,
        });
      }
      DutyTracker.start(options, (position, watcherError) => {
        // From a start that has since been stopped or replaced.
        if (generation !== trackerGenerationRef.current) return;
        if (watcherError) {
          if (!saysLocationIsOff(watcherError)) recordingRef.current = false;
          if (!trackerFixSeenRef.current && isStartRefusal(watcherError)) {
            fallBackToCommunityWatcher(watcherError);
            return;
          }
          setError(watcherError.message || "Unable to get location");
          return;
        }
        if (!position) return;
        trackerFixSeenRef.current = true;
        acceptFix({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          speed: position.speed,
          time: position.time,
          client_key: position.client_key,
        });
      })
        .then(() => {
          if (generation === trackerGenerationRef.current && dutyTrackerRef.current) {
            setSource("app");
          }
        })
        .catch((e) => {
          // The call itself failed -- the same answer as a refusal.
          if (generation === trackerGenerationRef.current) {
            recordingRef.current = false;
            fallBackToCommunityWatcher(e);
          }
        });
      // Anything it held -- taken before we bound to it, or while the app was
      // gone -- is collected right now. Not from APK 1.5, which sends it.
      return caps.nativeUpload ? 0 : drainNativeBuffer();
    },
    [acceptFix, drainNativeBuffer, fallBackToCommunityWatcher],
  );

  useEffect(() => {
    restartTrackerRef.current = () => startDutyTracker({ fresh: false });
  }, [startDutyTracker]);

  /**
   * `fresh` is a Login: a new duty, whose first fix marks where it began.
   * Without it this is the same duty carrying on, and nothing about the route
   * is cut. `pageLoad` is that duty found open as the page loads -- the app
   * reopened, or reloaded by the phone -- which is noted as such.
   */
  const start = useCallback(
    (
      caseId = null,
      status = "",
      { fresh = false, pageLoad = false, sessionId = null, sessionStartedAt = null } = {},
    ) => {
      // ONLY THE ENGINEER'S OWN APP MAY REPORT AN ENGINEER'S POSITION.
      //
      // Anyone signed in as an engineer used to be tracked as that engineer.
      // The office opened one engineer's account in a desktop browser, two
      // hundred and fifty kilometres away, to see what the engineer sees --
      // and the page dutifully posted the OFFICE LAPTOP'S position as his.
      // His day drew a straight line from Hosur to the coast and read 519 km
      // for a man who never left Hosur. Kilometres feed allowances, so that
      // is money, not just a wrong map.
      //
      // A browser cannot be the engineer's phone, so it does not get to speak
      // for one. Said out loud rather than ignored: an engineer who somehow
      // opens the site in Chrome must know why their route is not recording.
      if (!IS_NATIVE) {
        setError("Location is recorded only in the RTPL app. Please open the app.");
        return;
      }
      if (!("geolocation" in navigator)) {
        setError("Geolocation is not supported by this device.");
        return;
      }
      setContext(caseId, status);
      setError(null);
      // Before anything starts: the notification Android insists on is only
      // visible if it has been allowed, and it is what the engineer reads to
      // know they are being tracked.
      void askToShowTheNotification();

      // Guard against a double-start (e.g. Start Duty then Start Travel) leaving
      // an orphaned watch/interval that would double-send pings and leak.
      clearSources();

      // WHOSE DUTY THIS IS, read once, now: the user signed in as it starts.
      // Everything it queues carries them, and only they ever send it.
      ownerRef.current = signedInUserId();
      sessionRef.current = { id: sessionId, startedAt: sessionStartedAt };
      restartPendingRef.current = false;
      // A recorder starting is taken at its word until it says otherwise: a
      // phone standing still may not report a fix for a long while.
      recordingRef.current = true;
      // One Login per duty: the same duty started again is the duty carrying on.
      const login = fresh && !loginAlreadyMarked(sessionId);
      if (login) {
        markLogin(sessionId);
        // Set BEFORE the watcher is registered: a cached position can arrive
        // in the same tick. And a new duty starts knowing nothing about the
        // phone -- yesterday's Location or network is not today's.
        loginBoundaryRef.current = true;
        gpsStateRef.current = "unknown";
        netStateRef.current = "unknown";
      } else {
        // A reload in the middle of an outage carries on with it, so the
        // outage still closes when the signal comes back.
        netStateRef.current = netStateFromQueue(ownedBy(loadEvents(), ownerRef.current));
      }
      runningRef.current = true;

      let started = Promise.resolve(0);
      if (USE_DUTY_TRACKER) {
        // The app's own tracker; anything it held is collected as it starts.
        started = startDutyTracker({ fresh: login });
      } else if (IS_NATIVE) {
        startCommunityWatcher();
      } else {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) =>
            acceptFix({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
            }),
          (err) => setError(err.message || "Unable to get location"),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
      }

      // The first fix pings immediately (above); after that, a fixed cadence.
      intervalRef.current = setInterval(sendPing, PING_INTERVAL_MS);
      setTracking(true);
      if (!IS_NATIVE) setSource("browser");

      // A page load in the middle of a duty: the app was reopened, or the phone
      // reloaded it. Said, so the stretch with no positions before it reads as
      // the app having been closed -- not as nothing at all.
      if (pageLoad) {
        void started.then((count) => noteAppOpened(count > 0 ? `held ${count}` : "reload"));
      }
    },
    [
      acceptFix,
      clearSources,
      noteAppOpened,
      sendPing,
      setContext,
      startCommunityWatcher,
      startDutyTracker,
    ],
  );

  /**
   * LOGOUT: whatever is still on the phone goes now.
   *
   * Otherwise it waited for the next duty's first send -- after the evening's
   * report, after the day's route was stored, and past the server's 48 hours
   * when the next duty is after a Sunday. The tracker is already stopped, so
   * what it holds is final: taken, queued with its keys, and sent, events first.
   */
  const flushLeftovers = useCallback(
    async (newest) => {
      for (let round = 0; round < MAX_DRAIN_ROUNDS; round += 1) {
        if (!(await within(drainNativeBuffer(), PLUGIN_WAIT_MS))) break;
      }
      // The newest fix may not have gone yet. If it has, the server knows its
      // key and skips it.
      if (newest && !(newest.accuracy > MAX_ACCURACY_M)) setQueued(enqueue(newest));
      const userId = signedInUserId();
      if (userId == null) return;
      for (let round = 0; round < MAX_FLUSH_ROUNDS; round += 1) {
        if (!ownedBy(loadEvents(), userId).length) break;
        const { delivered, fixesMayGo } = await sendEvents(userId, { heartbeat: false });
        if (!fixesMayGo) return;
        if (!delivered) break;
      }
      for (let round = 0; round < MAX_FLUSH_ROUNDS; round += 1) {
        if (!ownedBy(loadQueue(), userId).length) break;
        if (!(await drainQueue(userId))) break;
      }
    },
    [drainNativeBuffer, drainQueue, sendEvents],
  );

  /** Off duty. `endOfDuty` is a Logout: what is left on the phone is sent now. */
  const stop = useCallback(
    ({ endOfDuty = false } = {}) => {
      const newest = latestRef.current;
      clearSources();
      runningRef.current = false;
      loginBoundaryRef.current = false;
      setTracking(false);
      if (endOfDuty) void flushLeftovers(newest);
    },
    [clearSources, flushLeftovers],
  );

  // Clean up if the component unmounts while still tracking.
  useEffect(() => stop, [stop]);

  // Coming back to the app while on duty. Said for the same reason as a reload:
  // a stretch with no positions behind it was the app away, not nothing.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !runningRef.current) return;
      const canDrain = USE_DUTY_TRACKER && !(dutyTrackerRef.current && capsRef.current.nativeUpload);
      void (canDrain ? drainNativeBuffer() : Promise.resolve(0)).then((count) =>
        noteAppOpened(count > 0 ? `held ${count}` : "resumed"),
      );
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [drainNativeBuffer, noteAppOpened]);

  // APK 1.5 holds its own copy of the tokens to send with. A refresh hands it
  // the new ones. Signing out -- or somebody else signing in on this phone --
  // takes them away, and the tracker then keeps what it takes until its owner
  // is back.
  useEffect(() => {
    if (!USE_DUTY_TRACKER) return undefined;
    const onAuthChanged = () => {
      void trackerCapabilities().then((caps) => {
        if (!caps.nativeUpload) return;
        const userId = signedInUserId();
        const owner = ownerRef.current;
        if (userId != null && owner != null && String(userId) === String(owner)) {
          if (!dutyTrackerRef.current) return;
          DutyTracker.configure({
            ...uploaderAuth(owner),
            sessionId: sessionRef.current.id,
            sessionStartedAt: sessionRef.current.startedAt,
          }).catch(() => {});
        } else if (userId == null || owner != null) {
          DutyTracker.configure({ access: null, refresh: null }).catch(() => {});
        }
      });
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  return { tracking, lastFix, error, queued, held, source, start, stop, setContext };
}
