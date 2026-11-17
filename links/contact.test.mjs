// The contact form and POST /api/contact (plan 5, Task 3). Run from mobile/: node --test ../links/contact.test.mjs
// Nothing here calls Resend: the mailer gets a fake fetch and the handler a fake send.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CONTACT_TOPICS, readForm, validateContact, contactMessage, contactFormHtml, renderContactSent,
} from "./server/lib/contact.mjs";
import { sendContactEmail, CONTACT_FROM } from "./server/lib/mailer.mjs";
import { createRateLimiter } from "./server/lib/rate-limit.mjs";
import handler from "./server/api/contact.mjs";
import { FORM_CSP } from "./server/lib/site.mjs";

const doc = (name) => readFile(new URL(`../docs/legal/${name}`, import.meta.url), "utf8");
const respond = () => {
  const res = { headers: {}, statusCode: 0, body: "", setHeader: (k, v) => (res.headers[k] = v), status: (s) => ({ send: (b) => ((res.statusCode = s), (res.body = b)) }) };
  return res;
};
const post = (body, headers = {}) => ({
  method: "POST",
  headers: { host: "link.resbite.com", origin: "https://link.resbite.com", "x-real-ip": "198.51.100.7", ...headers },
  body,
});
const valid = { name: "Sam", email: "sam@example.com", topic: "help", details: "The Answer button does nothing.", website: "" };
const fresh = () => ({ perAddress: createRateLimiter({ limit: 5, windowMs: 3_600_000 }), overall: createRateLimiter({ limit: 50, windowMs: 3_600_000 }) });

test("the topics are the Support page's, and three go to the privacy inbox", async () => {
  const labels = CONTACT_TOPICS.map((t) => t.label);
  assert.equal(labels.length, 11);
  assert.deepEqual(CONTACT_TOPICS.filter((t) => t.inbox === "privacy").map((t) => t.value), ["data-protection", "legal-request", "delete-account"]);
  const docs = (await doc("support.md")) + (await doc("delete-account.md"));
  for (const quoted of ["An intimate image of me", "Data protection request or complaint", "Complaint", "Appeal", "Legal complaint", "Delete my web-only or banned account"]) {
    assert.ok(docs.includes(`"${quoted}"`), `the documents quote ${quoted}`);
    assert.ok(labels.some((l) => l === quoted || l.startsWith(`${quoted} (`)), `the form offers ${quoted}`);
  }
});

test("readForm keeps strings only, from a parsed or a raw body", () => {
  assert.deepEqual(readForm({ name: ["a", "b"], email: 5, topic: "help" }), { name: "", email: "", topic: "help", details: "", website: "" });
  assert.equal(readForm("name=Sam&email=sam%40example.com").email, "sam@example.com");
  assert.equal(readForm(Buffer.from("details=Hi")).details, "Hi");
});

test("validateContact: each field required and bounded; a comma list or a line break is not an address", () => {
  assert.deepEqual(validateContact(valid), {});
  assert.deepEqual(validateContact({ ...valid, name: " ", topic: "nope", details: "" }), { name: "Enter your name.", topic: "Choose what your message is about.", details: "Tell us the details." });
  assert.equal(validateContact({ ...valid, name: "x".repeat(101) }).name, "Use a name of up to 100 characters.");
  assert.equal(validateContact({ ...valid, details: "x".repeat(5001) }).details, "Keep the details under 5,000 characters.");
  for (const email of ["nope", "a@b.example,c@d.example", "sam@example.com\r\nBcc: x@example.com", "<sam@example.com>"])
    assert.equal(validateContact({ ...valid, email }).email, "Enter an email address we can reply to, like name@example.com.", email);
});

test("contactMessage: the topic's inbox, a fixed subject, the person's address as reply-to", () => {
  assert.deepEqual(contactMessage({ ...valid, topic: "delete-account" }), {
    to: "privacy@resbite.com", replyTo: "sam@example.com", subject: "Contact form: Delete my web-only or banned account",
    text: "Topic: Delete my web-only or banned account\nName: Sam\nEmail: sam@example.com\n\nThe Answer button does nothing.\n\nSent with the contact form on link.resbite.com/support.\n",
  });
  assert.equal(contactMessage(valid).to, "support@resbite.com");
});

test("sendContactEmail posts to Resend with the key and reply_to; a refusal or a missing key throws", async () => {
  const calls = [];
  const fetch = async (url, init) => (calls.push([url, init]), { ok: true, status: 200 });
  await sendContactEmail(contactMessage(valid), { fetch, apiKey: "re_fixture_only" });
  const [url, init] = calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.headers.Authorization, "Bearer re_fixture_only");
  assert.deepEqual(JSON.parse(init.body), { from: CONTACT_FROM, to: ["support@resbite.com"], reply_to: "sam@example.com", subject: "Contact form: Help with the app", text: contactMessage(valid).text });
  await assert.rejects(sendContactEmail(contactMessage(valid), { fetch: async () => ({ ok: false, status: 422 }), apiKey: "re_fixture_only" }), /422/);
  await assert.rejects(sendContactEmail(contactMessage(valid), { fetch, apiKey: "" }), /RESEND_API_KEY/);
  assert.equal(calls.length, 1);
});

test("createRateLimiter: a limit per key per window; a full map refuses new keys", () => {
  let t = 0;
  const limit = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 2, now: () => t });
  assert.deepEqual([limit.take("a"), limit.take("a"), limit.take("a"), limit.take("b"), limit.take("c")], [true, true, false, true, false]);
  t = 1000;
  assert.deepEqual([limit.take("a"), limit.take("c")], [true, true]);
});

