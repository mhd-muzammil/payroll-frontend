import { api } from "../api/Api";

const ENDPOINTS = {
    BASE: "/api/employees/",
    BY_ID: (id) => `/api/employees/${id}/`,
    BULK: "/api/employees/bulk/",
    STATS: "/api/employees/stats/",
    APP_USAGE: "/api/employees/app_usage/",
    APP_HISTORY: (id) => `/api/employees/${id}/app_history/`,
};

export const employeeService = {

    /**
     * Who has started using the phone app and who has not. Employee-centric:
     * somebody with no login account cannot use it at all, and they are the
     * row that matters most.
     */
    appUsage: async () => (await api.get(ENDPOINTS.APP_USAGE)).data,

    /** Every change in how one employee's phone was set up, newest first. */
    appHistory: async (id) => (await api.get(ENDPOINTS.APP_HISTORY(id))).data,

    getAll: async (params = {}) => {
        const { data } = await api.get(ENDPOINTS.BASE, { params });
        return data;
    },

    getById: async (id) => {
        const { data } = await api.get(ENDPOINTS.BY_ID(id));
        return data;
    },

    create: async (employeeData) => {
        const { data } = await api.post(ENDPOINTS.BASE, employeeData);
        return data;
    },

    update: async (id, employeeData) => {
        const { data } = await api.put(ENDPOINTS.BY_ID(id), employeeData);
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
