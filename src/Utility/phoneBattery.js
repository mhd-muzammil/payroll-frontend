/**
 * How much charge the phone has, read from the web platform.
 *
 * Deliberately NOT a Capacitor plugin. A native plugin's Java half has to be
 * compiled into the APK, so using one would mean every engineer installing a new
 * build before the office could see a single battery figure. navigator.getBattery
 * is part of the Chromium the WebView already runs, so this works on the APK
 * that is on their phones today — a frontend deploy is enough.
 *
 * The trade is that the API is not universal. Where it is missing we report
 * null, the ping carries no battery, and the board shows nothing for it. That is
 * the right failure: a missing figure is honest, and a made-up one would be
 * acted on.
 *
 * The reading is cached, because a fix arrives every ten metres of movement and
 * a battery percentage does not change that fast.
 */

// Long enough that a moving engineer is not re-reading it constantly, short
// enough that a phone sliding from 20% to 4% is visible on the board well
// before it goes quiet.
const REFRESH_MS = 60_000;

let cached = { level: null, charging: null, at: 0 };
let inFlight = null;

function supported() {
  try {
    return typeof navigator !== "undefined" && typeof navigator.getBattery === "function";
  } catch {
    return false;
  }
}

async function read() {
  try {
    const battery = await navigator.getBattery();
    // level is 0..1. Handing that straight to the server would say 1% for a full
    // phone, so the server converts — see battery_percent in cases/pings.py.
    // What is sent is the fraction as reported, unchanged.
    const level = typeof battery.level === "number" ? battery.level : null;
    return { level, charging: typeof battery.charging === "boolean" ? battery.charging : null };
  } catch {
    return { level: null, charging: null };
  }
}

/**
 * The current reading, or nulls. Never throws and never blocks a ping: an
 * unavailable battery must not be able to stop a location from being sent.
 */
export async function batteryState(now = Date.now()) {
  if (!supported()) return { level: null, charging: null };
  if (now - cached.at < REFRESH_MS) return { level: cached.level, charging: cached.charging };

  // Collapse concurrent callers onto one read, so a burst of fixes does not
  // start a burst of battery reads.
  if (!inFlight) {
    inFlight = read().then((state) => {
      cached = { ...state, at: now };
      inFlight = null;
      return state;
    });
  }
  return inFlight;
}

/** Test seam: forget the cached reading. */
export function resetBatteryCache() {
  cached = { level: null, charging: null, at: 0 };
  inFlight = null;
}
