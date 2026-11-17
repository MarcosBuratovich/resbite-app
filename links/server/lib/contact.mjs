// The contact form on /support: its topics and words, reading and checking what was posted, the message, and the
// HTML of the form and its pages. Pure: data in, HTML out. Everything a person typed goes through escapeHtml.
import { COMPANY, FORM_CSP, escapeHtml, sitePage } from "./site.mjs";
import { PAGE_CSP } from "./render.mjs";

export const INBOXES = { support: COMPANY.support, privacy: COMPANY.privacy };

export const CONTACT_TOPICS = [
  { value: "help", label: "Help with the app", inbox: "support" },
  { value: "report", label: "Report content or a person", inbox: "support" },
  { value: "intimate-image", label: "An intimate image of me", inbox: "support" },
  { value: "child-safety", label: "Child safety", inbox: "support" },
  { value: "complaint", label: "Complaint", inbox: "support" },
  { value: "appeal", label: "Appeal", inbox: "support" },
  { value: "data-protection", label: "Data protection request or complaint (privacy)", inbox: "privacy" },
  { value: "legal-complaint", label: "Legal complaint (defamation, copyright or privacy)", inbox: "support" },
  { value: "legal-request", label: "Legal request from a court, the police or a regulator (privacy)", inbox: "privacy" },
  { value: "delete-account", label: "Delete my web-only or banned account", inbox: "privacy" },
  { value: "other", label: "Something else", inbox: "support" },
];

export const CONTACT_WORDS = {
  formLabel: "Contact form",
  name: "Your name",
  email: "Your email address",
  emailHint: "We reply to this address.",
  topic: "What is it about?",
  topicPrompt: "Choose a topic",
  details: "Details",
  detailsHint: "Say what happened and where: the resbite’s title and date, the name the person uses, or the link you were sent. Please don’t send images.",
  send: "Send message",
  errors: {
    name: "Enter your name.",
    nameLong: "Use a name of up to 100 characters.",
    email: "Enter an email address we can reply to, like name@example.com.",
    topic: "Choose what your message is about.",
    details: "Tell us the details.",
    detailsLong: "Keep the details under 5,000 characters.",
  },
  summary: "There is a problem",
  pageTitle: "Contact us",
  sendFailed: (address) => `We couldn’t send your message. Try again, or email ${address}.`,
  tooManyHeading: "Too many messages",
  tooManyBody: "You’ve sent several messages in a short time. Try again in an hour, or email support@resbite.com.",
  refusedHeading: "Message not sent",
  refusedBody: "Send your message from our Support page.",
  sentHeading: "Message sent",
  sentBody: "Thanks. Your message is with our team. We reply by email.",
  sentTimes: "How quickly we respond",
  back: "Back to Support",
};

const EMAIL = /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[^\s@<>(),;:"\[\]]+$/;
const FIELDS = ["name", "email", "topic", "details", "website"];
const topicOf = (value) => CONTACT_TOPICS.find((t) => t.value === value);

/** The five fields as strings; anything that is not a string (an array from a repeated field, a number) is "". */
export function readForm(body) {
  let source = body;
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    const params = new URLSearchParams(body.toString());
    source = Object.fromEntries(FIELDS.map((f) => [f, params.get(f) ?? ""]));
  }
  const out = {};
  for (const f of FIELDS) out[f] = typeof source?.[f] === "string" ? source[f] : "";
  return out;
}

export function validateContact(values) {
  const errors = {};
  const e = CONTACT_WORDS.errors;
  const name = values.name.trim();
  if (!name) errors.name = e.name;
  else if (name.length > 100) errors.name = e.nameLong;
  const email = values.email.trim();
  if (email.length > 254 || !EMAIL.test(email)) errors.email = e.email;
  if (!topicOf(values.topic)) errors.topic = e.topic;
  const details = values.details.trim();
  if (!details) errors.details = e.details;
  else if (details.length > 5000) errors.details = e.detailsLong;
  return errors;
}

