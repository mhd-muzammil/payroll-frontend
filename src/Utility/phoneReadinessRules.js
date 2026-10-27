/**
 * Whether this phone is set up to record the duty a Login starts, as the Login
 * check reads it ("phone sariyilla-na Login aagaadhu").
 *
 * Kept free of Capacitor, like phoneStatusRules.js, so the rules can be read
 * and checked on their own; phoneReadiness.js does the asking.
 */

/**
 * What is wrong, in the order an engineer fixes it: the app first, because an
 * APK before 1.5 cannot run the tracker that survives the app being closed,
 * nor say what the battery optimiser does to it.
 *
 * `nativeUpload` is DutyTracker.capabilities()'s answer (APK 1.5 and later),
 * `location` DutyTracker.checkPermissions().location ("granted" means precise
 * Location), `gpsOn` and `batteryExempt` DutyTracker.state()'s. Anything the
 * phone did not answer counts as wrong: a check that could not be made is not a
 * pass.
 */
export function phoneProblems({ nativeUpload, location, gpsOn, batteryExempt } = {}) {
  if (nativeUpload !== true) return ["app"];
  const problems = [];
  if (location !== "granted") problems.push("location");
  if (gpsOn !== true) problems.push("gps");
  if (batteryExempt !== true) problems.push("battery");
  return problems;
}
