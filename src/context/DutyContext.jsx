import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { trackingService } from "../services/trackingService";
import { useLiveTracking } from "../customHook/useLiveTracking";
import { getUserRole, isAuthenticated, ROLES } from "../auth/rbac";

/**
 * Owns "am I on duty?" for the whole app.
 *
 * Duty is a state the engineer declares on the server, not a side effect of one
 * page being open. This provider sits ABOVE the router, so an engineer who taps
 * Resume tracking on My Cases and then opens Attendance keeps sending their position
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

const LOCATION_BLOCKED_MESSAGE =
  "Location is blocked for this site, so duty cannot be tracked. Tap the padlock next to the web address, set Location to Allow, and it will work from then on — you will not be asked again.";

/**
 * The browser refusing to give a position is not one problem, it is three, and
 * they need three different switches. Telling an engineer to tap the padlock
 * when the padlock is not the problem leaves them tapping Start Duty forever
 * with the phone's own location plainly switched on.
 *
 * The tell is the disagreement: when the Permissions API says this site is
 * allowed (or has not been asked) and getCurrentPosition still answers
 * PERMISSION_DENIED, the site is not what is refusing.
 */
const LOCATION_ON_HTTP_MESSAGE =
  "This page is open on an http:// address. Browsers never share location on one, whatever the phone's settings say — so duty cannot be tracked here. Open the site on its https:// address and tap Resume tracking again.";

// The site says yes and the answer is still no, so nothing on this page or in
// its site settings can fix it — the browser app is what has no location.
const BROWSER_APP_BLOCKED_MESSAGE =
  "This site is allowed, but the browser app itself has no location permission from your phone — so the padlock settings will not help. Open your phone's Settings → Apps → Chrome → Permissions → Location → Allow (\"while using the app\" is enough), then come back and tap Resume tracking again.";

// This site was never allowed OR blocked, and the answer is still no — so the
// browser refused without ever asking. Nothing about this site is the problem
// and there is no padlock setting to change; something above it is switched off.
const NO_PROMPT_MESSAGE =
  "The browser refused without even asking, so this site is not what is blocking it — something above it is switched off. Check these three, then tap Resume tracking again:";

const EITHER_BLOCKED_MESSAGE =
  "The browser refused to share your location. Check the padlock next to the web address, and your phone's location permission for the browser. Then tap Resume tracking again.";

/**
 * The exact taps, because "allow location" is not one setting on Android — it is
 * three in three different places, and only one of them is the padlock every
 * guide mentions. An engineer told to fix the padlock when the padlock is not
 * the problem just taps Resume tracking forever.
 */
/**
 * Which browser this really is, because two of them can never show a location
 * box at all and no amount of settings will change that.
 *
 * An Android WebView — the browser inside WhatsApp, Instagram, Snapchat and any
 * app that opens links in-app — reports the site permission as "prompt" and then
 * refuses, because the host app never implemented the permission dialog. That is
 * indistinguishable from a Chrome setting being off unless you look at the UA,
 * and it is the one case where the fix is "open it somewhere else".
 */
function browserSurface() {
  if (typeof navigator === "undefined") return "unknown";
  // OUR OWN app first. It is a WebView too, so the in-app test below would
  // otherwise tell an engineer using the APK to "open this in Chrome" — advice
  // that makes no sense inside an installed app and cannot be followed.
  if (typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.()) {
    return "app";
  }
  const ua = navigator.userAgent || "";
  // "; wv)" is Android's own marker for a WebView. The rest are in-app browsers
  // that identify themselves.
  if (/;\s*wv\)/i.test(ua) || /\b(FBAN|FBAV|Instagram|Line\/|Snapchat|MicroMessenger)\b/i.test(ua)) {
    return "in-app";
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)")?.matches) {
    return "installed";
  }
  return "browser";
}

// Inside our own app there is no site permission and no padlock — only the one
// Android permission the app itself holds.
const APP_LOCATION_DENIED_MESSAGE =
  "The app does not have location permission from your phone yet, so duty cannot be tracked. This is one setting, and once it is allowed you will never be asked again.";

const APP_SETTINGS_STEP =
  "Phone Settings → Apps → Renderways Technology → Permissions → Location → Allow (\"while using the app\" is enough). Then come back and tap Resume tracking.";
