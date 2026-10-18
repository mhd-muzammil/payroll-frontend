import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getTokenClaims, isAuthenticated } from "../auth/rbac";
import { trackingService } from "../services/trackingService";
import { buildReport, shouldSend } from "./phoneStatusRules";
import { userIdOf } from "./trackingRules";

/**
 * Tells the office how this phone is set up to record: the app's version,
 * Android's, whether the battery optimiser leaves the app alone, Location and
 * notification permission, GPS. App Usage shows it, with its history.
 *
 * Only ever asks: every plugin call here reads a setting and prompts for
 * nothing. Only from the app; a browser is not a phone.
 */

const IS_APP = Boolean(Capacitor?.isNativePlatform?.());
const LAST_SENT_KEY = "phone_status.last_sent";
const PLUGIN_WAIT_MS = 3000;
// How long a report may take before it is given up -- and cancelled, see below.
const SEND_WAIT_MS = 20000;
const TIMED_OUT = Symbol("timed out");

const DutyTracker = registerPlugin("DutyTracker");
const Geolocation = registerPlugin("Geolocation");

/** `promise`, or `fallback` once `ms` have passed; the timer never outlives it. */
async function within(promise, ms, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A plugin's answer: null when the plugin is missing or refuses ({error} when
 * the refusal itself is wanted), TIMED_OUT when it is there and did not answer
 * in time -- a busy phone, which is not the same as a phone that cannot say.
 */
async function ask(plugin, call, { keepError = false } = {}) {
  if (!Capacitor.isPluginAvailable(plugin)) return null;
  try {
    return await within(call(), PLUGIN_WAIT_MS, TIMED_OUT);
  } catch (error) {
    return keepError ? { error } : null;
  }
}

function lastSent() {
  try {
    return JSON.parse(localStorage.getItem(LAST_SENT_KEY) || "null");
  } catch {
    return null;
  }
}

function parsed(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function remember(entry) {
  try {
    localStorage.setItem(LAST_SENT_KEY, JSON.stringify(entry));
  } catch {
    // Storage refused: the report simply goes again next time.
  }
}

// The latest attempt. An older attempt that finishes late is ignored.
let attempt = 0;
let inFlight = null;

/**
 * Give up on the report in flight: a sign-in change, or the next attempt. Its
 * request is cancelled, because a request held behind a failed token refresh
 * would otherwise go out hours later, with a stale body and whoever's token is
 * current by then.
 */
export function cancelPhoneStatus() {
  attempt += 1;
  inFlight?.abort();
  inFlight = null;
}

/** Report the phone's set-up if it changed or ten minutes have passed. Never throws. */
export async function reportPhoneStatus() {
  if (!IS_APP || inFlight || !isAuthenticated()) return;
  const mine = ++attempt;
  const controller = new AbortController();
  inFlight = controller;
  try {
    const answers = await Promise.all([
      ask("DutyTracker", () => DutyTracker.appInfo()),
      ask("DutyTracker", () => DutyTracker.state()),
      ask("DutyTracker", () => DutyTracker.checkPermissions()),
      ask("Geolocation", () => Geolocation.checkPermissions(), { keepError: true }),
      ask("LocalNotifications", () => LocalNotifications.checkPermissions()),
    ]);
    // A plugin that is there but too slow says nothing about the phone: report
    // next time rather than send every setting as unknown.
    if (mine !== attempt || answers.includes(TIMED_OUT)) return;
    const [info, state, permissions, geolocation, notifications] = answers;
    const user = String(userIdOf(getTokenClaims()) ?? "");
    const last = lastSent();
    // What this phone last told the server for this login, for the one thing a
    // report may keep from it (see buildReport).
    const previous = last && last.user === user && !last.refused ? parsed(last.body) : null;
    const report = buildReport({ info, state, permissions, geolocation, notifications, previous });
    const now = Date.now();
    if (!shouldSend(report, last, user, now)) return;

    const outcome = await within(
      // skipSuccessMark: this report is not the tracking getting through, and
      // must not count as such when the page weighs taking over the sending.
      trackingService.phoneStatus(report, { signal: controller.signal, skipSuccessMark: true }).then(
        () => "sent",
        (error) => ([400, 403].includes(error?.response?.status) ? "refused" : "failed"),
      ),
      SEND_WAIT_MS,
      "timed out",
    );
    if (outcome === "timed out") controller.abort();
    if (mine !== attempt) return;
    if (outcome === "sent") remember({ user, body: JSON.stringify(report), at: now });
    // No employee behind this login (an office account on a phone): the server
    // will never take its report, so it is not asked again for a day.
    if (outcome === "refused") remember({ user, body: JSON.stringify(report), at: now, refused: true });
  } catch {
    // The office's view of a phone is never worth an error on the engineer's screen.
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}
