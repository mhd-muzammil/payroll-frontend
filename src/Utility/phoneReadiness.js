import { Capacitor, registerPlugin } from "@capacitor/core";
import { phoneProblems } from "./phoneReadinessRules";

/**
 * The Login check: is this phone set up to record the duty a Login starts?
 *
 * The office found engineers whose km ran as straight lines for hours: an app
 * from before 1.5, whose tracker died with the app; the battery optimiser
 * stopping the app in a pocket; Location off or refused. So Login asks the
 * phone first and goes ahead only when all four are right ("1 a").
 *
 * Only in the app. A browser Login -- office staff on a PC -- records no route
 * and is not asked. DutyTracker is asked directly rather than through
 * useLiveTracking's trackerCapabilities(): that one is the rollback lever, and
 * pulling it must never lock every Login out.
 */

const DutyTracker = registerPlugin("DutyTracker");

// The check's own switch: false lets every Login through, as before it existed.
const REQUIRE_PHONE_READY = true;

// A busy phone can take a moment; past this the check says it got no answer.
const PLUGIN_WAIT_MS = 5000;
const NO_ANSWER = Symbol("no answer");

/** A plugin's answer; null when it refuses or does not have the call; NO_ANSWER when it is too slow. */
async function ask(call) {
  let timer;
  try {
    return await Promise.race([
      call(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(NO_ANSWER), PLUGIN_WAIT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const answered = (value) => (value === NO_ANSWER ? null : value);

/**
 * What the phone says, and what is wrong with it:
 * {ready, problems, version, build, android, location, gpsOn, batteryExempt, noAnswer}.
 * Outside the app, {ready: true, skipped: true}.
 */
export async function readPhoneReadiness() {
  if (!REQUIRE_PHONE_READY || !Capacitor.isNativePlatform()) {
    return { ready: true, skipped: true, problems: [] };
  }
  // APK 1.2 and 1.3 have no DutyTracker at all.
  if (!Capacitor.isPluginAvailable("DutyTracker")) {
    return { ready: false, problems: ["app"], version: null, noAnswer: false };
  }
  // 1.4 and 1.4.1 refuse capabilities() ("not implemented"): only 1.5 has it.
  const [caps, info] = await Promise.all([
    ask(() => DutyTracker.capabilities()),
    ask(() => DutyTracker.appInfo()),
  ]);
  let noAnswer = caps === NO_ANSWER || info === NO_ANSWER;
  const about = answered(info) || {};
  const phone = {
    version: about.version ?? null,
    build: about.build ?? null,
    android: about.android ?? null,
  };
  if (answered(caps)?.nativeUpload !== true) {
    return { ready: false, problems: ["app"], ...phone, noAnswer };
  }
  const [permissions, state] = await Promise.all([
    ask(() => DutyTracker.checkPermissions()),
    ask(() => DutyTracker.state()),
  ]);
  noAnswer = noAnswer || permissions === NO_ANSWER || state === NO_ANSWER;
  const checks = {
    nativeUpload: true,
    location: answered(permissions)?.location ?? null,
    gpsOn: answered(state)?.gpsOn ?? null,
    batteryExempt: answered(state)?.batteryExempt ?? about.batteryExempt ?? null,
  };
  const problems = phoneProblems(checks);
  return { ready: problems.length === 0, problems, ...phone, ...checks, noAnswer };
}

/**
 * Android's own Location box. Waits for the engineer's answer, however long --
 * no timeout here. Resolves with the permission now, or null.
 */
export async function askLocation() {
  try {
    const answer = await DutyTracker.requestPermissions({ permissions: ["location"] });
    return answer?.location ?? null;
  } catch {
    return null;
  }
}

/**
 * Android's own "let the app run in the background" box. Waits for the answer.
 * Resolves true when the app is now left out of battery optimisation. A phone
 * without that box answers at once, with what is true.
 */
export async function askBattery() {
  try {
    const answer = await DutyTracker.requestBatteryExemption();
    return answer?.exempt === true;
  } catch {
    return false;
  }
}
