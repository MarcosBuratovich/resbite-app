// The personal invitation page /i/<code> (contact invitations, Task 10). Run from mobile/: node --test ../links/personal.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { renderPersonalPage, personalHeaders, personalCsp } from "./server/lib/personal.mjs";
import { PAGE_CSP } from "./server/lib/render.mjs";
import { readPersonalInvitation } from "./server/lib/supabase.mjs";
import personal from "./server/api/personal.mjs";
import image from "./server/api/image.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const code = "k7Qx9AbCdEfGhIjKlMnOpQ";
const options = {
  origin: "https://link.resbite.com", code, appStoreUrl: "https://testflight.apple.com/join/abc",
  supabaseUrl: "https://ewcsgvhuojxdpaspwsrx.supabase.co", publishableKey: "sb_publishable_KEY123",
  termsVersion: "2026-10", termsUrl: "https://www.resbite.com/terms", privacyUrl: "https://www.resbite.com/privacy",
};
const open = {
  state: "open", host: "Marcos", title: "Picnic in the park", starts_at: "2099-11-02T13:00:00+00:00", ends_at: "2099-11-02T16:00:00+00:00",
  time_zone: "Europe/London", area: "Hyde Park area", going: 4, image: { kind: "cover", ref: "covers/x/1.jpg" }, ending: "34", country: "44",
};

test("the open page is screen 1: host, picture, title, time, area, going, ending and Answer", () => {
  const html = renderPersonalPage(open, options);
  for (const text of ["Marcos invited you", "Picnic in the park", "Mon 2 Nov, 13:00 – 16:00", "Hyde Park area", "4 going",
    "This invitation is for the number ending ••34.", "Answer", "Not your number? Ask Marcos to check it."])
    assert.ok(html.includes(text), text);
  assert.ok(html.includes(`src="https://link.resbite.com/i/${code}/image"`) || html.includes(`src="/i/${code}/image"`));
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.ok(html.includes('<html lang="en">') && !html.includes("user-scalable=no"));
  assert.match(html, /<script type="module" src="\/personal\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/page\.css" \/>\s*<link rel="stylesheet" href="\/personal\.css" \/>/);
  for (const step of ["confirm", "code", "answer", "app"]) assert.match(html, new RegExp(`id="step-${step}"[^>]*hidden`), step);
  assert.ok(!html.includes("000000"));
});

test("data attributes carry the client's inputs, and the key appears only there", () => {
  const html = renderPersonalPage(open, options);
  const main = html.match(/<main [^>]*>/)[0];
  for (const [name, value] of [["supabase-url", options.supabaseUrl], ["publishable-key", options.publishableKey], ["code", code],
    ["country", "44"], ["ending", "34"], ["host", "Marcos"], ["terms-version", "2026-10"], ["app-store-url", options.appStoreUrl]])
    assert.ok(main.includes(`data-${name}="${value}"`), name);
  assert.equal(html.split(options.publishableKey).length, 2, "exactly once");
  assert.ok(html.indexOf(options.publishableKey) > html.indexOf("<main"));
});

test("the preview carries the title, date, host and image; never the area, place or number", () => {
  const html = renderPersonalPage(open, options);
  const head = html.slice(0, html.indexOf("<body>"));
  assert.ok(head.includes('<meta property="og:title" content="Picnic in the park" />'));
  assert.ok(head.includes('<meta property="og:description" content="Mon 2 Nov, 13:00 · Invited by Marcos" />'));
  assert.ok(head.includes(`<meta property="og:image" content="https://link.resbite.com/i/${code}/image" />`));
  for (const secret of ["Hyde Park", "covers/x", "••", "ending", options.publishableKey]) assert.ok(!head.includes(secret), secret);
});

test("text is escaped and extra keys never reach the page", () => {
  const leaky = { ...open, host: "<i>Mo</i> & \"Jo\"", title: "<b>Pic</b>", place_label: "12 Secret Street", phone: "447700900834" };
  const html = renderPersonalPage(leaky, { ...options, termsUrl: "" });
  assert.ok(!html.includes("Secret") && !html.includes("447700900834") && !html.includes("<b>Pic") && !html.includes("<i>Mo"));
  assert.ok(html.includes("&lt;i&gt;Mo&lt;/i&gt; &amp; &quot;Jo&quot;"));
});

test("a missing area shows no area line", () => {
  const html = renderPersonalPage({ ...open, area: null, going: 0 }, options);
  assert.ok(!html.includes("Hyde Park") && html.includes("Be one of the first"));
});

