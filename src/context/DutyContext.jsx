import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { trackingService } from "../services/trackingService";
import { useLiveTracking } from "../customHook/useLiveTracking";
import { getUserRole, isAuthenticated, ROLES } from "../auth/rbac";

/**
 * Owns "am I on duty?" for the whole app.
 *
 * Duty is a state the engineer declares on the server, not a side effect of one
 * page being open. This provider sits ABOVE the router, so an engineer who taps
 * Start Duty on My Cases and then opens Attendance keeps sending their position
 * — previously the tracker lived inside the Cases screen and died the moment
 * they navigated away, while the badge still said they were on duty.
 *
 * The server is the source of truth: on load we ask whether a duty session is
 * open and resume the GPS stream if it is, so a refresh or a reopened tab does
 * not silently take the engineer off the live board.
 */

const DutyContext = createContext(null);

/** Marks the refusal so the caller can show the engineer's message, not an API one. */
function locationError(message) {
  const error = new Error(message);
  error.locationDenied = true;
  return error;
}

/**
 * Ask for a position before duty starts, and refuse duty if it does not come.
 *
 * Resolves only on a real fix — asking for permission is not enough, because a
 * granted permission with the phone's location switched off still never
 * produces one.
 */
function requireLocationPermission() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(locationError("This device cannot share its location, so duty cannot be tracked."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            locationError(
              "Location is blocked for this site. Allow location in your browser settings, then tap Start Duty again.",
            ),
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(
            locationError(
              "Your phone's location is switched off. Turn it on, then tap Start Duty again.",
            ),
          );
        } else {
          reject(
            locationError(
              "Could not get your location. Step outside or check your signal, then tap Start Duty again.",
            ),
          );
        }
      },
      // Generous: a cold GPS outdoors can take a while, and refusing duty over
      // an impatient timeout would be worse than waiting.
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    );
  });
}

export function DutyProvider({ children }) {
  const tracking = useLiveTracking();
  const [onDuty, setOnDuty] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dutyError, setDutyError] = useState(null);

  // start/stop identities change with the hook's internals; keep the latest in
  // a ref so the resume effect below runs exactly once, on load.
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;

  const applyState = useCallback((state) => {
    setOnDuty(Boolean(state?.on_duty));
    setStartedAt(state?.started_at ?? null);
    return Boolean(state?.on_duty);
  }, []);

  // Resume an open duty session after a reload / reopened tab. Only engineers
  // go on duty — asking for staff would make every admin page load fire a
  // request that 409s (they have no employee record) and litter the console.
  useEffect(() => {
    if (!isAuthenticated() || getUserRole() !== ROLES.EMPLOYEE) return;
    let cancelled = false;
    trackingService
      .duty()
      .then((state) => {
        if (cancelled) return;
        if (applyState(state)) trackingRef.current.start();
      })
      // An employee with no linked record simply is not on duty; a failure here
      // must never block the app.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyState]);

  const startDuty = useCallback(async () => {
    setBusy(true);
    setDutyError(null);
    try {
      // Location FIRST, and duty only if it is granted. Starting duty without it
      // put an engineer on the board as "on duty, waiting for GPS" for the rest
      // of the shift — the office could see they were out but never where, and
      // their distance stayed at zero. Duty without a position is not tracking.
      await requireLocationPermission();
      applyState(await trackingService.startDuty());
      tracking.start();
    } catch (e) {
      setDutyError(
        e?.locationDenied
          ? e.message
          : e?.response?.data?.detail || "Could not start duty",
      );
    } finally {
      setBusy(false);
    }
  }, [applyState, tracking]);

  const endDuty = useCallback(async () => {
    setBusy(true);
    setDutyError(null);
    // Stop the GPS stream first: even if the server call fails, the engineer
    // asked to go off duty and must not keep broadcasting.
    tracking.stop();
    try {
      applyState(await trackingService.endDuty());
    } catch (e) {
      setDutyError(e?.response?.data?.detail || "Could not end duty");
    } finally {
      setBusy(false);
    }
  }, [applyState, tracking]);

  const value = {
    onDuty,
    startedAt,
    busy,
    // `tracking` is whether GPS is actually streaming; `onDuty` is what the
    // server believes. They differ when a fix has not arrived yet.
    streaming: tracking.tracking,
    lastFix: tracking.lastFix,
    error: dutyError || tracking.error,
    startDuty,
    endDuty,
    setContext: tracking.setContext,
  };

  return <DutyContext.Provider value={value}>{children}</DutyContext.Provider>;
}

export function useDuty() {
  const ctx = useContext(DutyContext);
  if (!ctx) throw new Error("useDuty must be used inside a DutyProvider");
  return ctx;
}
