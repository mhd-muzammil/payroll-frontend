import axios from "axios";

import { api, Base_URL } from "../api/Api";

// The candidate's page goes round `api`, as the other public pages do: no login
// to send, and no /login redirect on a 401.
const open = axios.create({ baseURL: Base_URL });

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

    /** The offer mail exactly as it will go: { subject, html, attachment }. */
    mailPreview: async (id, dear) =>
        (await api.get(`/api/offer-letters/${id}/mail_preview/`, { params: { dear } })).data,

    /**
     * Mail the letter from the HR mailbox, in HR's offer mail, PDF attached.
     * Its Accept / Decline buttons lead back to this site.
     */
    sendMail: async (id, body) =>
        (await api.post(`/api/offer-letters/${id}/send_mail/`, { ...body, origin: window.location.origin })).data,

    /** HR records the candidate's answer: "ACCEPTED", "DECLINED", or "" to clear it. */
    setResponse: async (id, response) => (await api.post(`/api/offer-letters/${id}/response/`, { response })).data,

    // ---- the candidate, from the buttons in the offer mail (no login)

    describeOffer: async (token) => (await open.get(`/api/offer/${token}/`)).data,

    answerOffer: async (token, answer) => (await open.post(`/api/offer/${token}/respond/`, { answer })).data,

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
