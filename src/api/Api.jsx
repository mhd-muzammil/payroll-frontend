import axios from "axios";
import { clearAuth, getAccessToken, getRefreshToken, setAccessToken } from "@/auth/rbac";

export const Base_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export const api = axios.create({
  baseURL: Base_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
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
