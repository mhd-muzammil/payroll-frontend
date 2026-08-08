import { api } from "../api/Api";

const BASE = "/api/requests/";

export const requestService = {
  getAll: async (params = {}) => {
    const { data } = await api.get(BASE, { params });
    return data;
  },

  summary: async () => {
    const { data } = await api.get(`${BASE}summary/`);
    return data;
  },

  create: async (payload) => {
    const { data } = await api.post(BASE, payload);
    return data;
  },

  update: async (id, payload) => {
    const { data } = await api.patch(`${BASE}${id}/`, payload);
    return data;
  },

  withdraw: async (id) => {
    await api.delete(`${BASE}${id}/`);
    return id;
  },

  approve: async (id, note = "") => {
    const { data } = await api.post(`${BASE}${id}/approve/`, { note });
    return data;
  },

  reject: async (id, note = "") => {
    const { data } = await api.post(`${BASE}${id}/reject/`, { note });
    return data;
  },

  // Reading the thread also clears the unread flag for whichever side asked.
  messages: async (id) => {
    const { data } = await api.get(`${BASE}${id}/messages/`);
    return data;
  },

  sendMessage: async (id, body) => {
    const { data } = await api.post(`${BASE}${id}/messages/`, { body });
    return data;
  },
};
