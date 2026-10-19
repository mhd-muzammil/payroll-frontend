import { api, Base_URL } from "../api/Api";

const ENDPOINTS = {
    BASE: "/api/offer-letters/",
    BY_ID: (id) => `/api/offer-letters/${id}/`,
    NEXT_REF: "/api/offer-letters/next_ref/",
    PDF_TICKET: (id) => `/api/offer-letters/${id}/pdf_ticket/`,
};

export const offerLetterService = {
    list: async () => (await api.get(ENDPOINTS.BASE)).data,

    create: async (body) => (await api.post(ENDPOINTS.BASE, body)).data,

    update: async (id, body) => (await api.put(ENDPOINTS.BY_ID(id), body)).data,

    remove: async (id) => api.delete(ENDPOINTS.BY_ID(id)),

    /** The reference the next letter should carry, e.g. RTPL/NJ/2026/141. */
    nextRef: async () => (await api.get(ENDPOINTS.NEXT_REF)).data?.ref_no || "",

    /**
     * Opens the letter's PDF. As for payslips: a navigation to the API host
     * (a desktop downloads it; the app hands it to the phone's browser), paid
     * for with a short-lived ticket because a navigation carries no JWT.
     */
    download: async (id) => {
        const { data } = await api.get(ENDPOINTS.PDF_TICKET(id));
        if (!data?.path) throw new Error("No download link came back.");
        window.location.href = `${Base_URL}${data.path}`;
    },
};