test("cancelled, happened and inactive pages say so, with no steps, script or key", () => {
  const cancelled = renderPersonalPage({ state: "cancelled", host: "Marcos", title: "T" }, options);
  assert.ok(cancelled.includes("Marcos cancelled this resbite."));
  const happened = renderPersonalPage({ state: "happened", host: "Marcos", title: "T" }, options);
  assert.ok(happened.includes("This resbite has already happened."));
  for (const data of [{ state: "inactive" }, undefined, { state: "weird" }]) {
    const html = renderPersonalPage(data, options);
    assert.ok(html.includes("This invitation is no longer active."));
    assert.ok(html.includes('content="https://link.resbite.com/resbite-mark.png"'));
    assert.ok(!html.includes("Invited by"));
  }
  for (const html of [cancelled, happened]) {
    assert.ok(!html.includes("personal.js") && !html.includes(options.publishableKey) && !html.includes("Answer"));
    assert.ok(!html.includes('content="Picnic') && html.includes('content="You’re invited to a resbite"'));
  }
});

test("the CSP is the /r/ CSP with exactly one connect-src host and script-src 'self'", () => {
  const csp = personalCsp(options.supabaseUrl);
  assert.equal(csp, PAGE_CSP.replace("connect-src 'none'", "connect-src https://ewcsgvhuojxdpaspwsrx.supabase.co"));
  assert.equal(csp.match(/connect-src/g).length, 1);
  assert.ok(csp.includes("script-src 'self';") && !csp.includes("'unsafe"));
  assert.equal(personalCsp(""), PAGE_CSP);
  assert.equal(personalCsp("not a url"), PAGE_CSP);
  const headers = personalHeaders(options.supabaseUrl);
  assert.equal(headers["Content-Security-Policy"], csp);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.ok(renderPersonalPage(open, options).includes(`<meta http-equiv="Content-Security-Policy" content="${csp}" />`));
});

test("readPersonalInvitation calls personal_invitation_page; bad codes never reach the database", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push({ url, init }), { ok: true, json: async () => open });
  assert.deepEqual(await readPersonalInvitation("short", fetchImpl), { state: "inactive" });
  assert.equal(calls.length, 0);
  assert.equal((await readPersonalInvitation(code, fetchImpl)).state, "open");
  assert.ok(calls[0].url.endsWith("/rest/v1/rpc/personal_invitation_page"));
  assert.equal(JSON.parse(calls[0].init.body).p_code, code);
  await assert.rejects(readPersonalInvitation(code, async () => ({ ok: false, status: 500 })));
  assert.equal((await readPersonalInvitation(code, async () => ({ ok: true, json: async () => "junk" }))).state, "inactive");
});

const respond = () => {
  const res = { headers: {}, statusCode: 0, body: "", setHeader: (k, v) => (res.headers[k] = v), status: (s) => ({ send: (b) => ((res.statusCode = s), (res.body = b)) }) };
  return res;
};
const env = () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
};

test("the handler renders an open invitation with the /i/ headers", async () => {
  env();
  const res = respond();
  await personal({ query: { code } }, res, { readPersonalInvitation: async (c) => (assert.equal(c, code), open) });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes("Marcos invited you") && res.body.includes('data-publishable-key="sb_publishable_test"'));
  assert.equal(res.headers["Content-Security-Policy"], personalCsp("https://example.supabase.co"));
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.headers["X-Robots-Tag"], "noindex, nofollow");
});

test("the handler answers a reader error, a malformed code or a missing code with the inactive page", async () => {
  env();
  const failing = async () => { throw Error("boom"); };
  for (const [query, deps] of [[{ code }, { readPersonalInvitation: failing }], [{ code: "nope" }, { readPersonalInvitation: failing }], [{}, {}]]) {
    const res = respond();
    await personal({ query }, res, deps);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes("This invitation is no longer active."));
    assert.ok(!res.body.includes("sb_publishable_test"));
    assert.equal(res.headers["Cache-Control"], "no-store");
  }
});

test("the image route serves a personal invitation's picture from personal_invitation_page, else the mark", async () => {
  env();
  const root = await mkdtemp(join(tmpdir(), "resbite-personal-"));
  try {
    await mkdir(join(root, "activities"));
    await writeFile(join(root, "resbite-mark.png"), "MARK");
    await writeFile(join(root, "activities", "coffee-together.png"), "COFFEE");
    const run = async (read, query = { kind: "personal", code }) => {
      const res = { headers: {}, statusCode: 0, body: null, setHeader: (k, v) => (res.headers[k] = v), status: (s) => ({ send: (b) => ((res.statusCode = s), (res.body = b)) }) };
      await image({ query }, res, { root, readInvitationPage: async () => { throw Error("must not read the event page"); }, readPersonalInvitation: read });
      return res;
    };
    const art = await run(async () => ({ ...open, image: { kind: "activity", ref: "coffee-together" } }));
    assert.equal(art.headers["Content-Type"], "image/png");
    assert.equal(String(art.body), "COFFEE");
    assert.equal(String((await run(async () => ({ state: "inactive" }))).body), "MARK");
    assert.equal(String((await run(async () => { throw Error("x"); })).body), "MARK");
    assert.equal(String((await run(async () => open, { kind: "personal", code: "bad" })).body), "MARK");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
