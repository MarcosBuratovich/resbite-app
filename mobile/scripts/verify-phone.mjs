// Phone accounts in headless Chrome: sign-up by number and code with the 18+ tick, 000000 refused in live mode and
// swapped in test mode, sign-in with a number that has no account, the Add your number gate with a taken number and
// its Sign out, and an interrupted sign-up. Every Supabase request is answered by the fixture below; any other path fails the run.
// auth.users.phone is digits-only ("447700900834"), so the fixtures store it that way too.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, heading } from "./qa-helpers.mjs";
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const STORAGE_KEY = "sb-ewcsgvhuojxdpaspwsrx-auth-token";
const NUMBER = "+447700900834";
const DIGITS = "447700900834";
const TAKEN = "+447700900111";
// What exchange_test_code returns in test mode: the code the Send SMS hook stored.
const STORED_CODE = "123456";
const COPY = {
  invalid: "Enter a valid mobile number.",
  mismatch: "That code doesn’t match. Try again.",
  noAccount: "No Resbite account uses this number yet.",
  taken:
    "This number already belongs to another Resbite account. Use a different number, or sign out and sign in with that number.",
};
const jwt = (sub, exp) =>
  [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ sub, exp, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");
const now = () => new Date().toISOString();

/**
 * A page on a stubbed Supabase. `user` is the signed-in account (null: signed out). The account changes as the
 * app writes to it: a verified code confirms the phone, a name lands in user_metadata.
 */
async function fixture({ user = null, access = "access_pending", profile = null, width = 390 } = {}) {
  // en-GB: deviceRegion() reads the browser locale, and "07700 900834" is a GB number.
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  const page = await context.newPage();
  const state = { user, access, profile, signupId: "33333333-3333-4333-8333-333333333333" };
  const log = [],
    errors = [],
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The 400 and 422 replies below are deliberate; the browser reports each one.
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (400|422)/.test(m.text()))
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
  // Live mode: no stored code, so exchange_test_code returns null and the app checks 000000 as typed.
  let live = false;
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
      if (body.token !== STORED_CODE) return authError(400, "otp_expired", "Token has expired or is invalid");
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
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: state.user.id, status: state.access });
    if (path === "/rest/v1/rpc/exchange_test_code") {
      // Slow enough to see the code step while it checks 000000.
      await new Promise((resolve) => setTimeout(resolve, 400));
      return reply(live ? null : STORED_CODE);
    }
    if (path === "/rest/v1/rpc/note_app_session" || path === "/rest/v1/rpc/attest_age")
      return route.fulfill({ status: 204, body: "" });
    if (path === "/rest/v1/profiles") return reply(state.profile);
    if (path === "/rest/v1/activities") return reply([]);
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
    live: (next) => (live = next),
    calls: (method, path) => log.filter((x) => x.method === method && x.path === path),
    index: (predicate) => log.findIndex(predicate),
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
const tick = (page) => page.getByRole("checkbox", { name: "I’m 18 or over", exact: true });
/** The six cells drawn under the code field: what the person sees. */
const cells = (page) => codeField(page).evaluate((input) => input.previousElementSibling?.textContent ?? null);

