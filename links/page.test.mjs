import test from "node:test";
import assert from "node:assert/strict";
import { formatWhen, previewDescription, renderPage, pageHeaders, isLinkCode, PAGE_CSP } from "./server/lib/render.mjs";
import { readInvitationPage, signCoverUrl } from "./server/lib/supabase.mjs";
import page from "./server/api/page.mjs";

const code = "k7Qx9AbCdEfGhIjKlMnOpQ";
const options = { origin: "https://link.resbite.com", code, appStoreUrl: "https://testflight.apple.com/join/abc", appStoreId: "6823164725" };
const open = {
  state: "open", host: "Stephen", title: "Film night: Paddington 2", starts_at: "2099-10-23T18:30:00+00:00", ends_at: "2099-10-23T21:00:00+00:00",
  time_zone: "Europe/London", area: "Near Old Street, London", going: 6, image: { kind: "cover", ref: "covers/x/1.jpg" },
};

test("times read as the app shows them, in the event's zone", () => {
  assert.equal(formatWhen(open.starts_at, open.ends_at, "Europe/London"), "Fri 23 Oct, 19:30 – 22:00");
  assert.equal(formatWhen(open.starts_at, null, "Europe/London"), "Fri 23 Oct, 19:30");
  assert.equal(formatWhen(open.starts_at, "2099-10-23T18:00:00+00:00", "Europe/London"), "Fri 23 Oct, 19:30");
  assert.equal(formatWhen(open.starts_at, null, "Not/AZone"), "Fri 23 Oct, 18:30");
  assert.equal(formatWhen("nope", null, "UTC"), "");
  assert.equal(previewDescription(open), "Fri 23 Oct, 19:30 · Invited by Stephen");
});

test("the open page shows the basics, the why-join box, RSVP and the join sheet", () => {
  const html = renderPage(open, options);
  for (const text of ["Stephen invited you", "Film night: Paddington 2", "Fri 23 Oct, 19:30 – 22:00", "Near Old Street, London",
    "Exact address after you reply", "6 going", "See who’s going", "Add it to your calendar", "Get reminders before it starts",
    "Free. No ads. No public profile.", "Join Resbite to reply", "Stephen will see your answer.", "Get the app", "I have Resbite: open the app"])
    assert.ok(html.includes(text), text);
  assert.ok(html.includes('href="#join"') && html.includes('href="https://testflight.apple.com/join/abc"') && html.includes(`href="resbite://r/${code}"`));
  assert.ok(html.includes(`<meta name="apple-itunes-app" content="app-id=6823164725, app-argument=https://link.resbite.com/r/${code}" />`));
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.ok(html.includes('<html lang="en">') && html.includes('<main id="main">') && !html.includes("user-scalable=no"));
  assert.ok(!/https?:\/\/(?!link\.resbite\.com|testflight\.apple\.com)/.test(html), "no third-party resources");
});

test("the preview carries the title, date, host and the stable image; never the area or the place", () => {
  const html = renderPage(open, options);
  assert.ok(html.includes('<meta property="og:title" content="Film night: Paddington 2" />'));
  assert.ok(html.includes('<meta property="og:description" content="Fri 23 Oct, 19:30 · Invited by Stephen" />'));
  assert.ok(html.includes(`<meta property="og:image" content="https://link.resbite.com/r/${code}/image" />`));
  const head = html.slice(0, html.indexOf("<body>"));
  assert.ok(!head.includes("Old Street") && !head.includes("covers/x"));
});

test("extra keys never reach the page, and text is escaped", () => {
  const leaky = { ...open, title: "<b>Film</b> & \"night\"", place_label: "Cinema room, 12 Secret Street", note: "Gate 4512", guests: ["Ana"], description: "Secret description" };
  const html = renderPage(leaky, options);
  assert.ok(!html.includes("Secret") && !html.includes("4512") && !html.includes("Ana"));
  assert.ok(html.includes("&lt;b&gt;Film&lt;/b&gt; &amp; &quot;night&quot;") && !html.includes("<b>Film"));
});

test("zero going reads as an invitation, and no area shows only the address line", () => {
  const html = renderPage({ ...open, going: 0, area: "" }, options);
  assert.ok(html.includes("Be one of the first") && !html.includes("0 going"));
  assert.ok(html.includes("Exact address after you reply"));
});

test("cancelled, happened and inactive pages say so, with no RSVP and the generic preview", () => {
  const cancelled = renderPage({ state: "cancelled", host: "Stephen", title: "Film night" }, options);
  assert.ok(cancelled.includes("Stephen cancelled this resbite.") && !cancelled.includes("RSVP") && !cancelled.includes("Film night"));
  const happened = renderPage({ state: "happened", host: "Stephen", title: "Film night" }, options);
  assert.ok(happened.includes("This resbite has already happened.") && happened.includes("Plan your own with Resbite."));
  const inactive = renderPage({ state: "inactive" }, { ...options, code: "" });
  assert.ok(inactive.includes("This invitation is no longer active.") && !inactive.includes("#join"));
  for (const html of [cancelled, happened, inactive]) {
    assert.ok(html.includes('<meta property="og:title" content="You’re invited to a resbite" />'));
    assert.ok(html.includes('<meta property="og:image" content="https://link.resbite.com/resbite-mark.png" />'));
  }
  assert.ok(!renderPage(open, { ...options, appStoreId: "" }).includes("apple-itunes-app"));
});

test("headers and the code shape", () => {
  const headers = pageHeaders();
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["Content-Security-Policy"], PAGE_CSP);
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
  assert.ok(isLinkCode(code) && !isLinkCode("short") && !isLinkCode(code + "x") && !isLinkCode("k7Qx9AbCdEfGhIjKlMnOp/") && !isLinkCode(42));
});

test("the database calls: malformed codes never reach the database; replies are checked; cover paths are checked", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/rpc/invitation_page")) return { ok: true, json: async () => ({ state: "open", host: "S" }) };
    if (url.includes("/object/sign/")) return { ok: true, json: async () => ({ signedURL: "/object/sign/plan-covers/covers/x/1.jpg?token=t" }) };
    return { ok: false, status: 500 };
  };
  assert.deepEqual(await readInvitationPage("short", fetchImpl), { state: "inactive" });
  assert.equal(calls.length, 0);
  assert.deepEqual(await readInvitationPage(code, fetchImpl), { state: "open", host: "S" });
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_test");
  assert.equal(JSON.parse(calls[0].init.body).p_code, code);
  assert.equal(await signCoverUrl("covers/x/1.jpg", 300, fetchImpl), "https://example.supabase.co/storage/v1/object/sign/plan-covers/covers/x/1.jpg?token=t");
  assert.equal(calls[1].init.headers.apikey, "sb_secret_test");
  assert.equal(await signCoverUrl("../etc/passwd", 300, fetchImpl), null);
  assert.equal(await readInvitationPage(code, async () => ({ ok: true, json: async () => "junk" })).then((d) => d.state), "inactive");
});

test("the page function answers an unknown or malformed code with the inactive page and the headers", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  const headers = {};
  let status = 0, body = "";
  const res = { setHeader: (k, v) => (headers[k] = v), status: (s) => ({ send: (b) => ((status = s), (body = b)) }) };
  await page({ query: { code: "not-a-code" } }, res);
  assert.equal(status, 200);
  assert.ok(body.includes("This invitation is no longer active."));
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
});
