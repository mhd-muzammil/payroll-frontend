import { useCallback, useEffect, useRef, useState } from "react";
import { trackingService } from "../services/trackingService";

const PING_INTERVAL_MS = 30000; // send a position every 30s while on duty
const MAX_ACCURACY_M = 100; // drop noisy readings worse than this

/**
 * Live location sender for a field engineer. Works only while the app/tab is
 * open (no background plugin). Start it when the engineer goes on duty; it uses
 * the browser Geolocation API (free) and posts the latest good fix to the
 * backend every PING_INTERVAL_MS. Optionally tag each ping with the active
 * case + a working status.
 */
export function useLiveTracking() {
  const [tracking, setTracking] = useState(false);
  const [lastFix, setLastFix] = useState(null); // {latitude, longitude, accuracy, speed}
  const [error, setError] = useState(null);

  const watchIdRef = useRef(null);
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

  const start = useCallback(
    (caseId = null, status = "") => {
      if (!("geolocation" in navigator)) {
        setError("Geolocation is not supported by this device.");
        return;
      }
      setContext(caseId, status);
      setError(null);

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const fix = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
          };
          latestRef.current = fix;
          setLastFix(fix);
        },
        (err) => setError(err.message || "Unable to get location"),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );

      // First ping fires as soon as a fix arrives; then on a fixed cadence.
      intervalRef.current = setInterval(sendPing, PING_INTERVAL_MS);
      setTracking(true);
    },
    [sendPing, setContext]
  );

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
  }, []);

  // Clean up if the component unmounts while still tracking.
  useEffect(() => stop, [stop]);

  return { tracking, lastFix, error, start, stop, setContext };
}
