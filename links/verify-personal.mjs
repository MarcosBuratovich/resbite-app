// The personal invitation page /i/<code> in headless Chrome (contact invitations, Task 11). Builds the link site with
// generate(), serves it from a tiny local server that routes /i/<code> and /i/<code>/image through the generated
// api/personal.mjs and api/image.mjs with fixture readers, so the real HTML, CSP and script run. Every *.supabase.co
// request is answered by the stateful fixture below; any other request fails the run.
// Run from mobile/: node --import tsx ../links/verify-personal.mjs
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

const PORT = Number(process.env.RESBITE_PERSONAL_PORT || 5180);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUPABASE = "https://ewcsgvhuojxdpaspwsrx.supabase.co";
const KEY = "sb_publishable_fixture";
const APP_STORE_URL = "https://testflight.apple.com/join/fixture";
const CODE = "k7Qx9AbCdEfGhIjKlMnOpQ";
const CANCELLED = "CancelledCancelledCanc";
const HAPPENED = "HappenedHappenedHappen";
const UNKNOWN = "UnknownUnknownUnknownU";
const INVITED = "447700900834";
const OTHER = "447700900534"; // Another person's number with the same last two digits.
const STORED_CODE = "123456";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const COPY = {
  invited: "Marcos invited you",
  confirm: "Confirm it’s you",
  confirmBody: "Type the number Marcos invited. We’ll text it a code.",
  tick: "I’m 18 or over",
  ageHelper: "Resbite is for people aged 18 and over.",
  wrongNumber: "That isn’t the number Marcos invited.",
  codeHeading: "Enter the code",
  mismatch: "That code doesn’t match. Try again.",
  verified: "✓ Verified · ••34",
  hostSees: "Marcos will see your answer.",
  hostCanSee: "Marcos can see your answer.",
  going: "You’re going!",
  cant: "Thanks for letting them know",
  waiting: "Sign up with +44 ••• 834 and this resbite will be waiting.",
  planOwn: "Plan your own with Resbite.",
  tooMany: "Too many tries. Try again later.",
  connection: "Check your connection and try again.",
  benefits: [
    "Hear when the time or place changes",
    "See who else is going",
    "Get the exact address and meeting details",
    "Reminders before it starts",
    "Add it to your calendar",
  ],
};
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
  ending: "34",
  country: "44",
};
const PAGES = {
  [CODE]: OPEN_PAGE,
  [CANCELLED]: { state: "cancelled", host: "Marcos", title: "Picnic in the park" },
  [HAPPENED]: { state: "happened", host: "Marcos", title: "Picnic in the park" },
};
const readPersonalInvitation = async (code) => PAGES[code] ?? { state: "inactive" };

