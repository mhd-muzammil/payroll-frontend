import { api } from "../api/Api";

const ENDPOINTS = {
    BASE: "/api/assets/",
    BY_ID: (id) => `/api/assets/${id}/`,
};

export const assetService = {
    getAll: async (params = {}) => {
        const { data } = await api.get(ENDPOINTS.BASE, { params });
        return data;
    },

    getById: async (id) => {
        const { data } = await api.get(ENDPOINTS.BY_ID(id));
        return data;
    },

    create: async (assetData) => {
        const { data } = await api.post(ENDPOINTS.BASE, assetData);
        return data;
    },

    update: async (id, assetData) => {
        const { data } = await api.put(ENDPOINTS.BY_ID(id), assetData);
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
};
