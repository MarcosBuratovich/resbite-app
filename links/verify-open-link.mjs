// The open event link /r/<code> in headless Chrome (open-link approval, plan 3, Task 4): the personal page's steps in
// open mode, so any number can answer and the answer waits for the host. Builds the link site with generate(), serves
// it from a tiny local server that routes /r/<code> and /r/<code>/image through the generated api/page.mjs and
// api/image.mjs with a fixture reader, so the real HTML, CSP and script run. Every *.supabase.co request is answered
// by the stateful fixture below; any other request fails the run.
// Run from mobile/: node --import tsx ../links/verify-open-link.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { generate } from "./generate.mjs";

// Playwright lives in mobile/node_modules; resolve it from there whatever the working directory.
const require = createRequire(new URL("../mobile/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");

const PORT = Number(process.env.RESBITE_OPEN_LINK_PORT || 5181);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUPABASE = "https://ewcsgvhuojxdpaspwsrx.supabase.co";
const KEY = "sb_publishable_fixture";
const APP_STORE_URL = "https://testflight.apple.com/join/fixture";
const CODE = "OpenLinkOpenLinkOpenLi";
const CANCELLED = "CancelledCancelledCanc";
const HAPPENED = "HappenedHappenedHappen";
const UNKNOWN = "UnknownUnknownUnknownU";
const SAM = "447700900834";
const ABROAD = "14155550100"; // Typed with +1: any number can answer an open link.
const STORED_CODE = "123456";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
/** Where the page keeps its session for one link code (plan 2's scheme). */
const kept = (code) => `resbite.personal.session.${code}`;
const COPY = {
  invited: "Marcos invited you",
  confirm: "Confirm it’s you",
  numberHint: "We’ll text you a 6-digit code.",
  outsideUk: "Outside the UK? Start with + and your country code.",
  tick: "I’m 18 or over",
  codeHeading: "Enter the code",
  verified: "✓ Verified · ••34",
  hostSees: "Marcos will see your answer.",
  cant: "Thanks for letting them know",
  haveApp: "I have Resbite: open the app",
  waiting: "Waiting for Marcos",
  waitingBody: "Marcos will confirm your spot.",
  notAdded: "You weren’t added to this resbite.",
  alreadyIn: "You’re on this resbite.",
  planOwn: "Plan your own with Resbite.",
  unavailable: "This invitation is no longer active.",
  signOut: "Not you? Sign out",
  benefits: [
    "Hear when the time or place changes",
    "See who else is going",
    "Get the exact address and meeting details",
    "Reminders before it starts",
    "Add it to your calendar",
  ],
};
// invitation_page's open shape: no ending and no country, since an open link names no number.
const OPEN_PAGE = {
  state: "open",
  host: "Marcos",
  title: "Picnic in the park",
  starts_at: "2099-11-02T13:00:00+00:00",
  ends_at: "2099-11-02T16:00:00+00:00",
  time_zone: "Europe/London",
  area: "Hyde Park area",
  going: 4,
  image: { kind: "activity", ref: "coffee-together" },
};
const PAGES = {
  [CODE]: OPEN_PAGE,
  [CANCELLED]: { state: "cancelled", host: "Marcos", title: "Picnic in the park" },
  [HAPPENED]: { state: "happened", host: "Marcos", title: "Picnic in the park" },
};
const readInvitationPage = async (code) => PAGES[code] ?? { state: "inactive" };
const OPEN_CSP = `connect-src https://${new URL(SUPABASE).host}`;
// The functions get the fixture reader; should one reach for the network instead, it fails here, never the project.
globalThis.fetch = async (url) => {
  throw Error(`verify-open-link: the local server makes no network request (${url})`);
};

// ---- The site: generate() output, plus the two functions behind /r/ with a fixture reader. ----
Object.assign(process.env, {
  SUPABASE_URL: SUPABASE,
  SUPABASE_PUBLISHABLE_KEY: KEY,
  LINK_ORIGIN: ORIGIN,
  APP_STORE_URL,
  APP_STORE_ID: "",
  TERMS_VERSION: "2026-10",
  TERMS_URL: "https://www.resbite.com/terms",
  PRIVACY_URL: "",
});
const dir = await mkdtemp(join(tmpdir(), "resbite-open-link-"));
const out = await generate("https://link.resbite.com", "ABCDE12345", "com.resbite.app", join(dir, "out"));
const eventPage = (await import(pathToFileURL(join(out, "api", "page.mjs")).href)).default;
const image = (await import(pathToFileURL(join(out, "api", "image.mjs")).href)).default;
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png" };
// Vercel's res: setHeader, status(code).send(body).
const vercelRes = (res) => ({
  setHeader: (k, v) => res.setHeader(k, v),
  status: (code) => ({ send: (body) => ((res.statusCode = code), res.end(body)) }),
});
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, ORIGIN).pathname;
    const linkMatch = path.match(/^\/r\/([^/]*)(\/image)?$/);
    if (linkMatch) {
      const query = { code: decodeURIComponent(linkMatch[1]) };
      if (linkMatch[2]) return await image({ query }, vercelRes(res), { root: out, readInvitationPage });
      return await eventPage({ query }, vercelRes(res), { readInvitationPage });
    }
    const file = resolve(out, `.${decodeURIComponent(path)}`);
    if (!file.startsWith(out + sep) || !TYPES[extname(file)]) throw Error("not found");
    const bytes = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)], "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
    res.end(bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
await new Promise((ok, fail) => server.once("error", fail).listen(PORT, "127.0.0.1", ok));

let browser = null;

const jwt = (sub, n) =>
  [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ sub, n, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");

/**
 * A page on a stubbed Supabase. The fixture keeps, per person, the request on this link (`requests`: status and
 * response), whether they are on the resbite (`members`: owner or attendee) and whether they have a profile (per
 * number, `hasProfile` on the account), as request_to_join and my_join_request would (Task 1's SQL). Each of `people`
 * sets that for a number on the server only, as for someone coming back on another browser; each of `seeds` does the
 * same and also puts a kept entry in the page's storage before the first load, as the script stores it. Anyone with a
 * request or a place has a profile unless `hasProfile` says otherwise.
 */
async function fixture({ people = [], seeds = [], width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", locale: "en-GB" });
  const page = await context.newPage();
  const state = {
    accounts: new Map(),
    requests: new Map(),
    members: new Map(),
    access: new Map(),
    refresh: new Map(),
    issued: 0,
    unavailable: false,
  };
  const log = [],
    errors = [],
    unexpected = [],
    origins = new Set();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The 400, 401 and 403 replies below are deliberate; the browser reports each one.
    // The <meta> copy of the CSP can't carry frame-ancestors (Chrome says so); the response header does.
    if (
      m.type() === "error" &&
      !/Failed to load resource: the server responded with a status of (400|401|403|500)/.test(m.text()) &&
      m.text() !== "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element."
    )
      errors.push(m.text());
  });
  const account = (phone) => {
    if (!state.accounts.has(phone))
      state.accounts.set(phone, { id: `00000000-0000-4000-8000-${phone.padStart(12, "0").slice(-12)}`, phone, hasProfile: false });
    return state.accounts.get(phone);
  };
  const person = ({ phone, request = null, member = null, hasProfile = Boolean(request || member) }) => {
    const user = account(phone);
    if (request) state.requests.set(user.id, { ...request });
    if (member) state.members.set(user.id, member);
    user.hasProfile = hasProfile;
    return user;
  };
  for (const p of people) person(p);
  const issue = (user, expiresIn = 3600) => {
    state.issued += 1;
    const access_token = jwt(user.id, state.issued);
    const refresh_token = `refresh-${state.issued}`;
    state.access.set(access_token, user);
    state.refresh.set(refresh_token, user);
    return { access_token, refresh_token, token_type: "bearer", expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn, user };
  };
  if (seeds.length) {
    const entries = seeds.map((seed) => {
      const { phone } = seed;
      const s = issue(person(seed));
      const session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, phone: `+${phone}` };
      return [kept(CODE), JSON.stringify({ session, phone: `+${phone}`, until: Date.parse(OPEN_PAGE.starts_at) })];
    });
    await page.addInitScript(
      ({ entries }) => {
        if (!sessionStorage.getItem("fixture-seeded")) {
          for (const [key, value] of entries) localStorage.setItem(key, value);
          sessionStorage.setItem("fixture-seeded", "1");
        }
      },
      { entries },
    );
  }
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    const headers = req.headers();
    log.push({ method, path, search: url.search, body, auth: headers.authorization ?? null, apikey: headers.apikey ?? null });
    const reply = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    const pgError = (status, code, message) => reply({ code, message, details: null, hint: null }, status);
    const signedIn = () => state.access.get((headers.authorization ?? "").replace(/^Bearer /, "")) ?? null;
    if (headers.apikey !== KEY) unexpected.push(`${method} ${path} without the publishable key`);
    if (url.origin !== SUPABASE) unexpected.push(`another Supabase host: ${url.origin}`);
    if (method === "POST" && path === "/auth/v1/otp") return reply({});
    if (method === "POST" && path === "/rest/v1/rpc/exchange_test_code") return reply(body.p_code === "000000" ? STORED_CODE : null);
    if (method === "POST" && path === "/auth/v1/verify") {
      // Any number: the code is the one stored for whichever number asked for it.
      if (body.type !== "sms" || body.token !== STORED_CODE || !/^\+\d{7,15}$/.test(body.phone ?? ""))
        return reply({ code: 400, error_code: "otp_expired", msg: "Token has expired or is invalid" }, 400);
      return reply(issue(account(body.phone.slice(1))));
    }
    if (method === "POST" && path === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const user = state.refresh.get(body.refresh_token);
      if (!user) return reply({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" }, 400);
      state.refresh.delete(body.refresh_token);
      return reply(issue(user));
    }
    if (method === "POST" && path === "/auth/v1/logout") {
      state.access.delete((headers.authorization ?? "").replace(/^Bearer /, ""));
      return route.fulfill({ status: 204, body: "" });
    }
    if (method === "POST" && path === "/rest/v1/rpc/request_to_join") {
      // public.request_to_join in Task 1's order. The owner and guests are answered first, before the link and event
      // checks (`unavailable`: the link turned off), and nothing is written; then the answer, then a name only for
      // someone with no profile (the first request makes it). A decline on this link stands; anyone else's request is
      // kept, one per person, with the latest answer.
      const user = signedIn();
      if (!user) return pgError(401, "PGRST301", "JWT expired");
      if (body.p_code !== CODE) return pgError(403, "42501", "Invitation unavailable");
      const member = state.members.get(user.id);
      if (member) return reply({ state: member === "owner" ? "owner" : "already", plan_id: PLAN_ID, response: member === "owner" ? null : "accepted" });
      if (state.unavailable) return pgError(403, "42501", "Invitation unavailable");
      if (!["pending", "accepted", "maybe", "declined"].includes(body.p_response)) return pgError(400, "22023", "Invalid response");
      if (!user.hasProfile) {
        const name = typeof body.p_name === "string" ? body.p_name.trim() : "";
        if (name.length < 1 || name.length > 80) return pgError(400, "22023", "Name required");
        user.hasProfile = true;
      }
      const request = state.requests.get(user.id);
      if (request?.status === "declined") return reply({ state: "declined", plan_id: PLAN_ID, response: request.response });
      state.requests.set(user.id, { status: "waiting", response: body.p_response });
      return reply({ state: "waiting", plan_id: PLAN_ID, response: body.p_response });
    }
    if (method === "POST" && path === "/rest/v1/rpc/my_join_request") {
      // As Task 1's SQL: a member's request is never shown, and a request only while it applies (waiting, or declined).
      const user = signedIn();
      if (!user) return pgError(401, "PGRST301", "JWT expired");
      const member = state.members.get(user.id) ?? null;
      const request = state.requests.get(user.id);
      const applies = !member && (request?.status === "waiting" || request?.status === "declined");
      return reply({ ...OPEN_PAGE, request: applies ? { status: request.status, response: request.response } : null, member });
    }
    unexpected.push(`${method} ${path}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });
  return {
    page,
    log,
    state,
    calls: (path) => log.filter((x) => x.path === path),
    user: (phone) => account(phone),
    async done() {
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors (a CSP refusal is one)");
      const others = [...origins].filter((o) => o !== ORIGIN && o !== SUPABASE);
      assert.deepEqual(others, [], "no request leaves the page's origin and the Supabase host");
      for (const personal of ["/rest/v1/rpc/check_invited_number", "/rest/v1/rpc/answer_phone_invitation", "/rest/v1/rpc/my_phone_invitation"])
        assert.equal(log.filter((x) => x.path === personal).length, 0, `an open link never calls ${personal}`);
      await context.close();
    },
  };
}

/** The test code never shows: no text, attribute or placeholder holds 000000, except the code field's own value. */
async function noTestCode(page, where) {
  const found = await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.includes("000000")) hits.push(`text "${n.data}"`);
    for (const el of document.querySelectorAll("*")) {
      for (const attr of el.attributes) if (attr.value.includes("000000")) hits.push(`${attr.name} on ${el.tagName}`);
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.id !== "code" && el.value.includes("000000")) hits.push(`value of #${el.id}`);
    }
    if (document.body.innerText.includes("000000")) hits.push("rendered text");
    if (document.title.includes("000000") || location.href.includes("000000")) hits.push("title or address");
    return hits;
  });
  assert.deepEqual(found, [], `no test code on ${where}`);
}