const REINSTALL_STEP =
  "If Location is not listed there at all, you are on the old app — install the updated one and it will ask you the first time you tap Resume tracking.";

const IN_APP_BROWSER_MESSAGE =
  "You are not in Chrome — this page is open inside another app's browser (WhatsApp, Instagram and the like), and those cannot show a location box at all. No setting will fix it here. Open the same link in Chrome and it will ask you normally.";

const OPEN_IN_CHROME_FROM_IN_APP_STEP =
  "Tap ⋮ (or ⋯) at the top of this screen and choose \"Open in Chrome\" / \"Open in browser\".";
const COPY_LINK_STEP =
  "No such option? Copy the web address, open Chrome yourself, and paste it there. Log in once and Chrome will remember you.";

const CHROME_SITE_SETTING_STEP =
  "In Chrome: ⋮ (top right) → Settings → Site settings → Location — turn it ON. If this is off, no permission box will ever appear.";
const ANDROID_APP_STEP =
  "Phone Settings → Apps → Chrome → Permissions → Location → Allow (\"while using the app\" is enough).";
const OPEN_IN_CHROME_STEP =
  "If you opened this from inside WhatsApp or another app, open it in Chrome instead — in-app browsers refuse location outright.";
const PADLOCK_STEP =
  "Tap the padlock next to the web address → Permissions → Location → Allow.";

/** Which of them it is, and what to tap, from what the browser actually said. */
function permissionDeniedFix(sitePermission) {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return { message: LOCATION_ON_HTTP_MESSAGE, steps: [] };
  }
  // Checked before the site permission, because neither of these can be fixed by
  // a site permission and pointing at one wastes the engineer's time.
  const surface = browserSurface();
  if (surface === "app") {
    return { message: APP_LOCATION_DENIED_MESSAGE, steps: [APP_SETTINGS_STEP, REINSTALL_STEP] };
  }
  if (surface === "in-app") {
    return {
      message: IN_APP_BROWSER_MESSAGE,
      steps: [OPEN_IN_CHROME_FROM_IN_APP_STEP, COPY_LINK_STEP],
    };
  }
  if (sitePermission === "denied") {
    return { message: LOCATION_BLOCKED_MESSAGE, steps: [] };
  }
  if (sitePermission === "granted") {
    return { message: BROWSER_APP_BLOCKED_MESSAGE, steps: [ANDROID_APP_STEP, OPEN_IN_CHROME_STEP] };
  }
  if (sitePermission === "prompt") {
    return {
      message: NO_PROMPT_MESSAGE,
      steps: [CHROME_SITE_SETTING_STEP, ANDROID_APP_STEP, OPEN_IN_CHROME_STEP],
    };
  }
  // No Permissions API to compare against, so name every switch there is.
  return {
    message: EITHER_BLOCKED_MESSAGE,
    steps: [PADLOCK_STEP, CHROME_SITE_SETTING_STEP, ANDROID_APP_STEP],
  };
}

/**
 * What the device actually said, in one short line the engineer can read out.
 * An instant refusal is invisible otherwise — the tap looks like a dead button.
 */
