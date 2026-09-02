import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
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

// Registered by hand because the plugin ships only its native halves and type
// definitions — there is no JS entry point to import.
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
const IS_NATIVE = Capacitor?.isNativePlatform?.() ?? false;

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
  // How many fixes are waiting on the phone. Surfaced so the duty screen can say
  // "12 saved, will send when you have signal" instead of looking broken.
  const [queued, setQueued] = useState(() => loadQueue().length);

  const watchIdRef = useRef(null); // browser watchPosition id
  const nativeWatcherRef = useRef(null); // foreground service watcher id
  // Set while addWatcher is in flight, so a stop() that lands first is not lost.
  const nativeStartingRef = useRef(false);
  const intervalRef = useRef(null);
  const latestRef = useRef(null);
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

  const sendPing = useCallback(async () => {
    const fix = latestRef.current;
    if (!fix) return;
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return; // too noisy

    await drainQueue();

    lastSendAtRef.current = Date.now();
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
  }, [drainQueue]);

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
      const fix = {
        latitude: raw.latitude,
        longitude: raw.longitude,
        accuracy: raw.accuracy,
        speed: raw.speed,
        status: statusRef.current,
        case_id: caseIdRef.current,
        timestamp: new Date().toISOString(),
        client_key: newClientKey(),
        battery_level: level,
        is_charging: charging,
      };
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
    // A start still in flight must not leave an orphaned foreground service
    // sitting in the notification tray after the engineer has gone off duty.
    nativeStartingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (caseId = null, status = "") => {
      if (!IS_NATIVE && !("geolocation" in navigator)) {
        setError("Geolocation is not supported by this device.");
        return;
      }
      setContext(caseId, status);
      setError(null);

      // Guard against a double-start (e.g. Start Duty then Start Travel) leaving
      // an orphaned watch/interval that would double-send pings and leak.
      clearSources();

      if (IS_NATIVE) {
        nativeStartingRef.current = true;
        BackgroundGeolocation.addWatcher(
          {
            // Naming the notification is what switches the plugin from
            // foreground-only to a real foreground service. Without it, Android
            // suspends us exactly like it suspends the browser.
            backgroundTitle: "On duty",
            backgroundMessage: "Recording your route. Tap Logout in the app when your day ends.",
            // The engineer has already been asked by the duty screen, so this is
            // normally a no-op; it is left on so a revoked permission is asked
            // for again instead of failing silently.
            requestPermissions: true,
            stale: false,
            distanceFilter: NATIVE_DISTANCE_FILTER_M,
          },
          (position, watcherError) => {
            if (watcherError) {
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
          })
          .catch((e) => {
            nativeStartingRef.current = false;
            setError(e?.message || "Could not start background tracking");
          });
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
    },
    [acceptFix, clearSources, sendPing, setContext],
  );

  const stop = useCallback(() => {
    clearSources();
    setTracking(false);
  }, [clearSources]);

  // Clean up if the component unmounts while still tracking.
  useEffect(() => stop, [stop]);

  return { tracking, lastFix, error, queued, start, stop, setContext };
}