test("the form posts to /api/contact, with labelled fields, the topics and a trap field no one reaches", () => {
  const html = contactFormHtml();
  assert.ok(html.includes('<form id="contact-form" class="contact" method="post" action="/api/contact" aria-label="Contact form">'));
  for (const id of ["contact-name", "contact-email", "contact-topic", "contact-details"]) assert.ok(html.includes(`<label for="${id}">`), id);
  assert.ok(html.includes('<option value="intimate-image">An intimate image of me</option>') && html.includes('autocomplete="email"') && html.includes('maxlength="5000"'));
  assert.match(html, /<div class="trap" aria-hidden="true">[\s\S]*<input id="contact-website" name="website" tabindex="-1" autocomplete="off"/);
  const again = contactFormHtml({ values: { ...valid, topic: "appeal" }, errors: { email: "Enter an email address we can reply to, like name@example.com." } });
  assert.ok(again.includes('<option value="appeal" selected>Appeal</option>'));
  assert.match(again, /id="contact-email"[^>]*aria-invalid="true"[^>]*aria-describedby="contact-email-hint contact-email-error"/);
});

test("a valid message goes to its inbox, then the person goes to /support/sent", async () => {
  const sent = [], res = respond();
  await handler(post({ ...valid, topic: "legal-request" }), res, { send: async (m) => sent.push(m), ...fresh() });
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "/support/sent");
  assert.equal(sent[0].to, "privacy@resbite.com");
  assert.equal(res.headers["Content-Security-Policy"], FORM_CSP);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("a message with errors comes back with them and the person's words, escaped, and nothing is sent", async () => {
  const sent = [], res = respond();
  await handler(post({ ...valid, name: "<script>x</script>", email: "nope" }), res, { send: async (m) => sent.push(m), ...fresh() });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('value="&lt;script&gt;x&lt;/script&gt;"') && !res.body.includes("<script>x"));
  assert.ok(res.body.includes('<div class="error-summary" role="alert">') && res.body.includes('<a href="#contact-email">'));
  assert.ok(res.body.includes(`<meta http-equiv="Content-Security-Policy" content="${FORM_CSP}" />`));
  assert.equal(sent.length, 0);
});

test("GET is refused, a post from another site is refused, and the trap pretends to send", async () => {
  const sent = [], send = async (m) => sent.push(m);
  const get = respond(); await handler({ method: "GET", headers: {} }, get, { send, ...fresh() });
  assert.equal(get.statusCode, 405); assert.equal(get.headers.Allow, "POST");
  const away = respond(); await handler(post(valid, { origin: "https://elsewhere.example" }), away, { send, ...fresh() });
  assert.equal(away.statusCode, 403);
  const trap = respond(); await handler(post({ ...valid, website: "https://spam.example" }), trap, { send, ...fresh() });
  assert.equal(trap.statusCode, 303);
  assert.equal(sent.length, 0);
});

test("a same-site post that browsers label Origin: null (the pages send no referrer) goes through; a cross-site one does not", async () => {
  const sent = [], send = async (m) => sent.push(m);
  const same = respond(); await handler(post(valid, { origin: "null", "sec-fetch-site": "same-origin" }), same, { send, ...fresh() });
  assert.equal(same.statusCode, 303);
  const cross = respond(); await handler(post(valid, { origin: "null", "sec-fetch-site": "cross-site" }), cross, { send, ...fresh() });
  assert.equal(cross.statusCode, 403);
  const crossNamed = respond(); await handler(post(valid, { "sec-fetch-site": "cross-site" }), crossNamed, { send, ...fresh() });
  assert.equal(crossNamed.statusCode, 403);
  assert.equal(sent.length, 1);
});

test("the sixth message in an hour from one address is refused; another address still gets through", async () => {
  const sent = [], send = async (m) => sent.push(m), limits = fresh(), codes = [];
  for (let i = 0; i < 6; i++) { const res = respond(); await handler(post(valid), res, { send, ...limits }); codes.push(res.statusCode); }
  assert.deepEqual(codes, [303, 303, 303, 303, 303, 429]);
  const other = respond(); await handler(post(valid, { "x-real-ip": "198.51.100.8" }), other, { send, ...limits });
  assert.equal(other.statusCode, 303);
  assert.equal(sent.length, 6);
});

test("a failed send keeps the person's words and names the topic's inbox; nothing is logged", async () => {
  const logged = [], keep = { ...console };
  for (const k of ["log", "info", "warn", "error"]) console[k] = (...a) => logged.push(a);
  try {
    const res = respond();
    await handler(post({ ...valid, topic: "data-protection" }), res, { send: async () => { throw Error("boom"); }, ...fresh() });
    assert.equal(res.statusCode, 502);
    assert.ok(res.body.includes("We couldn’t send your message. Try again, or email privacy@resbite.com.") && res.body.includes("The Answer button does nothing."));
  } finally { Object.assign(console, keep); }
  assert.deepEqual(logged, []);
});

test("the sent page: no form, noindex, and the way back", () => {
  const html = renderContactSent();
  assert.ok(html.includes("<h1>Message sent</h1>") && html.includes('<a href="/support#how-quickly-we-respond">How quickly we respond</a>'));
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow" />') && !html.includes("<form"));
});