const visible = (locator) => locator.filter({ visible: true });
const heading = (page, name) => visible(page.getByRole("heading", { name, exact: true }));
const button = (page, name) => visible(page.getByRole("button", { name, exact: true }));
const link = (page, name) => visible(page.getByRole("link", { name, exact: true }));
const text = (page, value) => visible(page.getByText(value, { exact: true }));
/** Focus is on the step's heading. */
const focused = async (page, name) =>
  expect.poll(() => page.evaluate(() => (/^H[1-6]$/.test(document.activeElement?.tagName) ? document.activeElement.textContent : null))).toBe(name);
/** The waiting screen: the heading, the host's line, the get-the-app block, Change answer; nothing of the other screens. */
async function waitingScreen(page) {
  await expect(heading(page, COPY.waiting)).toBeVisible();
  await expect(text(page, COPY.waitingBody)).toBeVisible();
  for (const benefit of COPY.benefits) await expect(text(page, benefit)).toBeVisible();
  await expect(link(page, "Get Resbite")).toHaveAttribute("href", APP_STORE_URL);
  await expect(button(page, "Not now")).toBeVisible();
  await expect(button(page, "Change answer")).toBeVisible();
  await expect(button(page, COPY.signOut)).toBeVisible();
  // The personal page's done words never show: no "You're going!", no "Sign up with +44 ••• 834…" (the page's 44
  // need not be the number's country), no "can see your answer".
  for (const gone of ["You’re going!", "You might come", "Thanks for letting them know", COPY.notAdded, COPY.alreadyIn, "Marcos can see your answer."])
    await expect(text(page, gone)).toHaveCount(0);
  await expect(visible(page.getByText(/^Sign up with/))).toHaveCount(0);
  await expect(link(page, "Open Resbite")).toHaveCount(0);
}
/**
 * Can't go while waiting: the personal page's Can't go screen (the heading, "Marcos will see your answer.", Plan your
 * own and the small Get Resbite), with Change answer, and nothing of waiting for the host.
 */
