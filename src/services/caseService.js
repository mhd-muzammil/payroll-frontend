import { api } from "../api/Api";

const BASE = "/api/cases/";
const byId = (id) => `${BASE}${id}/`;

/** Only send a position when the phone actually has one. */
function fixBody(fix) {
  if (!fix || fix.latitude == null || fix.longitude == null) return {};
  return { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy ?? null };
}

export const caseService = {
  getAll: async (params = {}) => {
    const { data } = await api.get(BASE, { params });
    return data;
  },

  getById: async (id) => {
    const { data } = await api.get(byId(id));
    return data;
  },

  create: async (payload) => {
    const { data } = await api.post(BASE, payload);
    return data;
  },

  update: async (id, payload) => {
    const { data } = await api.put(byId(id), payload);
    return data;
  },

  patch: async (id, payload) => {
    const { data } = await api.patch(byId(id), payload);
    return data;
  },

  remove: async (id) => {
    await api.delete(byId(id));
    return id;
  },

  // Admin/HR assigns (or reassigns) a case to an engineer.
  assign: async (id, engineerId) => {
    const { data } = await api.post(`${byId(id)}assign/`, { engineer_id: engineerId });
    return data;
  },

  // Field-driven status transitions (engineer or staff).
  /**
   * At the customer, starting work — and where the phone says that is.
   *
   * The coordinates are sent when there is a fix and left out when there is
   * not: a punch must never fail for want of GPS, because that leaves an
   * engineer standing at a customer unable to record that they are there.
   */
  punchIn: async (id, fix) =>
    (await api.post(`${byId(id)}punch_in/`, fixBody(fix))).data,

  punchOut: async (id, fix, resolutionNotes = "") =>
    (
      await api.post(`${byId(id)}punch_out/`, {
        ...fixBody(fix),
        ...(resolutionNotes ? { resolution_notes: resolutionNotes } : {}),
      })
    ).data,

  /**
   * The engineer's own Assigned / Attended / Closed for today, plus how they
   * are tracking against the close target. Computed in OpenCall and pushed
   * across, so this and the Engineer Productivity dashboard cannot disagree.
   */
  myScorecard: async () => (await api.get(`${BASE}my_scorecard/`)).data,

  accept: async (id) => (await api.post(`${byId(id)}accept/`)).data,
  startTravel: async (id) => (await api.post(`${byId(id)}start_travel/`)).data,
  reached: async (id) => (await api.post(`${byId(id)}reached/`)).data,
  startWork: async (id) => (await api.post(`${byId(id)}start_work/`)).data,
  complete: async (id, resolutionNotes = "") =>
    (await api.post(`${byId(id)}complete/`, { resolution_notes: resolutionNotes })).data,
};