// ---- The site: generate() output, plus the two functions behind /i/ with fixture readers. ----
Object.assign(process.env, {
  SUPABASE_URL: SUPABASE,
  SUPABASE_PUBLISHABLE_KEY: KEY,
  LINK_ORIGIN: ORIGIN,
  APP_STORE_URL,
  TERMS_VERSION: "2026-10",
  TERMS_URL: "https://www.resbite.com/terms",
  PRIVACY_URL: "",
});
const dir = await mkdtemp(join(tmpdir(), "resbite-personal-"));
const out = await generate("https://link.resbite.com", "ABCDE12345", "com.resbite.app", join(dir, "out"));
const personal = (await import(pathToFileURL(join(out, "api", "personal.mjs")).href)).default;
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
    const personalMatch = path.match(/^\/i\/([^/]*)(\/image)?$/);
    if (personalMatch) {
      const query = { code: decodeURIComponent(personalMatch[1]), ...(personalMatch[2] ? { kind: "personal" } : {}) };
      if (personalMatch[2]) return await image({ query }, vercelRes(res), { root: out, readPersonalInvitation });
      return await personal({ query }, vercelRes(res), { readPersonalInvitation });
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
 * A page on a stubbed Supabase. The fixture keeps the invitation's answer, the issued tokens and every request.
 * `seed` puts a session for that account in the page's storage before the first load, as the script stores it.
 */
async function fixture({ seed = null, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", locale: "en-GB" });
  const page = await context.newPage();
  const state = { response: null, accounts: new Map(), access: new Map(), refresh: new Map(), issued: 0, tooMany: false, offline: false };
  const log = [],
    errors = [],
    unexpected = [],
    origins = new Set();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The 400 and 403 replies below are deliberate; the browser reports each one, as it does an aborted request.
    // The <meta> copy of the CSP can't carry frame-ancestors (Chrome says so); the response header does.
    if (
      m.type() === "error" &&
      !/Failed to load resource: (the server responded with a status of (400|401|403)|net::ERR_INTERNET_DISCONNECTED)/.test(m.text()) &&
      m.text() !== "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element."
    )
      errors.push(m.text());
  });
  const account = (phone) => {
    if (!state.accounts.has(phone)) state.accounts.set(phone, { id: `00000000-0000-4000-8000-${phone}`, phone });
    return state.accounts.get(phone);
  };
  const issue = (user, expiresIn = 3600) => {
    state.issued += 1;
    const access_token = jwt(user.id, state.issued);
    const refresh_token = `refresh-${state.issued}`;
    state.access.set(access_token, user);
    state.refresh.set(refresh_token, user);
    return { access_token, refresh_token, token_type: "bearer", expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn, user };
  };
  if (seed) {
    const s = issue(account(seed));
    await page.addInitScript(
      ({ value }) => {
        if (!sessionStorage.getItem("fixture-seeded")) {
          localStorage.setItem("resbite.personal.session", value);
          sessionStorage.setItem("fixture-seeded", "1");
        }
      },
      { value: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, phone: `+${seed}` }) },
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
    if (method === "POST" && path === "/rest/v1/rpc/check_invited_number") {
      if (state.tooMany) return pgError(400, "22023", "Too many tries. Try again later.");
      return reply(body.p_code === CODE && String(body.p_phone).replace(/\D/g, "") === INVITED);
    }
    if (method === "POST" && path === "/auth/v1/otp") {
      if (state.offline) return route.abort("internetdisconnected");
      return reply({});
    }
    if (method === "POST" && path === "/rest/v1/rpc/exchange_test_code") return reply(body.p_code === "000000" ? STORED_CODE : null);
    if (method === "POST" && path === "/auth/v1/verify") {
      if (body.type !== "sms" || body.token !== STORED_CODE || body.phone !== `+${INVITED}`)
        return reply({ code: 400, error_code: "otp_expired", msg: "Token has expired or is invalid" }, 400);
      return reply(issue(account(INVITED)));
    }
    if (method === "POST" && path === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const user = state.refresh.get(body.refresh_token);
      if (!user) return reply({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" }, 400);
      state.refresh.delete(body.refresh_token);
      return reply(issue(user));
    }
    if (method === "POST" && path === "/rest/v1/rpc/answer_phone_invitation") {
      const user = signedIn();
      if (!user) return pgError(401, "PGRST301", "JWT expired");
      if (user.phone !== INVITED) return pgError(403, "42501", "That isn't the invited number.");
      if (!["accepted", "maybe", "declined"].includes(body.p_response)) return pgError(400, "22023", "Invalid response");
      state.response = body.p_response;
      return reply({ response: body.p_response, plan_id: PLAN_ID });
    }
    if (method === "POST" && path === "/rest/v1/rpc/my_phone_invitation") {
      const user = signedIn();
      if (!user) return pgError(401, "PGRST301", "JWT expired");
      return reply({ ...OPEN_PAGE, response: user.phone === INVITED ? state.response : null });
    }
    unexpected.push(`${method} ${path}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });
  return {
    page,
    log,
    state,
    calls: (path) => log.filter((x) => x.path === path),
    async done() {
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors (a CSP refusal is one)");
      const others = [...origins].filter((o) => o !== ORIGIN && o !== SUPABASE);
      assert.deepEqual(others, [], "no request leaves the page's origin and the Supabase host");
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
const text = (page, value) => visible(page.getByText(value, { exact: true }));
/** Focus is on the step's heading. */
const focused = async (page, name) =>
  expect.poll(() => page.evaluate(() => (/^H[1-6]$/.test(document.activeElement?.tagName) ? document.activeElement.textContent : null))).toBe(name);

try {
  browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
  // 1. The whole path: Answer → the tick → a wrong number (no code sent) → the right number → a wrong code → 000000
  // exchanged for the stored code → the name and Going → direction A with the app store link.
  const f = await fixture(),
    { page } = f;
  {
    await page.goto(`${ORIGIN}/i/${CODE}`);
    await expect(text(page, COPY.invited)).toBeVisible();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await expect(text(page, "This invitation is for the number ending ••34.")).toBeVisible();
    await noTestCode(page, "the invitation");
    assert.equal(f.log.length, 0, "nothing is asked of Supabase before Answer without a stored session");
    await button(page, "Answer").click();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    await focused(page, COPY.confirm);
    await expect(heading(page, "Picnic in the park")).toBeHidden();
    await expect(text(page, COPY.confirmBody)).toBeVisible();
    const tick = page.getByRole("checkbox", { name: COPY.tick, exact: true });
    const number = page.getByLabel("Mobile number", { exact: true });
    await expect(tick).not.toBeChecked();
    await expect(page.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "https://www.resbite.com/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveCount(0);
    await expect(text(page, COPY.ageHelper)).toBeVisible();
    await expect(button(page, "Send code")).toBeDisabled();
    await number.fill("07700 900834");
    await number.press("Enter");
    await expect(button(page, "Send code")).toBeDisabled();
    assert.equal(f.log.length, 0, "nothing is sent before the tick");
    await tick.check();
    await expect(text(page, COPY.ageHelper)).toBeHidden();
    await expect(button(page, "Send code")).toBeEnabled();
    // An unusable number is refused on the page.
    await number.fill("12");
    await button(page, "Send code").click();
    await expect(text(page, "Enter a valid mobile number.")).toBeVisible();
    assert.equal(f.log.length, 0);
    // A wrong number: checked, refused, no code sent.
    await number.fill("07700 900111");
    await button(page, "Send code").click();
    await expect(text(page, COPY.wrongNumber)).toBeVisible();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    assert.equal(f.calls("/rest/v1/rpc/check_invited_number").length, 1);
    assert.deepEqual(f.calls("/rest/v1/rpc/check_invited_number")[0].body, { p_code: CODE, p_phone: "+447700900111" });
    assert.equal(f.calls("/auth/v1/otp").length, 0, "a wrong number sends no code");
    // The right number, typed the local way.
    await number.fill("07700 900834");
    await button(page, "Send code").click();
    await expect(heading(page, COPY.codeHeading)).toBeVisible();
    await focused(page, COPY.codeHeading);
    await expect(text(page, "We sent a 6-digit code to 07700 900834.")).toBeVisible();
    await expect(page.getByText(/^Didn’t get it\? Send a new code in [01]:\d\d$/)).toBeVisible();
    const checks = f.calls("/rest/v1/rpc/check_invited_number");
    assert.deepEqual(checks[1].body, { p_code: CODE, p_phone: "+447700900834" });
    const otp = f.calls("/auth/v1/otp");
    assert.equal(otp.length, 1);
    assert.deepEqual(otp[0].body, { phone: "+447700900834", create_user: true });
    assert.ok(f.log.every((x) => x.auth === null), "no Authorization before signing in");
    const code = page.getByLabel("6-digit code", { exact: true });
    assert.equal(await code.getAttribute("inputmode"), "numeric");
    assert.equal(await code.getAttribute("autocomplete"), "one-time-code");
    await noTestCode(page, "the code step");
    // A wrong code: the mismatch, the field emptied, the step kept.
    await code.fill("111111");
    await button(page, "Verify").click();
    await expect(text(page, COPY.mismatch)).toBeVisible();
    await expect(code).toHaveValue("");
    assert.equal(f.calls("/rest/v1/rpc/exchange_test_code").length, 0, "only the test code is exchanged");
    // 000000: exchanged for the stored code, then verified with it.
    await code.fill("000000");
    await button(page, "Verify").click();
    await expect(text(page, COPY.verified)).toBeVisible();
    const exchange = f.calls("/rest/v1/rpc/exchange_test_code");
    assert.equal(exchange.length, 1);
    assert.deepEqual(exchange[0].body, { p_phone: "+447700900834", p_code: "000000" });
    const verifies = f.calls("/auth/v1/verify");
    assert.deepEqual(verifies.map((x) => x.body), [
      { type: "sms", phone: "+447700900834", token: "111111" },
      { type: "sms", phone: "+447700900834", token: STORED_CODE },
    ]);
    assert.ok(f.log.indexOf(exchange[0]) < f.log.indexOf(verifies[1]), "the exchange comes before the verify");
    // The answer step: the event, the name, the three answers.
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await focused(page, "Picnic in the park");
    await expect(text(page, "Mon 2 Nov, 13:00 – 16:00 · Hyde Park area")).toBeVisible();
    await expect(text(page, COPY.hostSees)).toBeVisible();
    await noTestCode(page, "the answer step");
    await button(page, "Send answer").click();
    await expect(text(page, "Choose Going, Maybe or Can’t go.")).toBeVisible();
    await page.getByRole("radio", { name: "Going", exact: true }).check();
    await button(page, "Send answer").click();
    await expect(text(page, "Use a name between 1 and 80 characters.")).toBeVisible();
    assert.equal(f.calls("/rest/v1/rpc/answer_phone_invitation").length, 0);
    await page.getByLabel("Your first name", { exact: true }).fill("Sam");
    await button(page, "Send answer").click();
    await expect(heading(page, COPY.going)).toBeVisible();
    await focused(page, COPY.going);
    const answers = f.calls("/rest/v1/rpc/answer_phone_invitation");
    assert.equal(answers.length, 1);
    assert.deepEqual(answers[0].body, { p_code: CODE, p_name: "Sam", p_response: "accepted", p_terms_version: "2026-10" });
    const session = [...f.state.access.keys()].at(-1);
    assert.equal(answers[0].auth, `Bearer ${session}`);
    // Direction A.
    await expect(text(page, COPY.hostCanSee)).toBeVisible();
    for (const benefit of COPY.benefits) await expect(text(page, benefit)).toBeVisible();
    const getApp = page.getByRole("link", { name: "Get Resbite", exact: true });
    await expect(getApp).toBeVisible();
    await expect(getApp).toHaveAttribute("href", APP_STORE_URL);
    await expect(text(page, COPY.waiting)).toBeVisible();
    await expect(button(page, "Not now")).toBeVisible();
    await noTestCode(page, "the done screen");
    assert.ok(!(await page.content()).includes("000000"), "not in the document either");
    // Not now: the pitch goes; the answer stays.
    await button(page, "Not now").click();
    await expect(getApp).toBeHidden();
    await expect(text(page, COPY.benefits[0])).toBeHidden();
    await expect(heading(page, COPY.going)).toBeVisible();
    await focused(page, COPY.going);
  }

  // 2. Coming back on the same browser: the stored session shows the answer again (refreshed first once it has
  // expired), and changing it to Can't go shows the softer screen.
  {
    await page.reload();
    await expect(heading(page, COPY.going)).toBeVisible();
    await expect(page.getByRole("link", { name: "Get Resbite", exact: true })).toHaveAttribute("href", APP_STORE_URL);
    await expect(text(page, COPY.waiting)).toBeVisible();
    const mine = f.calls("/rest/v1/rpc/my_phone_invitation");
    assert.equal(mine.length, 1);
    assert.deepEqual(mine[0].body, { p_code: CODE });
    assert.equal(f.calls("/auth/v1/token").length, 0, "a fresh session is not refreshed");
    // An expired session is refreshed before it is used.
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("resbite.personal.session"));
      localStorage.setItem("resbite.personal.session", JSON.stringify({ ...stored, expires_at: Math.floor(Date.now() / 1000) - 10 }));
    });
    const before = f.log.length;
    await page.reload();
    await expect(heading(page, COPY.going)).toBeVisible();
    const after = f.log.slice(before);
    assert.deepEqual(after.map((x) => `${x.path}${x.search}`), ["/auth/v1/token?grant_type=refresh_token", "/rest/v1/rpc/my_phone_invitation"]);
    assert.equal(after[0].auth, null);
    assert.ok(after[1].auth && f.state.access.has(after[1].auth.replace("Bearer ", "")));
    assert.equal(after[1].auth, `Bearer ${[...f.state.access.keys()].at(-1)}`, "the refreshed token is the one used");
    // Change the answer: no name this time, Can't go, the softer screen.
    await button(page, "Change answer").click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await focused(page, "Picnic in the park");
    await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeChecked();
    await expect(page.getByLabel("Your first name", { exact: true })).toBeHidden();
    await page.getByRole("radio", { name: "Can’t go", exact: true }).check();
    await button(page, "Send answer").click();
    await expect(heading(page, COPY.cant)).toBeVisible();
    await focused(page, COPY.cant);
    const answers = f.calls("/rest/v1/rpc/answer_phone_invitation");
    assert.equal(answers.length, 2);
    assert.deepEqual(answers[1].body, { p_code: CODE, p_name: "", p_response: "declined", p_terms_version: "2026-10" });
    assert.equal(f.state.response, "declined");
    await expect(text(page, COPY.hostSees)).toBeVisible();
    await expect(text(page, COPY.planOwn)).toBeVisible();
    const small = page.getByRole("link", { name: "Get Resbite", exact: true });
    await expect(small).toHaveAttribute("href", APP_STORE_URL);
    await expect(small).not.toHaveClass(/\bdark\b/);
    for (const hidden of [COPY.going, COPY.benefits[0], COPY.waiting]) await expect(text(page, hidden)).toBeHidden();
    await expect(button(page, "Not now")).toBeHidden();
    // And again after a reload.
    await page.reload();
    await expect(heading(page, COPY.cant)).toBeVisible();
    await noTestCode(page, "the softer screen");
    await f.done();
  }

  // 3. Closed pages render their sentence without the form, the script or any request to Supabase.
  {
    const f = await fixture(),
      { page } = f;
    for (const [code, sentence] of [
      [CANCELLED, "Marcos cancelled this resbite."],
      [HAPPENED, "This resbite has already happened."],
      [UNKNOWN, "This invitation is no longer active."],
      ["nope", "This invitation is no longer active."],
    ]) {
      await page.goto(`${ORIGIN}/i/${code}`);
      await expect(heading(page, sentence)).toBeVisible();
      for (const role of ["textbox", "checkbox", "radio", "button"]) await expect(page.getByRole(role)).toHaveCount(0);
      assert.equal(await page.locator("script, #step-confirm, [data-publishable-key]").count(), 0, code);
      await noTestCode(page, `the ${code} page`);
    }
    assert.equal(f.log.length, 0, "closed pages never call Supabase");
    await f.done();
  }

  // 4 (with the checks in 1 and 2). Refusals: a session for another number whose last two digits match is refused
  // by the server ("That isn't the number…") and nothing is recorded; too many tries; a lost connection.
  {
    const f = await fixture({ seed: OTHER }),
      { page } = f;
    await page.goto(`${ORIGIN}/i/${CODE}`);
    await expect(text(page, COPY.verified)).toBeVisible();
    await page.getByLabel("Your first name", { exact: true }).fill("Ana");
    await page.getByRole("radio", { name: "Maybe", exact: true }).check();
    await button(page, "Send answer").click();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    await expect(text(page, COPY.wrongNumber)).toBeVisible();
    assert.equal(f.state.response, null, "no answer is recorded");
    assert.equal(await page.evaluate(() => localStorage.getItem("resbite.personal.session")), null, "the other number's session is dropped");
    f.state.tooMany = true;
    await page.getByRole("checkbox", { name: COPY.tick, exact: true }).check();
    await page.getByLabel("Mobile number", { exact: true }).fill("+44 7700 900834");
    await button(page, "Send code").click();
    await expect(text(page, COPY.tooMany)).toBeVisible();
    await expect(button(page, "Send code")).toBeEnabled();
    assert.equal(f.calls("/auth/v1/otp").length, 0);
    f.state.tooMany = false;
    f.state.offline = true;
    await button(page, "Send code").click();
    await expect(text(page, COPY.connection)).toBeVisible();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    f.state.offline = false;
    await button(page, "Send code").click();
    await expect(heading(page, COPY.codeHeading)).toBeVisible();
    assert.deepEqual(f.calls("/rest/v1/rpc/check_invited_number").at(-1).body, { p_code: CODE, p_phone: "+447700900834" });
    // Change number: back to the number, the tick kept.
    await button(page, "Change number").click();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    await focused(page, COPY.confirm);
    await expect(page.getByRole("checkbox", { name: COPY.tick, exact: true })).toBeChecked();
    await noTestCode(page, "the refusals");
    await f.done();
  }

  // 5. The narrow screen: nothing scrolls sideways on the steps.
  {
    const f = await fixture({ width: 320 }),
      { page } = f;
    await page.goto(`${ORIGIN}/i/${CODE}`);
    await button(page, "Answer").click();
    await expect(heading(page, COPY.confirm)).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 320");
    await f.done();
  }

  console.log(
    "PASS: /i/<code> in headless Chrome: Answer → the 18+ tick → a wrong number (checked, no code) → the right number (local form) → /otp → a wrong code → 000000 exchanged then verified with the stored code → name and Going → answer_phone_invitation → direction A (benefits, Get Resbite → app store, Not now); a reload restores the answer (refreshing an expired session first) and changing it to Can't go shows the softer screen; cancelled, happened and inactive pages have no form; another number's session is refused; too many tries; a lost connection; focus on each step's heading; no 000000 anywhere; no request beyond the page's origin and the intercepted Supabase host.",
  );
} finally {
  await browser?.close();
  await new Promise((ok) => server.close(ok));
  await rm(dir, { recursive: true, force: true });
}