async function cantGoScreen(page) {
  await expect(heading(page, COPY.cant)).toBeVisible();
  await expect(text(page, COPY.hostSees)).toBeVisible();
  await expect(text(page, COPY.planOwn)).toBeVisible();
  const small = link(page, "Get Resbite");
  await expect(small).toHaveAttribute("href", APP_STORE_URL);
  await expect(small).not.toHaveClass(/\bdark\b/);
  await expect(visible(page.getByRole("link"))).toHaveCount(1);
  await expect(button(page, "Change answer")).toBeVisible();
  await expect(button(page, COPY.signOut)).toBeVisible();
  await expect(button(page, "Not now")).toHaveCount(0);
  await expect(visible(page.getByText(/confirm your spot/))).toHaveCount(0);
  for (const gone of [COPY.waiting, COPY.benefits[0], COPY.notAdded, COPY.alreadyIn, "Marcos can see your answer."]) await expect(text(page, gone)).toHaveCount(0);
  await expect(visible(page.getByText(/^Sign up with/))).toHaveCount(0);
}
/** The not-added screen: the sentence and only "Plan your own with Resbite." */
async function notAddedScreen(page) {
  await expect(heading(page, COPY.notAdded)).toBeVisible();
  await expect(link(page, COPY.planOwn)).toHaveAttribute("href", APP_STORE_URL);
  await expect(visible(page.getByRole("link"))).toHaveCount(1);
  for (const gone of ["Change answer", "Not now"]) await expect(button(page, gone)).toHaveCount(0);
  for (const gone of [COPY.waiting, COPY.waitingBody, COPY.alreadyIn, COPY.benefits[0]]) await expect(text(page, gone)).toHaveCount(0);
  await expect(button(page, COPY.signOut)).toBeVisible();
}
/** The already-in screen: the sentence, Open Resbite into the app on this link, and Get Resbite. */
async function alreadyInScreen(page) {
  await expect(heading(page, COPY.alreadyIn)).toBeVisible();
  await expect(link(page, "Open Resbite")).toHaveAttribute("href", `resbite://r/${CODE}`);
  await expect(link(page, "Get Resbite")).toHaveAttribute("href", APP_STORE_URL);
  await expect(visible(page.getByRole("link"))).toHaveCount(2);
  for (const gone of ["Change answer", "Not now"]) await expect(button(page, gone)).toHaveCount(0);
  for (const gone of [COPY.waiting, COPY.waitingBody, COPY.notAdded, COPY.benefits[0]]) await expect(text(page, gone)).toHaveCount(0);
  await expect(button(page, COPY.signOut)).toBeVisible();
}