function locationDiagnostic({ sitePermission, errorCode, at }) {
  const secure =
    typeof window === "undefined" || window.isSecureContext !== false ? "https yes" : "https NO";
  return [
    `site: ${sitePermission ?? "unknown"}`,
    secure,
    // Which browser it really is: "in-app" can never show a location box, and
    // that is invisible from the message alone.
    browserSurface(),
    errorCode != null ? `error ${errorCode}` : null,
    at ? `checked ${at}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Watch whether this device will give us a location, so the engineer is told
 * BEFORE their shift rather than at the moment they tap Resume tracking.
 *
 * Permissions API only, deliberately: querying it prompts nobody. The prompt
 * itself belongs to the Start Duty tap, where the engineer has just asked for
 * something and an ask back makes sense.
 *
 * Not every browser has it; where it is missing we simply learn nothing up front
 * and the Start Duty check still catches it.
 */
function watchLocationPermission(onChange) {
  if (!navigator.permissions?.query) return () => {};
  let status = null;
  const handle = () => onChange(status.state);
  navigator.permissions
    .query({ name: "geolocation" })
    .then((result) => {
      status = result;
      handle();
      result.addEventListener("change", handle);
    })
    .catch(() => {});
  return () => status?.removeEventListener("change", handle);
}

/**
 * Ask for a position before duty starts, and refuse duty if it does not come.
 *
 * Resolves only on a real fix — asking for permission is not enough, because a
 * granted permission with the phone's location switched off still never
 * produces one.
 */
function requireLocationPermission(sitePermission) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(locationError("This device cannot share its location, so duty cannot be tracked."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          const fix = permissionDeniedFix(sitePermission);
          const error = locationError(fix.message);
          error.errorCode = err.code;
          error.steps = fix.steps;
          reject(error);
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          const error = locationError(
            "Your phone's location is switched off. Turn it on, then tap Resume tracking again.",
          );
          error.errorCode = err.code;
          reject(error);
        } else {
          const error = locationError(
            "Could not get your location. Step outside or check your signal, then tap Resume tracking again.",
          );
          error.errorCode = err.code;
          reject(error);
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
  // Null until the backend says, so a screen can tell "no distance yet" from
  // "the backend does not report one".
  const [todayKm, setTodayKm] = useState(null);
  // "granted" | "prompt" | "denied" | null (browser cannot tell us)
  const [locationPermission, setLocationPermission] = useState(null);
  // What the device said on the last refused attempt, for the engineer to read
  // out when the instructions have not helped.
  const [diagnostic, setDiagnostic] = useState(null);
  // The exact taps for THIS refusal, in the order most likely to be the cause.
  const [locationSteps, setLocationSteps] = useState([]);

  // start/stop identities change with the hook's internals; keep the latest in
  // a ref so the resume effect below runs exactly once, on load.
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;

  const applyState = useCallback((state) => {
    setOnDuty(Boolean(state?.on_duty));
    setStartedAt(state?.started_at ?? null);
    // Sent on every duty response, so the figure refreshes with the state the
    // app already fetches. Absent from an older backend, in which case the
    // screen simply does not show a distance rather than showing zero.
    if (typeof state?.today_km === "number") setTodayKm(state.today_km);
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

  // Told up front, and cleared the moment they fix it — no reload needed.
  useEffect(() => {
    if (!isAuthenticated() || getUserRole() !== ROLES.EMPLOYEE) return;
    return watchLocationPermission((state) => {
      setLocationPermission(state);
      setDutyError((current) => {
        if (state === "denied") return LOCATION_BLOCKED_MESSAGE;
        // They just allowed it: drop the warning without making them reload.
        return current === LOCATION_BLOCKED_MESSAGE ? null : current;
      });
    });
  }, []);

  const startDuty = useCallback(async () => {
    setBusy(true);
    setDutyError(null);
    setDiagnostic(null);
    setLocationSteps([]);
    // A blocked permission is refused in the same frame as the tap, so the
    // button flickered and settled back on the message already on screen — the
    // engineer read that as a dead button and kept tapping. Hold the "Getting
    // location…" state long enough to be seen, so every tap plainly does something.
    const tapped = Date.now();
    try {
      // Location FIRST, and duty only if it is granted. Starting duty without it
      // put an engineer on the board as "on duty, waiting for GPS" for the rest
      // of the shift — the office could see they were out but never where, and
      // their distance stayed at zero. Duty without a position is not tracking.
      await requireLocationPermission(locationPermission);
      applyState(await trackingService.startDuty());
      tracking.start();
    } catch (e) {
      setDutyError(
        e?.locationDenied
          ? e.message
          : e?.response?.data?.detail || "Could not start duty",
      );
      if (e?.locationDenied) {
        setLocationSteps(e.steps ?? []);
        setDiagnostic(
          locationDiagnostic({
            sitePermission: locationPermission,
            errorCode: e.errorCode,
            at: new Date().toLocaleTimeString(),
          }),
        );
      }
    } finally {
      const shown = Date.now() - tapped;
      if (shown < 500) await new Promise((r) => setTimeout(r, 500 - shown));
      setBusy(false);
    }
  }, [applyState, tracking, locationPermission]);

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
    // Lets the screen disable Start Duty while it is pointless, rather than
    // letting the engineer tap it and be refused.
    locationBlocked: locationPermission === "denied",
    // Only set after a refusal, so the screen can show what the device said.
    locationDiagnostic: diagnostic,
    locationSteps,
    // How far they have travelled today, from the same helper the office's
    // board uses — so the engineer and their manager cannot read two different
    // numbers for the same day.
    todayKm,
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