export function contactMessage(values) {
  const topic = topicOf(values.topic);
  const name = values.name.trim();
  const email = values.email.trim();
  const details = values.details.trim();
  return {
    to: INBOXES[topic.inbox],
    replyTo: email,
    subject: `Contact form: ${topic.label}`,
    text: `Topic: ${topic.label}\nName: ${name}\nEmail: ${email}\n\n${details}\n\nSent with the contact form on link.resbite.com/support.\n`,
  };
}

export function contactFormHtml({ values = {}, errors = {} } = {}) {
  const w = CONTACT_WORDS;
  const v = (f) => escapeHtml(values[f] ?? "");
  const field = (id, label, control, hint) => {
    const hintHtml = hint ? `\n    <p class="hint" id="contact-${id}-hint">${escapeHtml(hint)}</p>` : "";
    const errorHtml = errors[id] ? `\n    <p class="error" id="contact-${id}-error">${escapeHtml(errors[id])}</p>` : "";
    return `  <div class="field">\n    <label for="contact-${id}">${escapeHtml(label)}</label>${hintHtml}${errorHtml}\n    ${control}\n  </div>`;
  };
  const state = (id, hint) => {
    const ids = [hint ? `contact-${id}-hint` : "", errors[id] ? `contact-${id}-error` : ""].filter(Boolean).join(" ");
    return `${errors[id] ? ' aria-invalid="true"' : ""}${ids ? ` aria-describedby="${ids}"` : ""}`;
  };
  const options = [`<option value="">${escapeHtml(w.topicPrompt)}</option>`]
    .concat(CONTACT_TOPICS.map((t) => `<option value="${t.value}"${values.topic === t.value ? " selected" : ""}>${escapeHtml(t.label)}</option>`))
    .join("\n      ");
  return `<form id="contact-form" class="contact" method="post" action="/api/contact" aria-label="${escapeHtml(w.formLabel)}">
${field("name", w.name, `<input id="contact-name" name="name" type="text" autocomplete="name" required maxlength="100" value="${v("name")}"${state("name")} />`)}
${field("email", w.email, `<input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254" value="${v("email")}"${state("email", true)} />`, w.emailHint)}
${field("topic", w.topic, `<select id="contact-topic" name="topic" required${state("topic")}>\n      ${options}\n    </select>`)}
${field("details", w.details, `<textarea id="contact-details" name="details" rows="8" required maxlength="5000"${state("details", true)}>${v("details")}</textarea>`, w.detailsHint)}
  <div class="trap" aria-hidden="true">
    <label for="contact-website">Leave this empty</label>
    <input id="contact-website" name="website" tabindex="-1" autocomplete="off" />
  </div>
  <button type="submit" class="button">${escapeHtml(w.send)}</button>
</form>`;
}

export function renderContactPage({ values, errors, problem = "" }) {
  const w = CONTACT_WORDS;
  const list = ["name", "email", "topic", "details"].filter((f) => errors?.[f]);
  const summary = list.length
    ? `<div class="error-summary" role="alert"><h2>${escapeHtml(w.summary)}</h2><ul>${list
        .map((f) => `<li><a href="#contact-${f}">${escapeHtml(errors[f])}</a></li>`).join("")}</ul></div>`
    : "";
  const problemHtml = problem ? `<p class="problem" role="alert">${escapeHtml(problem)}</p>` : "";
  return sitePage({
    title: w.pageTitle,
    csp: FORM_CSP,
    robots: false,
    body: `<h1>${escapeHtml(w.pageTitle)}</h1>${summary}${problemHtml}\n${contactFormHtml({ values, errors })}`,
  });
}

/** A short page with a heading and trusted HTML for the body (callers escape anything a person typed). */
export function renderStatusPage(heading, body, csp) {
  return sitePage({ title: heading, csp, robots: false, body: `<h1>${escapeHtml(heading)}</h1>\n${body}` });
}

export function renderContactSent() {
  const w = CONTACT_WORDS;
  return renderStatusPage(
    w.sentHeading,
    `<p>${escapeHtml(w.sentBody)}</p>\n<p><a href="/support#how-quickly-we-respond">${escapeHtml(w.sentTimes)}</a></p>\n<p><a href="/support">${escapeHtml(w.back)}</a></p>`,
    PAGE_CSP,
  );
}

export function contactHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": FORM_CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}