try {
  browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });

  // 1. The whole path to waiting, with exact request bodies: Answer → the tick → a number from abroad (+1, sent as
  // typed, no number check) → Change number → a UK number typed the local way (the page's 44) → 000000 exchanged for
  // the stored code → the name and Going → request_to_join → "Waiting for Marcos" and the get-the-app block.
  const f = await fixture(),
    { page } = f;
  {
    const response = await page.goto(`${ORIGIN}/r/${CODE}`);
    assert.ok(response.headers()["content-security-policy"].includes(OPEN_CSP), "the open page may call the one Supabase host");
    await expect(text(page, COPY.invited)).toBeVisible();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await expect(text(page, "Mon 2 Nov, 13:00 – 16:00")).toBeVisible();
    await expect(text(page, "4 going")).toBeVisible();
    await expect(page.getByText(/number ending|Not your number/)).toHaveCount(0);
    // GI1's way into the app stays, for people who already have Resbite.
    await expect(link(page, COPY.haveApp)).toHaveAttribute("href", `resbite://r/${CODE}`);
    assert.equal(await page.locator("#open-app").getAttribute("class"), "button secondary");
    assert.equal(await page.locator("#main").getAttribute("data-mode"), "open");
    assert.equal(await page.locator("#main").getAttribute("data-country"), "44");
    assert.equal(await page.locator("[data-ending]").count(), 0);
    await noTestCode(page, "the invitation");
    assert.equal(f.log.length, 0, "nothing is asked of Supabase before Answer without a stored session");
    await button(page, "Answer").click();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    await focused(page, COPY.confirm);
    await expect(text(page, COPY.numberHint)).toBeVisible();
    await expect(text(page, COPY.outsideUk)).toBeVisible();
    await expect(page.getByText(/invited\. We’ll text it a code/)).toHaveCount(0);
    const tick = page.getByRole("checkbox", { name: COPY.tick, exact: true });
    const number = page.getByLabel("Mobile number", { exact: true });
    assert.match(await number.getAttribute("aria-describedby"), /\bnumber-hint\b/, "the hint is read with the field");
    await expect(button(page, "Send code")).toBeDisabled();
    await tick.check();
    // From abroad: + and the country code, sent as typed.
    await number.fill("+1 (415) 555-0100");
    await button(page, "Send code").click();
    await expect(heading(page, COPY.codeHeading)).toBeVisible();
    await expect(text(page, "We sent a 6-digit code to +1 (415) 555-0100.")).toBeVisible();
    await button(page, "Change number").click();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    await expect(tick).toBeChecked();
    // A UK number without +: the page's 44.
    await number.fill("07700 900834");
    await button(page, "Send code").click();
    await expect(heading(page, COPY.codeHeading)).toBeVisible();
    await focused(page, COPY.codeHeading);
    assert.deepEqual(
      f.calls("/auth/v1/otp").map((x) => x.body),
      [
        { phone: `+${ABROAD}`, create_user: true },
        { phone: `+${SAM}`, create_user: true },
      ],
    );
    assert.ok(f.log.every((x) => x.auth === null), "no Authorization before signing in");
    await noTestCode(page, "the code step");
    const code = page.getByLabel("6-digit code", { exact: true });
    await code.fill("000000");
    await button(page, "Verify").click();
    // The answer step: the chip names the verified number's last two digits.
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await focused(page, "Picnic in the park");
    await expect(text(page, COPY.verified)).toBeVisible();
    await expect(text(page, "Mon 2 Nov, 13:00 – 16:00 · Hyde Park area")).toBeVisible();
    await expect(text(page, COPY.hostSees)).toBeVisible();
    await expect(button(page, COPY.signOut)).toBeVisible();
    assert.deepEqual(f.calls("/rest/v1/rpc/exchange_test_code").map((x) => x.body), [{ p_phone: `+${SAM}`, p_code: "000000" }]);
    assert.deepEqual(f.calls("/auth/v1/verify").map((x) => x.body), [{ type: "sms", phone: `+${SAM}`, token: STORED_CODE }]);
    // Looked up right after the code, with the new session: no request yet, so the answer step.
    const lookups = f.calls("/rest/v1/rpc/my_join_request");
    assert.deepEqual(lookups.map((x) => [x.body, x.auth]), [[{ p_code: CODE }, `Bearer ${[...f.state.access.keys()].at(-1)}`]]);
    await noTestCode(page, "the answer step");
    for (const answer of ["Going", "Maybe", "Can’t go"]) await expect(page.getByRole("radio", { name: answer, exact: true })).not.toBeChecked();
    await page.getByRole("radio", { name: "Going", exact: true }).check();
    await button(page, "Send answer").click();
    await expect(text(page, "Use a name between 1 and 80 characters.")).toBeVisible();
    assert.equal(f.calls("/rest/v1/rpc/request_to_join").length, 0, "a first answer needs a name");
    assert.equal(f.user(SAM).hasProfile, false, "and the server would ask for one: no profile yet");
    await page.getByLabel("Your first name", { exact: true }).fill("Sam");
    await button(page, "Send answer").click();
    await waitingScreen(page);
    await focused(page, COPY.waiting);
    const requests = f.calls("/rest/v1/rpc/request_to_join");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].body, { p_code: CODE, p_name: "Sam", p_response: "accepted", p_terms_version: "2026-10" });
    const session = [...f.state.access.keys()].at(-1);
    assert.equal(requests[0].auth, `Bearer ${session}`);
    assert.deepEqual(f.state.requests.get(f.user(SAM).id), { status: "waiting", response: "accepted" });
    assert.equal(f.user(SAM).hasProfile, true, "the first request made the profile");
    assert.deepEqual(
      f.log.map((x) => x.path),
      ["/auth/v1/otp", "/auth/v1/otp", "/rest/v1/rpc/exchange_test_code", "/auth/v1/verify", "/rest/v1/rpc/my_join_request", "/rest/v1/rpc/request_to_join"],
      "the whole conversation with Supabase",
    );
    // Kept under this code only (plan 2's scheme), with the full verified number and the event's start.
    const entry = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), kept(CODE));
    assert.deepEqual(
      [entry.session.access_token, entry.session.phone, entry.phone, entry.until],
      [session, `+${SAM}`, `+${SAM}`, Date.parse(OPEN_PAGE.starts_at)],
    );
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [kept(CODE)], "nothing else is kept");
    await noTestCode(page, "the waiting screen");
    assert.ok(!(await page.content()).includes("000000"), "not in the document either");
    // Not now: the get-the-app block goes; the waiting heading stays.
    await button(page, "Not now").click();
    await expect(link(page, "Get Resbite")).toBeHidden();
    await expect(heading(page, COPY.waiting)).toBeVisible();
    await focused(page, COPY.waiting);
  }

  // 1b. Coming back on another browser (or an app's in-app browser), with no kept session: right after the code,
  // my_join_request shows the person's screen. A waiting Going is the waiting screen with Going to change, and no
  // request_to_join is sent; a decline is Not added; a guest is already in; no request is the answer step.
  {
    const ANA = "447700900111",
      LEO = "447700900222",
      MIA = "447700900333";
    const f = await fixture({
        people: [
          { phone: SAM, request: { status: "waiting", response: "accepted" } },
          { phone: ANA, request: { status: "declined", response: "maybe" } },
          { phone: LEO, member: "attendee" },
          { phone: MIA, hasProfile: true },
        ],
      }),
      { page } = f;
    /** Answer → the tick → the number, typed the local way → 000000. */
    const verifyAs = async (number) => {
      await button(page, "Answer").click();
      await page.getByRole("checkbox", { name: COPY.tick, exact: true }).check();
      await page.getByLabel("Mobile number", { exact: true }).fill(number);
      await button(page, "Send code").click();
      await page.getByLabel("6-digit code", { exact: true }).fill("000000");
      await button(page, "Verify").click();
    };
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await expect(button(page, "Answer")).toBeVisible();
    await page.waitForTimeout(300);
    assert.equal(f.log.length, 0, "no kept session: nothing asked before Answer");
    await verifyAs("07700 900834");
    await waitingScreen(page);
    await focused(page, COPY.waiting);
    assert.deepEqual(
      f.log.map((x) => x.path),
      ["/auth/v1/otp", "/rest/v1/rpc/exchange_test_code", "/auth/v1/verify", "/rest/v1/rpc/my_join_request"],
      "the whole conversation: the code, then the lookup; no request_to_join",
    );
    const lookup = f.calls("/rest/v1/rpc/my_join_request")[0];
    assert.deepEqual([lookup.body, lookup.auth], [{ p_code: CODE }, `Bearer ${[...f.state.access.keys()].at(-1)}`]);
    await button(page, "Change answer").click();
    await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeChecked();
    await expect(page.getByLabel("Your first name", { exact: true })).toBeHidden();
    await expect(text(page, COPY.verified)).toBeVisible();
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [kept(CODE)], "kept for this browser from now on");
    await noTestCode(page, "the looked-up waiting answer");
    for (const [number, screen] of [
      ["07700 900111", notAddedScreen],
      ["07700 900222", alreadyInScreen],
    ]) {
      await button(page, COPY.signOut).click();
      await verifyAs(number);
      await screen(page);
    }
    // Someone with a profile but no request (an existing Resbite account, say): the answer step, as before.
    await button(page, COPY.signOut).click();
    await verifyAs("07700 900333");
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await expect(page.getByLabel("Your first name", { exact: true })).toBeVisible();
    assert.equal(f.calls("/rest/v1/rpc/my_join_request").length, 4, "one lookup per verified number");
    assert.equal(f.calls("/rest/v1/rpc/request_to_join").length, 0, "nobody was asked to answer again");
    await f.done();
  }

  // 2. Coming back on the same browser: my_join_request shows the waiting answer, which can change (request_to_join
  // again, no name). Nothing is duplicated: one request, with the latest answer. Then Not you? Sign out.
  {
    await page.reload();
    await waitingScreen(page);
    const mine = f.calls("/rest/v1/rpc/my_join_request");
    assert.equal(mine.length, 2, "one after the code, one on the reload");
    assert.deepEqual(mine[1].body, { p_code: CODE });
    assert.equal(mine[1].auth, `Bearer ${[...f.state.access.keys()].at(-1)}`);
    await button(page, "Change answer").click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await focused(page, "Picnic in the park");
    await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeChecked();
    await expect(page.getByLabel("Your first name", { exact: true })).toBeHidden();
    await page.getByRole("radio", { name: "Maybe", exact: true }).check();
    await button(page, "Send answer").click();
    await waitingScreen(page);
    await focused(page, COPY.waiting);
    const requests = f.calls("/rest/v1/rpc/request_to_join");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].body, { p_code: CODE, p_name: "", p_response: "maybe", p_terms_version: "2026-10" });
    assert.equal(f.state.requests.size, 1, "one request per person");
    assert.deepEqual(f.state.requests.get(f.user(SAM).id), { status: "waiting", response: "maybe" });
    // And again after a reload: the new answer is the one to change.
    await page.reload();
    await waitingScreen(page);
    await button(page, "Change answer").click();
    await expect(page.getByRole("radio", { name: "Maybe", exact: true })).toBeChecked();
    await noTestCode(page, "the changed answer");
    // Not you? Sign out: GoTrue ends this session (scope local), the entry goes, and the page is the invitation again.
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), kept(CODE));
    await button(page, COPY.signOut).click();
    await expect(button(page, "Answer")).toBeVisible();
    await focused(page, "Picnic in the park");
    const logout = f.calls("/auth/v1/logout");
    assert.equal(logout.length, 1);
    assert.deepEqual([logout[0].search, logout[0].auth, logout[0].apikey], ["?scope=local", `Bearer ${stored.session.access_token}`, KEY]);
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [], "the kept session is gone");
    const quiet = f.log.length;
    await page.reload();
    await expect(button(page, "Answer")).toBeVisible();
    await page.waitForTimeout(300);
    assert.equal(f.log.length, quiet, "nothing restored after signing out");
    await f.done();
  }

  // 2b. A request first made in the app is waiting with "pending": the waiting screen, and changing it gives an answer
  // with no name and nothing chosen beforehand.
  {
    const f = await fixture({ seeds: [{ phone: SAM, request: { status: "waiting", response: "pending" } }] }),
      { page } = f;
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await waitingScreen(page);
    await button(page, "Change answer").click();
    for (const answer of ["Going", "Maybe", "Can’t go"]) await expect(page.getByRole("radio", { name: answer, exact: true })).not.toBeChecked();
    await expect(page.getByLabel("Your first name", { exact: true })).toBeHidden();
    await expect(text(page, COPY.verified)).toBeVisible();
    await page.getByRole("radio", { name: "Going", exact: true }).check();
    await button(page, "Send answer").click();
    await waitingScreen(page);
    assert.deepEqual(f.calls("/rest/v1/rpc/request_to_join").map((x) => x.body), [
      { p_code: CODE, p_name: "", p_response: "accepted", p_terms_version: "2026-10" },
    ]);
    await f.done();
  }

  // 2c. Can't go while waiting is the personal page's Can't go screen, never "will confirm your spot", on the reply and
  // on a reload; Change answer to Going waits for the host again.
  {
    const f = await fixture({ seeds: [{ phone: SAM, request: { status: "waiting", response: "accepted" } }] }),
      { page } = f;
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await waitingScreen(page);
    await button(page, "Change answer").click();
    await page.getByRole("radio", { name: "Can’t go", exact: true }).check();
    await button(page, "Send answer").click();
    await cantGoScreen(page);
    await focused(page, COPY.cant);
    assert.deepEqual(f.calls("/rest/v1/rpc/request_to_join").map((x) => x.body), [
      { p_code: CODE, p_name: "", p_response: "declined", p_terms_version: "2026-10" },
    ]);
    assert.deepEqual(f.state.requests.get(f.user(SAM).id), { status: "waiting", response: "declined" });
    await page.reload();
    await cantGoScreen(page);
    await noTestCode(page, "the Can't go screen");
    await button(page, "Change answer").click();
    await expect(page.getByRole("radio", { name: "Can’t go", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Going", exact: true }).check();
    await button(page, "Send answer").click();
    await waitingScreen(page);
    await f.done();
  }

  // 3. Declined: coming back shows "You weren't added to this resbite." with only "Plan your own with Resbite.", and
  // asks nothing more. A decline that lands while the answer is being changed shows the same.
  {
    const f = await fixture({ seeds: [{ phone: SAM, request: { status: "declined", response: "accepted" } }] }),
      { page } = f;
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await notAddedScreen(page);
    assert.deepEqual(f.log.map((x) => x.path), ["/rest/v1/rpc/my_join_request"]);
    await noTestCode(page, "the not-added screen");
    await f.done();
  }
  {
    const f = await fixture({ seeds: [{ phone: SAM, request: { status: "waiting", response: "accepted" } }] }),
      { page } = f;
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await waitingScreen(page);
    await button(page, "Change answer").click();
    f.state.requests.set(f.user(SAM).id, { status: "declined", response: "accepted" }); // The host declines meanwhile.
    await page.getByRole("radio", { name: "Maybe", exact: true }).check();
    await button(page, "Send answer").click();
    await notAddedScreen(page);
    await focused(page, COPY.notAdded);
    assert.deepEqual(f.state.requests.get(f.user(SAM).id), { status: "declined", response: "accepted" }, "the decline stands");
    await page.reload();
    await notAddedScreen(page);
    await f.done();
  }

  // 4. Already in: a guest or the owner coming back sees "You're on this resbite." with Open Resbite (this link, in the
  // app) and Get Resbite; an approval that lands while the answer is being changed shows the same.
  for (const member of ["attendee", "owner"]) {
    const f = await fixture({ seeds: [{ phone: SAM, member }] }),
      { page } = f;
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await alreadyInScreen(page);
    assert.deepEqual(f.log.map((x) => x.path), ["/rest/v1/rpc/my_join_request"]);
    await noTestCode(page, `the already-in screen (${member})`);
    await f.done();
  }
  {
    const f = await fixture({ seeds: [{ phone: SAM, request: { status: "waiting", response: "accepted" } }], width: 320 }),
      { page } = f;
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await waitingScreen(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 320 (waiting)");
    await button(page, "Change answer").click();
    // The link was turned off: the answer is refused, and the step says so.
    f.state.unavailable = true;
    await page.getByRole("radio", { name: "Maybe", exact: true }).check();
    await button(page, "Send answer").click();
    await expect(text(page, COPY.unavailable)).toBeVisible();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    // The host approves meanwhile: a guest is answered before the link is checked, so the link being off doesn't matter.
    f.state.requests.set(f.user(SAM).id, { status: "approved", response: "accepted" });
    f.state.members.set(f.user(SAM).id, "attendee");
    await button(page, "Send answer").click();
    await alreadyInScreen(page);
    await focused(page, COPY.alreadyIn);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 320 (already in)");
    await f.done();
  }

  // 5. Verified before, never answered: the answer step, with the name; and the narrow number step.
  {
    const f = await fixture({ seeds: [{ phone: SAM }], width: 320 }),
      { page } = f;
    await page.goto(`${ORIGIN}/r/${CODE}`);
    await expect(text(page, COPY.verified)).toBeVisible();
    await expect(page.getByLabel("Your first name", { exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 320 (answer)");
    await button(page, COPY.signOut).click();
    await button(page, "Answer").click();
    await expect(text(page, COPY.outsideUk)).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 320 (number)");
    await noTestCode(page, "the narrow number step");
    await f.done();
  }

  // 6. Closed links keep GI1's pages and the strict CSP: no steps, no script of the personal page, no key and no
  // request to Supabase.
  {
    const f = await fixture(),
      { page } = f;
    for (const [code, sentence] of [
      [CANCELLED, "Marcos cancelled this resbite."],
      [HAPPENED, "This resbite has already happened."],
      [UNKNOWN, "This invitation is no longer active."],
      ["nope", "This invitation is no longer active."],
    ]) {
      const response = await page.goto(`${ORIGIN}/r/${code}`);
      assert.ok(response.headers()["content-security-policy"].includes("connect-src 'none'"), `${code}: the strict CSP`);
      await expect(heading(page, sentence)).toBeVisible();
      for (const role of ["textbox", "checkbox", "radio", "button"]) await expect(page.getByRole(role)).toHaveCount(0);
      assert.equal(await page.locator("script[type=module], #step-confirm, [data-publishable-key]").count(), 0, code);
      await noTestCode(page, `the ${code} page`);
    }
    assert.equal(f.log.length, 0, "closed pages never call Supabase");
    await f.done();
  }

  console.log(
    "PASS: /r/<code> in headless Chrome, open mode: Answer → the 18+ tick → a +1 number sent as typed and a UK number with the page's 44 (no number check, the Outside the UK hint) → 000000 exchanged then verified → the name and Going → request_to_join with exact bodies → Waiting for Marcos with the get-the-app block; on another browser, right after the code, my_join_request shows a waiting answer (no request_to_join), Not added or already in; a reload restores the waiting answer through my_join_request and changing it sends request_to_join again with no name (one request, the latest answer), as does a request made in the app (pending); Can't go while waiting is the personal page's Can't go screen, on the reply and on a reload; I have Resbite: open the app stays on the first screen; declined shows You weren't added with only Plan your own; a guest or the owner sees You're on this resbite with Open Resbite and Get Resbite; a decline or an approval landing mid-change shows the same screens; a turned-off link refuses the answer; Not you? Sign out ends the kept session; closed links keep GI1's pages and the strict CSP; no 000000 anywhere; no request beyond the page's origin and the intercepted Supabase host; nothing scrolls sideways at 320.",
  );
} finally {
  await browser?.close();
  await new Promise((ok) => server.close(ok));
  await rm(dir, { recursive: true, force: true });
}
