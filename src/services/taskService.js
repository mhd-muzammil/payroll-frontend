import { api } from "../api/Api";

const ENDPOINTS = {
    BASE: "/api/tasks/",
    BY_ID: (id) => `/api/tasks/${id}/`,
};

export const taskService = {
    getAll: async (params = {}) => {
        const { data } = await api.get(ENDPOINTS.BASE, { params });
        return data;
    },

    getById: async (id) => {
        const { data } = await api.get(ENDPOINTS.BY_ID(id));
        return data;
    },

    create: async (taskData) => {
        const { data } = await api.post(ENDPOINTS.BASE, taskData);
        return data;
    },

    update: async (id, taskData) => {
        const { data } = await api.put(ENDPOINTS.BY_ID(id), taskData);
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
