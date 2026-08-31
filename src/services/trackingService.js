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

  /**
   * A backlog of fixes the phone took while it had no signal.
   *
   * Each one carries the time it was TAKEN and the phone's own id for it, so the
   * route draws in travel order and a batch the server already accepted — after
   * a timeout the phone never saw the answer to — is not stored twice.
   */
  pingBatch: async (pings) => {
    const { data } = await api.post(`${BASE}ping/batch/`, { pings });
    return data;
  },

  /**
   * One live position reading.
   *
   * `timestamp` and `client_key` are sent for a live fix too, not only a queued
   * one: a fix that fails and is retried from the queue must be the SAME fix,
   * with the same time and the same id, or the route gains a duplicate.
   */
  ping: async ({
    latitude,
    longitude,
    accuracy,
    speed,
    status,
    case_id,
    timestamp,
    client_key,
    battery_level,
    is_charging,
  }) => {
    const { data } = await api.post(`${BASE}ping/`, {
      latitude,
      longitude,
      accuracy,
      speed,
      status,
      case_id,
      timestamp,
      client_key,
      battery_level,
      is_charging,
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
