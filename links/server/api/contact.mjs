// POST /api/contact: the contact form on /support. Checks the input, limits each address, sends through Resend to the
// support or the privacy inbox by topic, and redirects to /support/sent. Nothing here logs: not a message, an address or an IP.
import { CONTACT_TOPICS, CONTACT_WORDS, INBOXES, contactHeaders, contactMessage, readForm, renderContactPage, renderStatusPage, validateContact } from "../lib/contact.mjs";
import { sendContactEmail } from "../lib/mailer.mjs";
import { createRateLimiter } from "../lib/rate-limit.mjs";
import { FORM_CSP, escapeHtml } from "../lib/site.mjs";

export const PER_ADDRESS = createRateLimiter({ limit: 5, windowMs: 3_600_000 });
export const OVERALL = createRateLimiter({ limit: 50, windowMs: 3_600_000 });

const addressOf = (req) => {
  const real = req.headers?.["x-real-ip"];
  if (typeof real === "string" && real) return real;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return "unknown";
};

// The pages send no referrer, so a browser labels its own site's form post "Origin: null": that is accepted when the
// browser's fetch metadata says same-origin (or says nothing, as older browsers do). Any other site is refused.
const sameOrigin = (req) => {
  const site = req.headers?.["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers?.origin;
  if (origin === undefined || origin === "null") return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
};

/** Handler for POST /api/contact. `deps` lets tests inject the sender and the limiters. */
export default async function handler(req, res, deps = {}) {
  const { send = sendContactEmail, perAddress = PER_ADDRESS, overall = OVERALL } = deps;
  const w = CONTACT_WORDS;
  const reply = (status, body, extra = {}) => {
    for (const [k, v] of Object.entries({ ...contactHeaders(), ...extra })) res.setHeader(k, v);
    res.status(status).send(body);
  };
  const refused = (status, extra) => reply(status, renderStatusPage(w.refusedHeading, `<p>${escapeHtml(w.refusedBody)}</p>`, FORM_CSP), extra);

  if (req.method !== "POST") return refused(405, { Allow: "POST" });
  if (!sameOrigin(req)) return refused(403);

  const values = readForm(req.body);
  if (values.website) return reply(303, "", { Location: "/support/sent" });
  const errors = validateContact(values);
  if (Object.keys(errors).length) return reply(400, renderContactPage({ values, errors }));
  if (!perAddress.take(addressOf(req)) || !overall.take("all")) {
    return reply(429, renderStatusPage(w.tooManyHeading, `<p>${escapeHtml(w.tooManyBody)}</p>`, FORM_CSP), { "Retry-After": "3600" });
  }
  try {
    await send(contactMessage(values));
  } catch {
    const inbox = INBOXES[CONTACT_TOPICS.find((t) => t.value === values.topic).inbox];
    return reply(502, renderContactPage({ values, errors: {}, problem: w.sendFailed(inbox) }));
  }
  return reply(303, "", { Location: "/support/sent" });
}
