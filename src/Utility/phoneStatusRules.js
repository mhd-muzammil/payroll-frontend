import { saysLocationIsOff } from "./trackingRules.js";

/**
 * What the phone says about how it is set up to record, as the server stores
 * it, and when it is worth saying again.
 *
 * Kept free of Capacitor and of the network so the rules can be tested on their
 * own; phoneStatus.js does the asking and the sending.
 */

/** The same report is not sent again inside ten minutes. A change goes at once. */
export const RESEND_MS = 10 * 60 * 1000;

/** A login the server will not take a report from (no employee) is left alone this long. */
export const REFUSED_PAUSE_MS = 24 * 60 * 60 * 1000;

const PERMISSIONS = ["granted", "denied", "prompt", "prompt-with-rationale"];

const permission = (value) => (PERMISSIONS.includes(value) ? value : "");
const flag = (value) => (typeof value === "boolean" ? value : null);

/**
 * The plugins' answers as the report body. Anything the phone could not say is
 * null or "": an APK before 1.5 cannot report the battery, and a plugin that
 * refused answered nothing.
 *
 * `info` is DutyTracker.appInfo(), `state` DutyTracker.state(), `permissions`
 * DutyTracker.checkPermissions(), `geolocation` Geolocation.checkPermissions()
 * -- or {error} when it refused -- and `notifications`
 * LocalNotifications.checkPermissions().
 *
 * The Location permission comes from DutyTracker first: Geolocation refuses to
 * answer at all while the Location switch is off, and reading that as "the
 * permission is unknown" wrote a false permission change into the history on
 * every GPS toggle. Its refusal is still worth something: it says the switch is
 * off, which is the GPS state for an APK whose tracker cannot say.
 *
 * An APK without DutyTracker (1.2, 1.3) has only Geolocation to ask, so while
 * Location is off the permission is kept from `previous`, the last report this
 * phone sent for the same login: the switch moved, not the permission.
 */
export function buildReport({ info, state, permissions, geolocation, notifications, previous } = {}) {
  const geoError = geolocation?.error ?? null;
  const geoAnswer = geolocation && !geoError ? geolocation : null;
  const version = info?.version
    ? info.build
      ? `${info.version} (${info.build})`
      : String(info.version)
    : "";
  let gpsOn = flag(state?.gpsOn);
  if (gpsOn === null && geoAnswer) gpsOn = true;
  if (gpsOn === null && geoError && saysLocationIsOff(geoError)) gpsOn = false;
  let location = permission(permissions?.location) || permission(geoAnswer?.location);
  if (!location && geoError && saysLocationIsOff(geoError)) location = permission(previous?.location_permission);
  return {
    app_version: version,
    android_version: info?.android ? String(info.android) : "",
    battery_exempt: flag(state?.batteryExempt) ?? flag(info?.batteryExempt),
    location_permission: location,
    notification_permission: permission(notifications?.display),
    gps_on: gpsOn,
  };
}

/** The settings a history entry can change in, as App Usage names them. */
export const SETTING_FIELDS = [
  "app_version",
  "android_version",
  "battery_exempt",
  "location_permission",
  "notification_permission",
  "gps_on",
];

/** Which settings differ between a history entry and the one before it. */
export function changedFields(entry, older) {
  if (!entry || !older) return new Set();
  return new Set(SETTING_FIELDS.filter((field) => entry[field] !== older[field]));
}

/**
 * Whether to send `report` now, given the last report sent from this phone
 * (`last`: {user, body, at, refused?}). Always for somebody else signed in and
 * always when anything changed, otherwise once the ten minutes are up; but a
 * login the server refused is left alone for a day, whatever the report says. A
 * clock that went backwards counts as the time being up.
 */
export function shouldSend(report, last, user, now) {
  if (!last || last.user !== user) return true;
  const since = now - last.at;
  const backwards = now < last.at;
  if (last.refused) return backwards || since >= REFUSED_PAUSE_MS;
  if (last.body !== JSON.stringify(report)) return true;
  return backwards || since >= RESEND_MS;
}
