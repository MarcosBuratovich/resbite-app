// Phone accounts in headless Chrome: sign-up by number and code with the 18+ tick, 000000 refused as a wrong code,
// sign-in with a number that has no account, the Add your number gate with a taken number and its Sign out, an
// interrupted sign-up, and (plan 4) the Accept your Terms gate. Every Supabase request is answered by the fixture
// below; any other path fails the run.
// Add your number and About you each open Delete account (DEL-2). What that screen asks for depends on the build: run
// once against Expo as usual, and once against Expo started with EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true and this
// script with RESBITE_QA_DELETION_ENABLED=true, which then expects each account's proof card instead of the privacy
// address.
// auth.users.phone is digits-only ("447700900834"), so the fixtures store it that way too.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { button, heading } from "./qa-helpers.mjs";
const shots = join(tmpdir(), "resbite-phone");
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
// The build was started with EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true (see the header).
const deletionEnabled = process.env.RESBITE_QA_DELETION_ENABLED === "true";
const STORAGE_KEY = "sb-ewcsgvhuojxdpaspwsrx-auth-token";
const NUMBER = "+447700900834";
const DIGITS = "447700900834";
const TAKEN = "+447700900111";
// The code the text message carried: the only one the fixture's verify accepts.
const SENT_CODE = "123456";
const COPY = {
  invalid: "Enter a valid mobile number.",
  mismatch: "That code doesn’t match. Try again.",
  noAccount: "No Resbite account uses this number yet.",
  taken:
    "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help.",
  tick: "I’m 18 or over and I accept the Terms of Use.",
  ageHelper: "Resbite is for people aged 18 and over.",
  termsHeading: "Please accept our Terms",
  termsChanged: "Our Terms changed while you were reading. Please read them again.",
  deleteAccount: "Delete my account",
  deletionUnavailable: "To delete your account, email privacy@resbite.com.",
};
// The Terms of Use version the fixture's server reports as published (the app's TERMS_VERSION too).
const TERMS = "2026-12";
const jwt = (sub, exp) =>
  [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ sub, exp, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");
const now = () => new Date().toISOString();

/**
 * A page on a stubbed Supabase. `user` is the signed-in account (null: signed out). The account changes as the
 * app writes to it: a verified code confirms the phone, a name lands in user_metadata. `termsNeeded`: the account
 * has yet to accept the published Terms version (`state.termsVersion`); accept_terms, like the server, records only
 * that version and refuses any other with "Terms changed", and the sign-up tick (attest_age) records the version it
 * carries.
 */
async function fixture({ user = null, access = "access_pending", profile = null, width = 390, termsNeeded = false } = {}) {
  // en-GB: deviceRegion() reads the browser locale, and "07700 900834" is a GB number.
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  const page = await context.newPage();
  const state = { user, access, profile, termsNeeded, termsVersion: TERMS, signupId: "33333333-3333-4333-8333-333333333333" };
  const log = [],
    errors = [],
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Whether the Accept your Terms heading was ever on the page, however briefly.
  await page.addInitScript((words) => {
    window.__sawTerms = false;
    new MutationObserver(() => {
      if (document.documentElement.textContent.includes(words)) window.__sawTerms = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, COPY.termsHeading);
  page.on("console", (m) => {
    // The 400, 422 and 504 replies below are deliberate; the browser reports each one.
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (400|422|504)/.test(m.text()))
      errors.push(m.text());
  });
  if (user) {
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    await page.addInitScript(
      ({ key, session }) => {
        if (!sessionStorage.getItem("fixture-seeded")) {
          sessionStorage.setItem(key, JSON.stringify(session));
          sessionStorage.setItem("fixture-seeded", "1");
        }
      },
      {
        key: STORAGE_KEY,
        session: { user, access_token: jwt(user.id, expires_at), refresh_token: "fixture", token_type: "bearer", expires_at, expires_in: 3600 },
      },
    );
  }
  let otpReply = null;
  // A lost reply: the server takes the code, but the app gets a gateway timeout instead of the session.
  let lostVerify = false;
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    log.push({ method, path, body });
    const reply = (value, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    // GoTrue's error body: the code is read from error_code.
    const authError = (status, code, msg) => reply({ code: status, error_code: code, msg }, status);
    const session = () => {
      const expires_at = Math.floor(Date.now() / 1000) + 3600;
      return { access_token: jwt(state.user.id, expires_at), refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at, user: state.user };
    };
    if (method === "POST" && path === "/auth/v1/otp") {
      if (otpReply) return authError(...otpReply);
      return reply({});
    }
    if (method === "POST" && path === "/auth/v1/verify") {
      // Slow enough to see the code step while it checks.
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (body.token !== SENT_CODE) return authError(400, "otp_expired", "Token has expired or is invalid");
      const digits = body.phone.replace(/^\+/, "");
      if (body.type === "sms")
        state.user ??= {
          id: state.signupId,
          aud: "authenticated",
          role: "authenticated",
          email: "",
          app_metadata: { provider: "phone", providers: ["phone"] },
          user_metadata: {},
          created_at: now(),
        };
      state.user = { ...state.user, phone: digits, phone_confirmed_at: now(), new_phone: undefined };
      if (lostVerify) return reply({ code: 504, msg: "Gateway timeout" }, 504);
      return reply(session());
    }
    if (path === "/auth/v1/user") {
      if (!state.user) return reply({ code: 401, msg: "No session" }, 401);
      if (method === "GET") return reply(state.user);
      if (method === "PUT") {
        if (body.phone) {
          if (body.phone === TAKEN) return authError(422, "phone_exists", "A user with this phone number has already been registered");
          state.user = { ...state.user, new_phone: body.phone.replace(/^\+/, "") };
          return reply(state.user);
        }
        state.user = { ...state.user, user_metadata: { ...state.user.user_metadata, ...body.data } };
        return reply(state.user);
      }
    }
    if (method === "POST" && path === "/auth/v1/logout") {
      state.user = null;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/rest/v1/rpc/account_access_status")
      return reply({ account_id: state.user.id, status: state.access, terms_version: state.termsVersion, terms_needed: state.termsNeeded });
    if (path === "/rest/v1/rpc/attest_age") {
      if (body?.p_terms_version === state.termsVersion) state.termsNeeded = false;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/rest/v1/rpc/accept_terms") {
      if (body?.p_terms_version !== state.termsVersion) return reply({ code: "22023", message: "Terms changed" }, 400);
      state.termsNeeded = false;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
    if (path === "/rest/v1/profiles") return reply(state.profile);
    if (path === "/rest/v1/activities") return reply([]);
    // Waiting for access lists the account's open-link requests: none here.
    if (path === "/rest/v1/rpc/my_join_requests") return reply([]);
    unexpected.push(`${method} ${path}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });
  return {
    page,
    log,
    errors,
    unexpected,
    state,
    otp: (next) => (otpReply = next),
    loseVerify: (next) => (lostVerify = next),
    calls: (method, path) => log.filter((x) => x.method === method && x.path === path),
    index: (predicate) => log.findIndex(predicate),
    /** The owner publishes a new Terms version: the account has yet to accept it. */
    publish: (version) => {
      state.termsVersion = version;
      state.termsNeeded = true;
    },
    sawTerms: () => page.evaluate(() => window.__sawTerms),
    async done() {
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors");
      await context.close();
    },
  };
}

/** The test code never shows: no text, label, placeholder or field holds 000000 except the code field itself. */
async function noTestCode(page, where) {
  const found = await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.includes("000000")) hits.push(`text "${n.data}"`);
    for (const el of document.querySelectorAll("*")) {
      const code = el.matches("input[aria-label='6-digit code']");
      for (const name of ["aria-label", "aria-description", "aria-valuetext", "placeholder", "title", "alt", "value"])
        if (!(code && name === "value") && el.getAttribute(name)?.includes("000000")) hits.push(`${name} on ${el.tagName}`);
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !code && el.value.includes("000000"))
        hits.push(`value of ${el.getAttribute("aria-label")}`);
    }
    if (document.body.innerText.includes("000000")) hits.push("rendered text");
    if (document.title.includes("000000") || location.href.includes("000000")) hits.push("title or address");
    return hits;
  });
  assert.deepEqual(found, [], `no test code on ${where}`);
}

const codeField = (page) => page.getByLabel("6-digit code", { exact: true });
const numberField = (page) => page.getByLabel("Mobile number", { exact: true });
const tick = (page) => page.getByRole("checkbox", { name: COPY.tick, exact: true });
/** The six cells drawn under the code field: what the person sees. */
const cells = (page) => codeField(page).evaluate((input) => input.previousElementSibling?.textContent ?? null);
/**
 * A gate's Delete my account opens Delete account with the account's own proof (`card`: a line and a button), or the
 * privacy address in a build without deletion; Back returns to the gate. Nothing is sent: no code, no request.
 */
async function opensDeletion(f, gate, card) {
  const { page } = f;
  const sent = f.log.length;
  await expect(button(page, COPY.deleteAccount)).toBeVisible();
  await button(page, COPY.deleteAccount).click();
  await expect(page).toHaveURL(/\/delete-account$/);
  await expect(heading(page, "Delete account")).toBeVisible();
  if (deletionEnabled) {
    await expect(page.getByText(card.line, { exact: true })).toBeVisible();
    await expect(button(page, card.button)).toBeVisible();
    await expect(page.getByText(COPY.deletionUnavailable, { exact: true })).toHaveCount(0);
  } else {
    await expect(page.getByText(COPY.deletionUnavailable, { exact: true })).toBeVisible();
    await expect(button(page, card.button)).toHaveCount(0);
  }
  const outbound = f.log.slice(sent).map((x) => x.path);
  for (const path of ["/auth/v1/otp", "/auth/v1/verify", "/functions/v1/delete-account"])
    assert.equal(outbound.includes(path), false, `opening Delete account from ${gate} sends nothing to ${path}`);
  await button(page, "Back").click();
  await expect(heading(page, gate)).toBeVisible();
}

try {
  // 0. The country chooser: Argentina's send form with the 9, and a typed +44 number switching the country.
  {
    const f = await fixture(),
      { page } = f;
    await page.goto(`${base}/auth/phone`);
    await expect(heading(page, "Your number")).toBeVisible();
    await page.getByRole("button", { name: /^Country:/ }).click();
    await page.getByLabel("Search countries", { exact: true }).fill("Argentina");
    await page.getByRole("button", { name: "Argentina +54", exact: true }).click();
    await expect(page.getByRole("button", { name: "Country: Argentina, +54", exact: true })).toBeVisible();
    await numberField(page).fill("11 1234 1234");
    await tick(page).click();
    await button(page, "Send code").click();
    await expect(heading(page, "Enter the code")).toBeVisible();
    const sent = f.calls("POST", "/auth/v1/otp");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.phone, "+5491112341234", "Argentina is sent in its form with the 9");
    await button(page, "Change number").click();
    await numberField(page).fill("+44 7700 900834");
    await expect(page.getByRole("button", { name: "Country: United Kingdom, +44", exact: true })).toBeVisible();
    await f.done();
  }

  // 1. Sign-up from the landing: the tick, a bad number, a wrong code, 000000 refused, the sent code, then a name.
  {
    const f = await fixture(),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "Get together")).toBeVisible();
    await button(page, "Get started").click();
    await button(page, "Skip introduction").click();
    await expect(page).toHaveURL(/\/auth\/phone$/);
    await expect(heading(page, "Your number")).toBeVisible();
    await noTestCode(page, "the sign-up number step");
    await expect(button(page, "Send code")).toBeDisabled();
    await numberField(page).fill("07700 900834");
    await expect(button(page, "Send code")).toBeDisabled();
    // Return in the field doesn't send without the tick either.
    await numberField(page).press("Enter");
    await expect(page.getByText("Resbite is for people aged 18 and over.", { exact: true }).first()).toBeVisible();
    await tick(page).click();
    await expect(tick(page)).toBeChecked();
    await expect(button(page, "Send code")).toBeEnabled();
    assert.equal(f.calls("POST", "/auth/v1/otp").length, 0, "nothing is sent before the tick");
    await numberField(page).fill("12");
    await button(page, "Send code").click();
    await expect(page.getByText(COPY.invalid, { exact: true })).toBeVisible();
    assert.equal(f.calls("POST", "/auth/v1/otp").length, 0, "an invalid number is never sent");
    await numberField(page).fill("07700 900834");
    await expect(page.getByText(COPY.invalid, { exact: true })).toHaveCount(0);
    await button(page, "Send code").click();
    await expect(heading(page, "Enter the code")).toBeVisible();
    const sent = f.calls("POST", "/auth/v1/otp");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.phone, NUMBER);
    assert.equal(sent[0].body.create_user, true, "sign-up may create the account");
    await expect(page.getByText("We sent a 6-digit code to +44 7700 900834.", { exact: true })).toBeVisible();
    await noTestCode(page, "the sign-up code step");
    // A wrong code: the mismatch copy, and the cells empty for another try.
    await codeField(page).fill("11");
    assert.equal(await cells(page), "11");
    await codeField(page).fill("111111");
    await expect(page.getByText(COPY.mismatch, { exact: true })).toBeVisible();
    await expect(codeField(page)).toHaveValue("");
    assert.equal(await cells(page), "");
    const wrong = f.calls("POST", "/auth/v1/verify");
    assert.equal(wrong.length, 1);
    assert.deepEqual([wrong[0].body.phone, wrong[0].body.token, wrong[0].body.type], [NUMBER, "111111", "sms"]);
    // 000000 is a wrong code: the app checks it as typed and GoTrue refuses it. The mismatch copy, the cells empty,
    // no session, no tick attested.
    await codeField(page).fill("000000");
    // The earlier refusal goes while it checks, so the copy below is this code's.
    await expect(page.getByLabel("Checking the code", { exact: true })).toBeVisible();
    await expect(page.getByText(COPY.mismatch, { exact: true })).toHaveCount(0);
    await expect(page.getByText(COPY.mismatch, { exact: true })).toBeVisible();
    await expect(codeField(page)).toHaveValue("");
    assert.equal(await cells(page), "");
    await expect(heading(page, "Enter the code")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/phone$/);
    const refused = f.calls("POST", "/auth/v1/verify");
    assert.equal(refused.length, 2);
    assert.deepEqual([refused[1].body.phone, refused[1].body.token, refused[1].body.type], [NUMBER, "000000", "sms"]);
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY), null, "no session after a refused 000000");
    assert.equal(f.calls("POST", "/rest/v1/rpc/attest_age").length, 0, "no tick is attested without a session");
    await noTestCode(page, "the code step after a refused 000000");
    // The code the text message carried: verified as typed, then the tick is attested once signed in.
    await codeField(page).fill(SENT_CODE);
    await expect(page.getByLabel("Checking the code", { exact: true })).toBeVisible();
    assert.equal(await cells(page), SENT_CODE);
    await noTestCode(page, "the code step holding the sent code");
    await expect(heading(page, "About you")).toBeVisible();
    await expect(page).toHaveURL(/\/about-you$/);
    const verify = f.index((x) => x.path === "/auth/v1/verify" && x.body.token === SENT_CODE);
    await expect.poll(() => f.calls("POST", "/rest/v1/rpc/attest_age").length).toBe(1);
    const attest = f.index((x) => x.path === "/rest/v1/rpc/attest_age");
    assert.deepEqual([f.log[verify].body.phone, f.log[verify].body.type], [NUMBER, "sms"]);
    assert.deepEqual(f.log[attest].body, { p_terms_version: TERMS });
    assert.ok(verify < attest, "verify, then attest");
    assert.deepEqual(
      f.calls("POST", "/auth/v1/verify").map((x) => x.body.token),
      ["111111", "000000", SENT_CODE],
      "every code is verified as typed",
    );
    await expect.poll(() => f.calls("POST", "/rest/v1/rpc/note_app_session").length).toBe(1);
    await noTestCode(page, "About you");
    // 4. Interrupted sign-up: reopening the app with a verified number and no name lands on About you again.
    await page.goto(base);
    await expect(heading(page, "About you")).toBeVisible();
    await expect(page).toHaveURL(/\/about-you$/);
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("");
    await expect(button(page, "Continue")).toBeDisabled();
    // Why Continue is off is on screen (and in the button's hint on the iPhone); a name clears it.
    const nameRule = page.getByText("Use a name between 1 and 80 characters.", { exact: true });
    await expect(nameRule).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("   ");
    await expect(button(page, "Continue")).toBeDisabled();
    await expect(nameRule).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("Sam");
    await expect(nameRule).toHaveCount(0);
    await button(page, "Continue").click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(heading(page, "Waiting for access")).toBeVisible();
    // The stored digits are shown as an international number.
    await expect(page.getByText("+44 7700 900834", { exact: true })).toBeVisible();
    const named = f.calls("PUT", "/auth/v1/user");
    assert.equal(named.length, 1);
    assert.deepEqual(named[0].body.data, { display_name: "Sam" });
    assert.equal(f.calls("POST", "/rest/v1/rpc/attest_age").length, 1, "the tick is attested once");
    await f.done();
  }

  // 2. Sign-in with a number that has no account: the refusal, then Create an account keeps the number.
  {
    const f = await fixture(),
      { page } = f;
    f.otp([422, "otp_disabled", "Signups not allowed for otp"]);
    await page.goto(base);
    await button(page, "I have an account").click();
    await expect(page).toHaveURL(/\/auth\/phone\?intent=signin$/);
    await expect(heading(page, "Sign in")).toBeVisible();
    await expect(tick(page)).toHaveCount(0);
    await noTestCode(page, "the sign-in number step");
    await numberField(page).fill("07700 900834");
    await button(page, "Send code").click();
    await expect(page.getByText(COPY.noAccount, { exact: true })).toBeVisible();
    const sent = f.calls("POST", "/auth/v1/otp");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.phone, NUMBER);
    assert.equal(sent[0].body.create_user, false, "sign-in never creates an account");
    await button(page, "Create an account").click();
    await expect(heading(page, "Your number")).toBeVisible();
    await expect(numberField(page)).toHaveValue("07700 900834");
    await expect(tick(page)).toBeVisible();
    await expect(tick(page)).not.toBeChecked();
    await expect(button(page, "Send code")).toBeDisabled();
    await expect(page.getByText(COPY.noAccount, { exact: true })).toHaveCount(0);
    assert.equal(f.calls("POST", "/auth/v1/otp").length, 1);
    await f.done();
  }

  // 3. Add your number: an approved email account without a phone, a taken number, then a good one with the sent code.
  const phoneless = () => ({
    access: "approved",
    profile: { display_name: "Sam Fixture", avatar_path: null, avatar_revision: 0 },
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { display_name: "Sam Fixture" },
      created_at: "2026-01-01T00:00:00Z",
    },
  });
  {
    const f = await fixture(phoneless()),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "Add your number")).toBeVisible();
    await expect(page).toHaveURL(/\/add-phone$/);
    await expect(page.getByText("Your friends find and invite you by your number.", { exact: true })).toBeVisible();
    await expect(page.getByText("We never show your number to other people on Resbite.", { exact: true })).toBeVisible();
    await noTestCode(page, "Add your number");
    await numberField(page).fill("07700 900111");
    await button(page, "Send code").click();
    await expect(page.getByText(COPY.taken, { exact: true })).toBeVisible();
    assert.deepEqual(f.calls("PUT", "/auth/v1/user").map((x) => x.body.phone), [TAKEN]);
    // Still signed in, on the gate, with Change number and Sign out.
    assert.ok(await page.evaluate((key) => Boolean(sessionStorage.getItem(key)), STORAGE_KEY), "the session is kept");
    assert.equal(f.calls("POST", "/auth/v1/logout").length, 0);
    await expect(heading(page, "Add your number")).toBeVisible();
    await expect(button(page, "Sign out")).toBeVisible();
    await button(page, "Change number").click();
    await expect(numberField(page)).toHaveValue("");
    await expect(page.getByText(COPY.taken, { exact: true })).toHaveCount(0);
    await numberField(page).fill("07700 900834");
    await button(page, "Send code").click();
    await expect(heading(page, "Enter the code")).toBeVisible();
    assert.deepEqual(f.calls("PUT", "/auth/v1/user").map((x) => x.body.phone), [TAKEN, NUMBER]);
    await expect(page.getByText("We sent a 6-digit code to +44 7700 900834.", { exact: true })).toBeVisible();
    await noTestCode(page, "the Add your number code step");
    await codeField(page).fill(SENT_CODE);
    await expect(heading(page, "Create")).toBeVisible();
    await expect(page).toHaveURL(/\/create$/);
    const verify = f.index((x) => x.path === "/auth/v1/verify");
    assert.deepEqual([f.log[verify].body.phone, f.log[verify].body.token, f.log[verify].body.type], [NUMBER, SENT_CODE, "phone_change"]);
    assert.equal(f.state.user.phone, DIGITS);
    assert.equal(f.calls("POST", "/rest/v1/rpc/attest_age").length, 0, "no tick to attest when adding a number");
    await f.done();
  }

  // 3d. After Apple or Google sign-in the number is still required, with both lines of explanation (B10). An account
  // that won't add one can still delete (DEL-2): Delete my account opens Delete account, which confirms an Apple
  // account with Apple and a Google one with a code emailed to its address.
  for (const provider of ["apple", "google"]) {
    const account = phoneless();
    account.user.app_metadata = { provider, providers: [provider] };
    const f = await fixture(account),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "Add your number")).toBeVisible();
    await expect(page).toHaveURL(/\/add-phone$/);
    await expect(page.getByText("Your friends find and invite you by your number.", { exact: true })).toBeVisible();
    await expect(page.getByText("We never show your number to other people on Resbite.", { exact: true })).toBeVisible();
    await expect(button(page, "Sign out")).toBeVisible();
    await opensDeletion(
      f,
      "Add your number",
      provider === "apple"
        ? { line: "Type DELETE, then confirm with Apple.", button: "Continue with Apple" }
        : { line: "We’ll email a code to fixture@example.invalid.", button: "Send code" },
    );
    await expect(page).toHaveURL(/\/add-phone$/);
    assert.equal(f.calls("POST", "/auth/v1/logout").length, 0, "still signed in");
    await f.done();
  }

  // 3b. The gate's other exit: after the taken refusal, Sign out ends the session on the server and on this device.
  {
    const f = await fixture(phoneless()),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "Add your number")).toBeVisible();
    await numberField(page).fill("07700 900111");
    await button(page, "Send code").click();
    await expect(page.getByText(COPY.taken, { exact: true })).toBeVisible();
    assert.equal(f.calls("POST", "/auth/v1/logout").length, 0);
    await button(page, "Sign out").click();
    await expect.poll(() => f.calls("POST", "/auth/v1/logout").length).toBe(1);
    await expect(heading(page, "Get together")).toBeVisible();
    await expect(button(page, "I have an account")).toBeVisible();
    await expect(heading(page, "Add your number")).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY)).toBe(null);
    await f.done();
  }

  // 3c. Add your number when the check's reply is lost: a wrong code re-reads the account and stays on the code
  // step; a code the server took but whose reply never arrived re-reads the account, finds the number verified and
  // carries on into the app.
  {
    const f = await fixture(phoneless()),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "Add your number")).toBeVisible();
    await numberField(page).fill("07700 900834");
    await button(page, "Send code").click();
    await expect(heading(page, "Enter the code")).toBeVisible();
    const reads = () => f.calls("GET", "/auth/v1/user").length;
    const before = reads();
    await codeField(page).fill("111111");
    await expect(page.getByText(COPY.mismatch, { exact: true })).toBeVisible();
    await expect(heading(page, "Enter the code")).toBeVisible();
    await expect(page).toHaveURL(/\/add-phone$/);
    assert.ok(reads() > before, "a failed check re-reads the account");
    assert.equal(f.state.user.phone, undefined, "a wrong code adds nothing");
    f.loseVerify(true);
    await codeField(page).fill(SENT_CODE);
    await expect(heading(page, "Create")).toBeVisible();
    await expect(page).toHaveURL(/\/create$/);
    await expect(page.getByText("Check your connection and try again.", { exact: true })).toHaveCount(0);
    const verifies = f.calls("POST", "/auth/v1/verify");
    assert.deepEqual(verifies.map((x) => [x.body.token, x.body.type]), [["111111", "phone_change"], [SENT_CODE, "phone_change"]]);
    assert.equal(f.state.user.phone, DIGITS);
    await f.done();
  }

  // 4. An interrupted sign-up, restored from storage: a verified number, no name and no profile opens on About you,
  // also after a reload.
  {
    const f = await fixture({
        access: "approved",
        user: {
          id: "44444444-4444-4444-8444-444444444444",
          aud: "authenticated",
          role: "authenticated",
          email: "",
          phone: DIGITS,
          phone_confirmed_at: "2026-10-27T09:00:00Z",
          app_metadata: { provider: "phone", providers: ["phone"] },
          user_metadata: {},
          created_at: "2026-10-27T09:00:00Z",
        },
      }),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "About you")).toBeVisible();
    await page.reload();
    await expect(heading(page, "About you")).toBeVisible();
    await expect(page).toHaveURL(/\/about-you$/);
    await noTestCode(page, "a restored About you");
    // A phone account that stops at About you can still delete, with a code texted to its number (DEL-2).
    await expect(button(page, "Sign out")).toBeVisible();
    await opensDeletion(f, "About you", { line: "We’ll text a code to +44 7700 900834.", button: "Send code" });
    await expect(page).toHaveURL(/\/about-you$/);
    await f.done();
  }

  // 5. Plan 4, Accept your Terms, at 320 and 390 px: an approved account with a verified number and no name that has
  // yet to accept the published version; a version published while the screen is open; the screen's two ways out;
  // a sign-up whose tick already accepted it; a suspended account.
  const unnamed = (width, access = "approved") => ({
    access,
    width,
    termsNeeded: true,
    user: {
      id: "55555555-5555-4555-8555-555555555555",
      aud: "authenticated",
      role: "authenticated",
      email: "",
      phone: DIGITS,
      phone_confirmed_at: "2026-11-17T09:00:00Z",
      app_metadata: { provider: "phone", providers: ["phone"] },
      user_metadata: {},
      created_at: "2026-11-17T09:00:00Z",
    },
  });
  const accepts = (f) => f.calls("POST", "/rest/v1/rpc/accept_terms").map((x) => x.body);
  const statusReads = (f) => f.calls("POST", "/rest/v1/rpc/account_access_status").length;
  const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  for (const width of [320, 390]) {
    // 5a. The gate, the tick, Continue: one accept_terms with the server's version, then About you.
    {
      const f = await fixture(unnamed(width)),
        { page } = f;
      await page.goto(`${base}/account`);
      await expect(heading(page, COPY.termsHeading)).toBeVisible();
      await expect(page).toHaveURL(/\/accept-terms$/);
      await expect(
        page.getByText("To use Resbite, confirm that you’re 18 or over and accept our Terms of Use. They include our community rules.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/^This is the first full version of our Terms\./)).toBeVisible();
      await expect(page.getByRole("link", { name: "Terms of Use", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Privacy Policy", exact: true })).toBeVisible();
      await expect(tick(page)).toBeVisible();
      await expect(tick(page)).not.toBeChecked();
      await expect(button(page, "Continue")).toBeDisabled();
      // Why Continue is off is on screen (and in the button's hint on the iPhone; react-native-web drops hints).
      await expect(page.getByText(COPY.ageHelper, { exact: true })).toBeVisible();
      await expect(button(page, "Delete my account")).toBeVisible();
      await expect(button(page, "Sign out")).toBeVisible();
      assert.ok(await fits(page), `the accept screen fits ${width} px`);
      assert.equal(await f.sawTerms(), true, "the watch below (5d, 5e) sees this screen");
      await page.screenshot({ path: `${shots}/accept-terms-${width}.png`, fullPage: true });
      await tick(page).click();
      await expect(tick(page)).toBeChecked();
      await expect(page.getByText(COPY.ageHelper, { exact: true })).toHaveCount(0);
      await expect(button(page, "Continue")).toBeEnabled();
      assert.deepEqual(accepts(f), [], "nothing is sent before Continue");
      await button(page, "Continue").click();
      await expect(heading(page, "About you")).toBeVisible();
      await expect(page).toHaveURL(/\/about-you$/);
      assert.deepEqual(accepts(f), [{ p_terms_version: TERMS }], "one accept, with the version the server reported");
      assert.equal(f.state.termsNeeded, false);
      assert.equal(f.calls("POST", "/rest/v1/rpc/attest_age").length, 0, "no sign-up tick to record");
      await f.done();
    }

    // 5b. The owner publishes a new version while the screen is open: the old one is refused with "Terms changed",
    // the line says so, the box is unticked and the account read again; the second Continue sends the new version.
    {
      const f = await fixture(unnamed(width)),
        { page } = f;
      await page.goto(`${base}/account`);
      await expect(heading(page, COPY.termsHeading)).toBeVisible();
      await tick(page).click();
      f.publish("2027-01");
      const before = statusReads(f);
      await button(page, "Continue").click();
      await expect(page.getByText(COPY.termsChanged, { exact: true })).toBeVisible();
      await expect(tick(page)).not.toBeChecked();
      await expect(button(page, "Continue")).toBeDisabled();
      await expect.poll(() => statusReads(f)).toBeGreaterThan(before);
      await expect(heading(page, COPY.termsHeading)).toBeVisible();
      // The new version is a new text to read: focus goes back to the heading.
      await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe(COPY.termsHeading);
      await expect(page).toHaveURL(/\/accept-terms$/);
      assert.ok(await fits(page), `the refusal fits ${width} px`);
      await tick(page).click();
      await button(page, "Continue").click();
      await expect(heading(page, "About you")).toBeVisible();
      assert.deepEqual(accepts(f), [{ p_terms_version: TERMS }, { p_terms_version: "2027-01" }]);
      await expect(page.getByText(COPY.termsChanged, { exact: true })).toHaveCount(0);
      await f.done();
    }

    // 5c. The ways out: Delete my account opens Delete account; back on the screen, Sign out signs out.
    {
      const f = await fixture(unnamed(width)),
        { page } = f;
      await page.goto(`${base}/account`);
      await expect(heading(page, COPY.termsHeading)).toBeVisible();
      await button(page, "Delete my account").click();
      await expect(page).toHaveURL(/\/delete-account$/);
      await expect(heading(page, "Delete account")).toBeVisible();
      await page.goBack();
      await expect(heading(page, COPY.termsHeading)).toBeVisible();
      await button(page, "Sign out").click();
      await expect.poll(() => f.calls("POST", "/auth/v1/logout").length).toBe(1);
      await expect(heading(page, "Get together")).toBeVisible();
      await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY)).toBe(null);
      assert.deepEqual(accepts(f), []);
      await f.done();
    }

    // 5d. Review Focus 1: a phone sign-up with the tick, the status reporting terms_needed until attest_age records
    // the version. The tick is recorded with the server's version, the accept screen never shows, About you does.
    // Approved, as every confirmed new account is since open beta: only an approved account meets the Terms gate
    // (accountGate), so an access_pending one would pass whatever the app did with the tick. The server reports a
    // version other than the app's TERMS_VERSION, so recording the app's own version instead would show here too.
    {
      const f = await fixture({ width, termsNeeded: true, access: "approved" }),
        { page } = f;
      const SERVER_TERMS = "2027-01";
      assert.notEqual(SERVER_TERMS, TERMS, "the server's version is not the app's");
      f.state.termsVersion = SERVER_TERMS;
      await page.goto(`${base}/auth/phone`);
      await expect(heading(page, "Your number")).toBeVisible();
      await numberField(page).fill("07700 900834");
      await tick(page).click();
      await button(page, "Send code").click();
      await expect(heading(page, "Enter the code")).toBeVisible();
      await codeField(page).fill(SENT_CODE);
      await expect(heading(page, "About you")).toBeVisible();
      await expect(page).toHaveURL(/\/about-you$/);
      assert.deepEqual(
        f.calls("POST", "/rest/v1/rpc/attest_age").map((x) => x.body),
        [{ p_terms_version: SERVER_TERMS }],
        "the tick is recorded as the server's version",
      );
      assert.deepEqual(accepts(f), [], "the sign-up tick is the acceptance");
      assert.equal(f.state.termsNeeded, false);
      assert.ok(f.calls("GET", "/rest/v1/profiles").length > 0, "read as an approved account");
      assert.equal(await f.sawTerms(), false, "the accept screen never showed");
      await f.done();
    }

    // 5e. Review Focus 5: a suspended account (access_pending) yet to accept sees its own screen, never this one.
    {
      const account = unnamed(width, "access_pending");
      account.user.user_metadata = { display_name: "Sam" };
      const f = await fixture(account),
        { page } = f;
      await page.goto(`${base}/account`);
      await expect(heading(page, "Waiting for access")).toBeVisible();
      await expect(page).toHaveURL(/\/account$/);
      assert.equal(await f.sawTerms(), false, "the accept screen never showed");
      assert.deepEqual(accepts(f), []);
      await f.done();
    }
  }

  console.log(
    `PASS: phone sign-up (the country chooser: Argentina sent with the 9, a typed +44 number switching the country; tick, invalid number, +44 number, wrong code, 000000 refused like any wrong code, the sent code → verify → attest_age, About you → name → /account), sign-in with an unknown number → Create an account, Add your number with a taken number then phone_change, Delete my account from Add your number (Apple and Google sign-ups) and from About you, ${deletionEnabled ? "each opening its proof card" : "each giving the privacy address in this build"}, Sign out from the taken refusal, a wrong code and a lost verify reply at Add your number, interrupted sign-up restored on About you, no 000000 on any screen, and Accept your Terms at 320/390 px (the gate after Add your number, the tick and one accept_terms with the server's version → About you, a version published meanwhile refused, re-read and accepted, Delete my account and Sign out, a sign-up tick that accepted already so no accept screen, a suspended account on its own screen). All Supabase requests intercepted.`,
  );
} finally {
  await browser.close();
}
