import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { trackingService } from "../services/trackingService";
import { enqueue, forget, loadQueue, newClientKey } from "../Utility/pingQueue";
import { batteryState } from "../Utility/phoneBattery";

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

// Registered by hand because the plugin ships only its native halves and type
// definitions — there is no JS entry point to import.
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
// Our own tracker, in the APK from version 1.4. It keeps reporting after the
// app is swiped off the recents list, which the community plugin cannot: its
// service is bound only, so the swipe destroys it and the engineer's drive home
// goes unmeasured. See android/app/src/main/java/in/systimus/payroll/.
const DutyTracker = registerPlugin("DutyTracker");
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
 */
export function useLiveTracking() {
  const [tracking, setTracking] = useState(false);
  const [lastFix, setLastFix] = useState(null); // {latitude, longitude, accuracy, speed}
  const [error, setError] = useState(null);
  // Set the moment the OS stops giving us positions -- the engineer switched
  // their phone's location off, or withdrew the permission -- and carried until
  // the next fix arrives, which is then stamped `after_gap`. That stamp is the
  // only way the server can tell an untracked leg from an engineer who simply
  // stood still: both produce no new rows, and they have to be counted
  // oppositely.
  const stoppedTrackingRef = useRef(false);
  // Whether our own tracker is the one running, so stopping shuts down the one
  // that was actually started.
  const dutyTrackerRef = useRef(false);
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
  }, []);

  /**
   * Hand over whatever the phone could not send earlier.
   *
   * Runs BEFORE the newest fix, so a recovered signal fills the route in in
   * travel order rather than putting the current position ahead of the journey
   * that led to it.
   *
   * Failure is silent on purpose. Still offline is not news — the engineer is
   * being told that by the fix that is about to be queued behind it.
   */
  const drainQueue = useCallback(async () => {
    const pending = loadQueue();
    if (!pending.length) return;
    const batch = pending.slice(0, MAX_BATCH);
    try {
      await trackingService.pingBatch(batch);
      // By key, not by count: the watcher may have added fixes while the request
      // was in flight, and dropping "the first N" would throw those away.
      forget(batch.map((fix) => fix.client_key));
      setQueued(loadQueue().length);
    } catch {
      // Still no signal. The fixes stay where they are.
    }
  }, []);

  /**
   * Take the fixes the phone held while the app was gone, and queue them.
   *
   * Each carries the time it was TAKEN, so the kilometres land on the day they
   * were driven rather than on the moment the app happened to be opened. They
   * go straight into the send queue -- which is stored on the phone too -- so
   * the handover from native is the moment responsibility passes, and nothing
   * is held in two places waiting to be sent twice.
   */
  const drainNativeBuffer = useCallback(async () => {
    if (!USE_DUTY_TRACKER) return;
    let held;
    try {
      held = await DutyTracker.drain();
    } catch {
      return; // An older APK, or the service never ran. Nothing to take.
    }
    const fixes = Array.isArray(held?.locations) ? held.locations : [];
    setHeld(fixes.length);
    if (!fixes.length) {
      // Android killed and restarted the service with nothing held: whatever
      // happened across that hole was never seen, so the next fix says so.
      if (held?.restarted) stoppedTrackingRef.current = true;
      return;
    }
    const { level, charging } = await batteryState();
    let total = 0;
    fixes.forEach((fix, index) => {
      total = enqueue({
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy ?? null,
        speed: fix.speed ?? null,
        // Only the first, and only after a restart. The rest are one journey
        // the phone watched the whole way through, so joining them is not a
        // guess -- it is what happened.
        after_gap: index === 0 && Boolean(held?.restarted),
        status: "",
        case_id: null,
        timestamp: new Date(fix.time).toISOString(),
        client_key: newClientKey(),
        battery_level: level,
        is_charging: charging,
      });
    });
    setQueued(total);
    // The journey continued while the app was away, so the next live fix is
    // not the far side of a hole and must not skip its segment.
    stoppedTrackingRef.current = false;
    void drainQueue();
  }, [drainQueue]);

  const sendPing = useCallback(async () => {
    // WHATEVER THE SERVICE IS HOLDING, EVERY CYCLE.
    //
    // It was collected only when duty started, on the assumption that the
    // service holds fixes solely while the app is dead. It does not: anything
    // taken before the app has bound to it goes to the same place, and on the
    // first phone this ran on the app sat at "waiting for GPS" while the
    // service quietly filled up. Called every cycle it costs one plugin call
    // that almost always returns nothing.
    void drainNativeBuffer();

    const fix = latestRef.current;
    if (!fix) return;
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return; // too noisy

    await drainQueue();

    lastSendAtRef.current = Date.now();
    // Sent on its own, so the next kept fix is measured from here -- otherwise
    // the one right behind it would be queued as well and the server would
    // hold the same second twice.
    lastKeptRef.current = fix;
    try {
      await trackingService.ping(fix);
      setError(null);
    } catch (e) {
      // The fix is not lost. It goes to the queue with the time it was TAKEN and
      // its own id, so when the signal comes back the route fills in behind the
      // engineer instead of showing a hole where they were.
      const total = enqueue(fix);
      setQueued(total);
      setError(e?.response?.data?.detail || "No signal - saved on the phone");
    }
  }, [drainQueue, drainNativeBuffer]);

  /**
   * Every source funnels through here, so the cadence and the "report the first
   * fix at once" rule are the same wherever the position came from.
   *
   * The fix is stamped HERE, not at send time. A fix that spends twenty minutes
   * in the queue has to arrive saying when it was taken, or the route is drawn
   * in the order the network recovered rather than the order it was travelled.
   * The id is minted here for the same reason: a retry must be the same fix, not
   * a second one.
   */
  const acceptFix = useCallback(
    async (raw) => {
      const isFirstFix = latestRef.current == null;
      const { level, charging } = await batteryState();
      const afterGap = stoppedTrackingRef.current;
      stoppedTrackingRef.current = false;

      const fix = {
        latitude: raw.latitude,
        longitude: raw.longitude,
        accuracy: raw.accuracy,
        speed: raw.speed,
        // Whatever happened between the last fix and this one was not tracked.
        after_gap: afterGap,
        status: statusRef.current,
        case_id: caseIdRef.current,
        timestamp: new Date().toISOString(),
        client_key: newClientKey(),
        battery_level: level,
        is_charging: charging,
      };
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
      setLastFix(fix);

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
    [sendPing],
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
          stoppedTrackingRef.current = true;
          setError(watcherError.message || "Unable to get location");
          return;
        }
        if (!position) return;
        acceptFix({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          speed: position.speed,
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
        setSource(null);
        setError(e?.message || "Could not start background tracking");
      });
  }, [acceptFix]);

  const start = useCallback(
    (caseId = null, status = "") => {
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

      // Coming on duty is a boundary too. Whatever the engineer covered while
      // off duty is not travel this session measured, so the first fix of a
      // session is stamped the same way rather than being joined to the last
      // fix of the previous one. Set BEFORE the watcher is registered: a cached
      // position can arrive in the same tick.
      stoppedTrackingRef.current = true;

      if (USE_DUTY_TRACKER) {
        // The app's own tracker: a started foreground service, so it is still
        // reporting after the app is swiped away, and it holds what it takes
        // while the app is gone. Anything it held is collected right now.
        dutyTrackerRef.current = true;
        DutyTracker.start(
          {
            title: "On duty",
            text: "Recording your route. Tap Logout in the app when your day ends.",
            distanceFilter: NATIVE_DISTANCE_FILTER_M,
            interval: PING_INTERVAL_MS,
          },
          (position, watcherError) => {
            if (watcherError) {
              stoppedTrackingRef.current = true;
              setError(watcherError.message || "Unable to get location");
              return;
            }
            if (!position) return;
            acceptFix({
              latitude: position.latitude,
              longitude: position.longitude,
              accuracy: position.accuracy,
              speed: position.speed,
            });
          },
        )
          .then(() => setSource("app"))
          .catch((e) => {
            // OURS WOULD NOT START -- so use the one that always did.
            //
            // Android can refuse a foreground service, a permission can be
            // withdrawn, a phone's own battery rules can say no. Whatever the
            // reason, the engineer must not be left with nothing: without this
            // the first phone it was installed on had no notification and
            // recorded not one metre.
            dutyTrackerRef.current = false;
            console.warn("DutyTracker would not start; falling back", e);
            startCommunityWatcher();
          });
        void drainNativeBuffer();
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
          (err) => {
            stoppedTrackingRef.current = true;
            setError(err.message || "Unable to get location");
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
      }

      // The first fix pings immediately (above); after that, a fixed cadence.
      intervalRef.current = setInterval(sendPing, PING_INTERVAL_MS);
      setTracking(true);
      if (!IS_NATIVE) setSource("browser");
    },
    [acceptFix, clearSources, drainNativeBuffer, sendPing, setContext, startCommunityWatcher],
  );

  const stop = useCallback(() => {
    clearSources();
    setTracking(false);
  }, [clearSources]);

  // Clean up if the component unmounts while still tracking.
  useEffect(() => stop, [stop]);

  return { tracking, lastFix, error, queued, held, source, start, stop, setContext };
}
