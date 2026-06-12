import { api } from "../api/Api";

const ENDPOINTS = {
  BASE: "/api/attendance/",
  BY_ID: (id) => `/api/attendance/${id}/`,
  BULK: "/api/attendance/bulk/",
  STATS: "/api/attendance/stats/",
  CHECK_IN: "/api/attendance/check_in/",
  CHECK_OUT: "/api/attendance/check_out/",
};

export const attendanceService = {
  checkIn: async (geoData) => {
    const { data } = await api.post(ENDPOINTS.CHECK_IN, geoData);
    return data;
  },

  checkOut: async (geoData) => {
    const { data } = await api.post(ENDPOINTS.CHECK_OUT, geoData);
    return data;
  },

  getAll: async (params = {}) => {
    const { data } = await api.get(ENDPOINTS.BASE, { params });
    return data;
  },

  getById: async (id) => {
    const { data } = await api.get(ENDPOINTS.BY_ID(id));
    return data;
  },

  create: async (attendanceData) => {
    const { data } = await api.post(ENDPOINTS.BASE, attendanceData);
    return data;
  },

  update: async (id, attendanceData) => {
    const { data } = await api.put(ENDPOINTS.BY_ID(id), attendanceData);
    return data;
  },

  patch: async (id, partialData) => {
    const { data } = await api.patch(ENDPOINTS.BY_ID(id), partialData);
    return data;
  },

  delete: async (id) => {
    await api.delete(ENDPOINTS.BY_ID(id));
    return id;
  },

  bulkCreate: async (attendanceArray) => {
    const { data } = await api.post(ENDPOINTS.BULK, attendanceArray);
    return data;
  },

  importSheet: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post("/api/attendance/import_sheet/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return data;
  },

  deleteAll: async () => {
    const { data } = await api.delete("/api/attendance/delete_all/");
    return data;
  },

  getStats: async () => {
    const { data } = await api.get(ENDPOINTS.STATS);
    return data;
  },
};
