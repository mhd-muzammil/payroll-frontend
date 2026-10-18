import axios from "axios";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { clearAuth, getAccessToken, getRefreshToken, storeAuthTokens } from "@/auth/rbac";

console.log("VITE_API_BASE_URL =", import.meta.env.VITE_API_BASE_URL);

export const Base_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export const api = axios.create({
  baseURL: Base_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Read once, not per request: Capacitor's answer cannot change while the app is
// running. This header is the only thing that tells the server a request came
// from the phone app rather than a browser -- it is what App Usage counts, and
// what lets the server refuse a position reported by anything but the
// engineer's own phone.
//
// From the IMPORTED Capacitor, not window.Capacitor. The two are not the same
// promise: the global is injected by the native bridge and the module is part
// of the bundle. useLiveTracking decides whether to track from the imported
// one, and the app demonstrably takes that path -- the foreground service runs.
// Deriving both from the same value is what makes "the app always sends the
// header" true rather than hopeful; if the two could disagree, an engineer
// could be tracking while every fix was refused, and the app would call that
// "no signal".
const IS_APP = Boolean(Capacitor?.isNativePlatform?.());

/**
 * Which build of the APK this phone is running, once we have asked it.
 *
 * Asked once, at startup, and then attached to every request -- so the office
 * panel can name the phones still on an old version instead of asking around.
 * An APK that predates the tracker plugin cannot answer, and that silence is
 * the answer: it has not been updated.
 *
 * Deliberately not awaited anywhere. A request or two at startup goes without
 * the header rather than being held up for it, because knowing the version is
 * never worth delaying an engineer's screen.
 */
let appBuild = null;
if (IS_APP && Capacitor?.isPluginAvailable?.("DutyTracker")) {
  registerPlugin("DutyTracker")
    .appInfo()
    .then((info) => {
      if (info?.version) {
        appBuild = info.build ? `${info.version} (${info.build})` : String(info.version);
      }
    })
    .catch(() => {});
}

/**
 * The version header's value, for a sender that has to set it itself: APK
 * 1.5's own uploader, which posts positions without going through here. Null
 * until the phone has answered, or on an APK too old to say.
 */
export const appVersionHeader = () => appBuild;

// When the server last answered this page with a success. APK 1.5 sends its
// own positions; the page only takes that over when the phone's uploader is
// being refused while the page itself is plainly getting through.
let lastSuccess = 0;
export const lastSuccessAt = () => lastSuccess;

api.interceptors.request.use((config) => {
  if (IS_APP) {
    config.headers["X-Payroll-Client"] = "app";
    if (appBuild) {
      config.headers["X-Payroll-App-Version"] = appBuild;
    }
  }
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Log the final request URL for debugging
  const finalUrl = config.baseURL ? new URL(config.url, config.baseURL).href : config.url;
  console.log(`[API Request] ${config.method.toUpperCase()} ${finalUrl}`);
  
  return config;
});

let isRefreshing = false;
let queuedRequests = [];

const flushQueue = (newToken) => {
  queuedRequests.forEach((cb) => cb(newToken));
  queuedRequests = [];
};

api.interceptors.response.use(
  (response) => {
    // Not for a request that asks to be left out (the phone-status report):
    // it says nothing about the tracking getting through, so it must not be
    // what decides a takeover.
    if (!response.config?.skipSuccessMark) lastSuccess = Date.now();
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    const refresh = getRefreshToken();
    if (!refresh) {
      clearAuth();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        queuedRequests.push((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${Base_URL}/api/auth/refresh/`, { refresh });
      // BOTH tokens. The server rotates the refresh token on every refresh
      // and hands the new one back; only the access token used to be kept, so
      // the one stored stayed the one from the password login and stopped
      // working thirty days after it -- signing the engineer out mid-duty.
      // (This relies on BLACKLIST_AFTER_ROTATION staying False: the phone's
      // own uploader refreshes from the same chain, independently.)
      storeAuthTokens({ access: data.access, refresh: data.refresh });
      flushQueue(data.access);
      originalRequest.headers.Authorization = `Bearer ${data.access}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearAuth();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
