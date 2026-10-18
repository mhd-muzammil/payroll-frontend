import { useEffect } from "react";
import { AUTH_CHANGED_EVENT } from "../auth/rbac";
import { cancelPhoneStatus, reportPhoneStatus } from "../Utility/phoneStatus";

// While the app is open, how often the phone's set-up is looked at again. The
// report itself only goes when something changed or ten minutes have passed.
const LOOK_AGAIN_MS = 5 * 60 * 1000;

/**
 * Reports how the phone is set up to record when the app opens, when it comes
 * back to the front, after a sign-in, and every few minutes while open. Renders
 * nothing, and does nothing outside the app (see Utility/phoneStatus.js).
 */
export default function PhoneStatusReporter() {
  useEffect(() => {
    const report = () => void reportPhoneStatus();
    const onVisible = () => {
      if (document.visibilityState === "visible") report();
    };
    // A sign-in, a sign-out or a token refresh: whatever was in flight belongs
    // to the old state; drop it and look again as whoever is signed in now.
    const onAuthChanged = () => {
      cancelPhoneStatus();
      report();
    };
    report();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    const timer = setInterval(report, LOOK_AGAIN_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      clearInterval(timer);
      cancelPhoneStatus();
    };
  }, []);
  return null;
}
