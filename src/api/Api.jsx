import axios from "axios";
import { Capacitor } from "@capacitor/core";
import { clearAuth, getAccessToken, getRefreshToken, setAccessToken } from "@/auth/rbac";

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

api.interceptors.request.use((config) => {
  if (IS_APP) {
    config.headers["X-Payroll-Client"] = "app";
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
  (response) => response,
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
      setAccessToken(data.access);
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
