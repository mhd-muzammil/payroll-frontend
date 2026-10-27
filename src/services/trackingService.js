import { api } from "../api/Api";

const BASE = "/api/tracking/";

// A queued fix or event carries `owner` -- whose duty it was -- so the phone
// never sends one as somebody else. That is the phone's business, not the
// server's, and it stays off the wire.
const withoutOwner = (entry) => {
  const sent = { ...entry };
  delete sent.owner;
  return sent;
};

export const trackingService = {
  // How this phone is set up to record (app 1.5 battery, Location, notifications,
  // GPS), for App Usage. Sent by Utility/phoneStatus.js from the app only.
  phoneStatus: async (report, config) => (await api.post(`${BASE}phone_status/`, report, config)).data,

  // The caller's own duty state. Read on app load so a refresh or a reopened
  // tab resumes tracking instead of quietly going off duty.
  duty: async () => {
    const { data } = await api.get(`${BASE}duty/`);
    return data;
  },

  // `body` says where the start came from: {from: "check_in"} for a case
  // Check In, which starts no duty before the day's Login.
  startDuty: async (body) => {
    const { data } = await api.post(`${BASE}start_duty/`, body);
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
    const { data } = await api.post(`${BASE}ping/batch/`, { pings: pings.map(withoutOwner) });
    return data;
  },

  /**
   * What the phone saw happen to the tracking: Location or the network going
   * off and on, the phone stopping the app, the app being opened. Sent ahead
   * of the fixes, each with the phone's own key so a repeat is skipped.
   *
   * An empty list is the heartbeat: it tells the server this app is alive and
   * recording while it has no new position to send, which is every minute an
   * engineer spends standing at a customer.
   */
  events: async (events) => {
    const { data } = await api.post(`${BASE}events/`, { events: events.map(withoutOwner) });
    return data;
  },

  /**
   * One live position reading.
   *
   * `timestamp` and `client_key` are sent for a live fix too, not only a queued
   * one: a fix that fails and is retried from the queue must be the SAME fix,
   * with the same time and the same id, or the route gains a duplicate.
   *
   * So is `after_gap`. It was left out, so the first fix after a Login -- which
   * goes out on its own, straight away -- reached the server without the one
   * flag it existed to carry; only a fix that failed and went through the
   * batch ever arrived with it.
   */
  ping: async ({
    latitude,
    longitude,
    accuracy,
    speed,
    after_gap,
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
      after_gap: Boolean(after_gap),
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
