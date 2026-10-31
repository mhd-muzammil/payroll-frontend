import axios from "axios";

import { api, Base_URL } from "../api/Api";

const ENDPOINTS = {
    BASE: "/api/appointment-orders/",
    BY_ID: (id) => `/api/appointment-orders/${id}/`,
    SEND: (id) => `/api/appointment-orders/${id}/send/`,
    LINK: (id) => `/api/appointment-orders/${id}/link/`,
    PDF_TICKET: (id) => `/api/appointment-orders/${id}/pdf_ticket/`,
    PHOTO: (id) => `/api/appointment-orders/${id}/photo/`,
    SIGNATURE_PHOTO: (id) => `/api/appointment-orders/${id}/signature-photo/`,
};

/**
 * The employee's end goes round `api` on purpose, as the onboarding link does:
 * `api` carries the office's login and sends a 401 to /login, and somebody
 * opening their appointment order on their own phone has neither.
 */
const open = axios.create({ baseURL: Base_URL });

/** A picture from the API, as a data: URL for an <img>. */
const picture = async (url) => {
    const { data } = await api.get(url, { responseType: "blob" });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read the photo."));
        reader.readAsDataURL(data);
    });
};

export const appointmentOrderService = {
    list: async () => (await api.get(ENDPOINTS.BASE)).data,

    create: async (body) => (await api.post(ENDPOINTS.BASE, body)).data,

    update: async (id, body) => (await api.put(ENDPOINTS.BY_ID(id), body)).data,

    remove: async (id) => api.delete(ENDPOINTS.BY_ID(id)),

    /** Email the employee a link to sign. Any earlier link stops working. */
    send: async (id) => (await api.post(ENDPOINTS.SEND(id), { origin: window.location.origin })).data,

    /** The link that was emailed, to pass on another way. */
    link: async (id) =>
        (await api.get(ENDPOINTS.LINK(id), { params: { origin: window.location.origin } })).data?.link || "",

    /** Opens the PDF the same way offer letters and payslips do. */
    download: async (id) => {
        const { data } = await api.get(ENDPOINTS.PDF_TICKET(id));
        if (!data?.path) throw new Error("No download link came back.");
        window.location.href = `${Base_URL}${data.path}`;
    },

    /** The photo the employee took when signing, as a data: URL for an <img>. */
    photo: (id) => picture(ENDPOINTS.PHOTO(id)),

    /** The photo of their signature on paper, taken when signing, the same way. */
    signaturePhoto: (id) => picture(ENDPOINTS.SIGNATURE_PHOTO(id)),

    // ---- the employee, from the emailed link

    read: async (token) => (await open.get(`/api/appointment/${token}/`)).data,

    sendCode: async (token) => (await open.post(`/api/appointment/${token}/code/`, {})).data,

    /**
     * The ink the server takes from a photo of the paper signature, as a data: URL. Nothing is kept.
     * Given up after a minute, so a stalled upload says so instead of spinning.
     */
    previewSignature: async (token, signaturePhoto) =>
        (
            await open.post(
                `/api/appointment/${token}/signature-preview/`,
                { signature_photo: signaturePhoto },
                { timeout: 60000 },
            )
        ).data?.signature || "",

    sign: async (token, body) => (await open.post(`/api/appointment/${token}/sign/`, body)).data,

    pdfUrl: (token) => `${Base_URL}/api/appointment/${token}/pdf/`,
};
