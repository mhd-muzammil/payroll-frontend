import { api } from "../api/Api";

const BASE = "/api/tracking/";

export const trackingService = {
  // The caller's own duty state. Read on app load so a refresh or a reopened
  // tab resumes tracking instead of quietly going off duty.
  duty: async () => {
    const { data } = await api.get(`${BASE}duty/`);
    return data;
  },

  startDuty: async () => {
    const { data } = await api.post(`${BASE}start_duty/`);
    return data;
  },

  endDuty: async () => {
    const { data } = await api.post(`${BASE}end_duty/`);
    return data;
  },

  // Engineer sends one live position reading.
  ping: async ({ latitude, longitude, accuracy, speed, status, case_id }) => {
    const { data } = await api.post(`${BASE}ping/`, {
      latitude,
      longitude,
      accuracy,
      speed,
      status,
      case_id,
    });
    return data;
  },

  // Admin: latest position of every currently-active engineer.
  live: async () => {
    const { data } = await api.get(`${BASE}live/`);
    return data;
  },

  // Full trail + total km for one engineer's day, or one case.
  // params: { engineer, date } or { case }
  path: async (params = {}) => {
    const { data } = await api.get(`${BASE}path/`, { params });
    return data;
  },
};
