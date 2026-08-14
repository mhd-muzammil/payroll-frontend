import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { trackingService } from "../services/trackingService";

const PING_INTERVAL_MS = 30000; // send a position every 30s while on duty
const MAX_ACCURACY_M = 100; // drop noisy readings worse than this
// Metres of movement before Android bothers us again. Zero would report
// constantly while an engineer stands still and drain the battery for nothing;
// the 30s ping keeps re-sending the last fix either way, so the office still
// sees them alive and standing where they are.
const NATIVE_DISTANCE_FILTER_M = 10;

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

  const watchIdRef = useRef(null); // browser watchPosition id
  const nativeWatcherRef = useRef(null); // foreground service watcher id
  // Set while addWatcher is in flight, so a stop() that lands first is not lost.
  const nativeStartingRef = useRef(false);
  const intervalRef = useRef(null);
  const latestRef = useRef(null);
  // Kept in refs so the running interval always reads current values.
  const caseIdRef = useRef(null);
  const statusRef = useRef("");

  const setContext = useCallback((caseId, status) => {
    caseIdRef.current = caseId ?? null;
    statusRef.current = status ?? "";
  }, []);

  const sendPing = useCallback(async () => {
    const fix = latestRef.current;
    if (!fix) return;
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return; // too noisy
    try {
      await trackingService.ping({
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        speed: fix.speed,
        status: statusRef.current,
        case_id: caseIdRef.current,
      });
    } catch (e) {
      // A single failed ping shouldn't stop tracking; surface it and keep going.
      setError(e?.response?.data?.detail || "Failed to send location");
    }
  }, []);

  // Every source funnels through here, so the ping cadence and the "report the
  // first fix at once" rule are the same wherever the position came from.
  const acceptFix = useCallback(
    (fix) => {
      const isFirstFix = latestRef.current == null;
      latestRef.current = fix;
      setLastFix(fix);
      // Waiting a full interval left an engineer who just went on duty invisible
      // on the live board for 30s, which reads as "duty didn't work".
      if (isFirstFix) void sendPing();
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
            backgroundMessage: "Recording your route until you tap Stop Duty.",
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

  return { tracking, lastFix, error, start, stop, setContext };
}
