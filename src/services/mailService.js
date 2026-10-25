import { api, Base_URL } from "../api/Api";

/** The Mail section: the HR mailbox, read and answered from inside Payroll. */
export const mailService = {
    summary: async () => (await api.get("/api/hr-mail/")).data,

    /** Copy in mail that has arrived since the last look. */
    sync: async (force = false) => (await api.post("/api/hr-mail/sync/", { force })).data,

    list: async (status, q = "", offset = 0) =>
        (await api.get("/api/hr-mail/messages/", { params: { status, q: q || undefined, offset } })).data,

    detail: async (id) => (await api.get(`/api/hr-mail/messages/${id}/`)).data,

    setStatus: async (id, status) => (await api.post(`/api/hr-mail/messages/${id}/status/`, { status })).data,

    reply: async (id, body) => (await api.post(`/api/hr-mail/messages/${id}/reply/`, { body })).data,

    compose: async ({ to, cc, subject, body, files }) => {
        const form = new FormData();
        form.append("to", to);
        form.append("cc", cc || "");
        form.append("subject", subject);
        form.append("body", body);
        (files || []).forEach((file) => form.append("files", file));
        return (await api.post("/api/hr-mail/compose/", form, {
            headers: { "Content-Type": "multipart/form-data" },
        })).data;
    },

    sent: async () => (await api.get("/api/hr-mail/sent/")).data,

    system: async () => (await api.get("/api/hr-mail/system/")).data,

    /** One Payroll mail, opened again: its text and what it carried. */
    systemDetail: async (id) => (await api.get(`/api/hr-mail/system/${id}/`)).data,

    /** A file a Payroll mail carried, saved the way payslips are. */
    systemDownload: async (mailId, attachmentId) => {
        const { data } = await api.get(`/api/hr-mail/system/${mailId}/attachments/${attachmentId}/ticket/`);
        if (!data?.path) throw new Error("No download link came back.");
        window.location.href = `${Base_URL}${data.path}`;
    },

    /** A picture inside the mail, fetched with the login and shown as a blob. */
    attachmentBlobUrl: async (mailId, attachmentId) => {
        const { data } = await api.get(`/api/hr-mail/messages/${mailId}/attachments/${attachmentId}/`, {
            responseType: "blob",
        });
        return URL.createObjectURL(data);
    },

    /**
     * Saves an attachment. As for payslips and offer letters: a navigation to
     * the API host with a five-minute ticket, because in the phone app that is
     * the only way a file reaches the phone, and a navigation carries no login.
     */
    download: async (mailId, attachmentId) => {
        const { data } = await api.get(`/api/hr-mail/messages/${mailId}/attachments/${attachmentId}/ticket/`);
        if (!data?.path) throw new Error("No download link came back.");
        window.location.href = `${Base_URL}${data.path}`;
    },
};