try {
  // 1. Sign-up from the landing: the tick, a bad number, a wrong code, 000000 in test mode, then a name.
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
    assert.equal(f.calls("POST", "/rest/v1/rpc/exchange_test_code").length, 0, "only 000000 is exchanged");
    // 000000 in live mode (no stored code): exchange_test_code returns null, the app checks 000000 as typed, and
    // GoTrue refuses it. A wrong code: the mismatch copy, the cells empty, no session, no tick attested.
    f.live(true);
    await codeField(page).fill("000000");
    // The earlier refusal goes while it checks, so the copy below is this code's.
    await expect(page.getByLabel("Checking the code", { exact: true })).toBeVisible();
    await expect(page.getByText(COPY.mismatch, { exact: true })).toHaveCount(0);
    await expect(page.getByText(COPY.mismatch, { exact: true })).toBeVisible();
    await expect(codeField(page)).toHaveValue("");
    assert.equal(await cells(page), "");
    await expect(heading(page, "Enter the code")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/phone$/);
    const liveExchange = f.calls("POST", "/rest/v1/rpc/exchange_test_code");
    assert.equal(liveExchange.length, 1);
    assert.deepEqual(liveExchange[0].body, { p_phone: NUMBER, p_code: "000000" });
    const liveVerify = f.calls("POST", "/auth/v1/verify");
    assert.equal(liveVerify.length, 2);
    assert.deepEqual([liveVerify[1].body.phone, liveVerify[1].body.token, liveVerify[1].body.type], [NUMBER, "000000", "sms"]);
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY), null, "no session after a refused 000000");
    assert.equal(f.calls("POST", "/rest/v1/rpc/attest_age").length, 0, "no tick is attested without a session");
    await noTestCode(page, "the code step after a refused 000000");
    f.live(false);
    // 000000 in test mode: swapped for the stored code, verified, then the tick is attested once signed in.
    await codeField(page).fill("000000");
    await expect(page.getByLabel("Checking the code", { exact: true })).toBeVisible();
    assert.equal(await cells(page), "000000");
    await noTestCode(page, "the code step holding 000000");
    await expect(heading(page, "About you")).toBeVisible();
    await expect(page).toHaveURL(/\/about-you$/);
    const exchange = f.log.findLastIndex((x) => x.path === "/rest/v1/rpc/exchange_test_code");
    const verify = f.index((x) => x.path === "/auth/v1/verify" && x.body.token === STORED_CODE);
    await expect.poll(() => f.calls("POST", "/rest/v1/rpc/attest_age").length).toBe(1);
    const attest = f.index((x) => x.path === "/rest/v1/rpc/attest_age");
    assert.deepEqual(f.log[exchange].body, { p_phone: NUMBER, p_code: "000000" });
    assert.deepEqual([f.log[verify].body.phone, f.log[verify].body.type], [NUMBER, "sms"]);
    assert.deepEqual(f.log[attest].body, { p_terms_version: "2026-10" });
    assert.ok(exchange < verify && verify < attest, "exchange, then verify, then attest");
    assert.equal(f.calls("POST", "/auth/v1/verify").length, 3, "in test mode the stored code is verified, not 000000");
    await expect.poll(() => f.calls("POST", "/rest/v1/rpc/note_app_session").length).toBe(1);
    await noTestCode(page, "About you");
    // 4. Interrupted sign-up: reopening the app with a verified number and no name lands on About you again.
    await page.goto(base);
    await expect(heading(page, "About you")).toBeVisible();
    await expect(page).toHaveURL(/\/about-you$/);
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("");
    await expect(button(page, "Continue")).toBeDisabled();
    await page.getByLabel("Your name", { exact: true }).fill("Sam");
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

  // 3. Add your number: an approved email account without a phone, a taken number, then a good one with 000000.
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
    await codeField(page).fill("000000");
    await expect(heading(page, "Create")).toBeVisible();
    await expect(page).toHaveURL(/\/create$/);
    const exchange = f.index((x) => x.path === "/rest/v1/rpc/exchange_test_code");
    const verify = f.index((x) => x.path === "/auth/v1/verify");
    assert.deepEqual(f.log[exchange].body, { p_phone: NUMBER, p_code: "000000" });
    assert.deepEqual([f.log[verify].body.phone, f.log[verify].body.token, f.log[verify].body.type], [NUMBER, STORED_CODE, "phone_change"]);
    assert.ok(exchange < verify);
    assert.equal(f.state.user.phone, DIGITS);
    assert.equal(f.calls("POST", "/rest/v1/rpc/attest_age").length, 0, "no tick to attest when adding a number");
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
    await f.done();
  }

  console.log(
    "PASS: phone sign-up (tick, invalid number, +44 number, wrong code, 000000 refused in live mode, 000000 swap in test mode → verify → attest_age, About you → name → /account), sign-in with an unknown number → Create an account, Add your number with a taken number then phone_change, Sign out from the taken refusal, interrupted sign-up restored on About you, and no 000000 on any screen. All Supabase requests intercepted.",
  );
} finally {
  await browser.close();
}
