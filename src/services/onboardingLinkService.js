import axios from "axios";

import { api } from "../api/Api";
import { Base_URL } from "../api/Api";

/**
 * The shared onboarding link, from both ends.
 *
 * The public calls deliberately do NOT go through `api`. That instance carries
 * the office's token on every request and, on a 401, tries to refresh it and
 * sends the page to /login -- all of which is right for the app and wrong for
 * a stranger opening a link on their own phone, who has no session to refresh
 * and no business being shown a login screen.
 */
const open = axios.create({ baseURL: Base_URL });

export const onboardingLinkService = {
  /** The three links, for the office to copy. HR only. */
  list: async () => {
    const { data } = await api.get("/api/onboarding-links/");
    return data;
  },

  /** Replace one link. Whatever was handed out stops working immediately. */
  rotate: async (category) => {
    const { data } = await api.post(`/api/onboarding-links/${category}/rotate/`);
    return data;
  },

  /** Which form a link draws. The only thing the public end will tell anybody. */
  describe: async (token) => {
    const { data } = await open.get(`/api/onboard/${token}/`);
    return data;
  },

  /** Somebody filling in their own form. */
  submit: async (token, formData) => {
    const { data } = await open.post(`/api/onboard/${token}/`, formData);
    return data;
  },
};

/**
 * The URL to hand out.
 *
 * Built off the page the office is standing on rather than a value in the
 * build, so the link is whatever they would have typed themselves -- and so a
 * copy made from the test site cannot send somebody to the live one.
 */
export const onboardingLinkUrl = (token) => `${window.location.origin}/onboard/${token}`;
