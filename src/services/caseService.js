import { api } from "../api/Api";

const BASE = "/api/cases/";
const byId = (id) => `${BASE}${id}/`;

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
  accept: async (id) => (await api.post(`${byId(id)}accept/`)).data,
  startTravel: async (id) => (await api.post(`${byId(id)}start_travel/`)).data,
  reached: async (id) => (await api.post(`${byId(id)}reached/`)).data,
  startWork: async (id) => (await api.post(`${byId(id)}start_work/`)).data,
  complete: async (id, resolutionNotes = "") =>
    (await api.post(`${byId(id)}complete/`, { resolution_notes: resolutionNotes })).data,
};
