import { api } from "../api/Api";

const ENDPOINTS = {
    BASE: "/api/performance/",
    BY_ID: (id) => `/api/performance/${id}/`,
};

export const performanceService = {
    getAll: async (params = {}) => {
        const { data } = await api.get(ENDPOINTS.BASE, { params });
        return data;
    },

    getById: async (id) => {
        const { data } = await api.get(ENDPOINTS.BY_ID(id));
        return data;
    },

    create: async (performanceData) => {
        const { data } = await api.post(ENDPOINTS.BASE, performanceData);
        return data;
    },

    update: async (id, performanceData) => {
        const { data } = await api.put(ENDPOINTS.BY_ID(id), performanceData);
        return data;
    },

    delete: async (id) => {
        await api.delete(ENDPOINTS.BY_ID(id));
        return id;
    },
};
