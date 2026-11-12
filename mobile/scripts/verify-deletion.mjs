// The Privacy screen (Data & privacy) and account deletion in headless Chrome.
//   preview   each topic opens its sheet with today's text; the Chat messages topic keeps chat core's words, then what a
//             report keeps (G-S11), then how long blocks stay (ruling SR4); the Contact topic only when the build has an
//             address (below); Blocked people opens and says nobody is blocked, with no request sent; Delete account's
//             What happens; no backend request
//   contact   EXPO_PUBLIC_SUPPORT_ADDRESS is inlined when the bundle is built (G-S14), so this runs twice:
//             - Expo started without it: no Contact topic and no empty placeholder (the gap between the topics' card
//               and Blocked people's is the gap between Blocked people's and Delete account's);
//             - Expo restarted with EXPO_PUBLIC_SUPPORT_ADDRESS=help@x.example and this script run with
//               EXPECT_SUPPORT=help@x.example: the line "Questions, or something wrong in a chat? Write to help@x.example."
//               is selectable text (user-select: text), Copy address is a button that copies the address and says
//               Copied, but says nothing when the browser refuses the copy (ruling SR4), and the address is a link whose
//               href is mailto:help@x.example (G-N10)
//   blocked   signed in on a stubbed Supabase (start Expo with a stand-in https EXPO_PUBLIC_SUPABASE_URL and
//             EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and pass the same URL to this script): my_blocks answering Leo, a
//             nameless account and a name holding bidi and zero-width marks lists Leo, Someone and Ana, each with a
//             button reading Unblock and named "Unblock <name>"; Unblock Leo sends block_user { p_user, p_block: false },
//             the row goes with no second read, "Unblocked Leo." is said and focus moves to the next row; the last one
//             leaves "You haven’t blocked anyone.", which takes focus; a failed read shows the error line with Try again
//             and names nobody; a failed unblock keeps the row and says why beside it; a refresh still running when
//             Unblock goes never brings the row back; an 18- and a 40-letter single-word name wrap inside the card at
//             390 px, at 320 px and under Larger Text at 320 px, and an ordinary name stays whole (G-S10, ruling SR4)
// Every Supabase request is answered or refused by the fixture; nothing reaches a real account.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { AUTH_STORAGE_KEY, button, heading, noChat, visible } from "./qa-helpers.mjs";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const enabled = process.env.RESBITE_QA_DELETION_ENABLED === "true";
// The address this build was started with (EXPO_PUBLIC_SUPPORT_ADDRESS), or none: the Contact topic must match it.
const expectSupport = process.env.EXPECT_SUPPORT || null;
const pass = (name) => console.log(`PASS ${name}`);
const CHAT_CORE =
  "Chat messages are stored on Resbite’s servers so everyone in a resbite’s chat can read them, including people who join later. They are not end-to-end encrypted. Deleting your account removes the text of your messages as cleanup finishes. Review account deletion’s availability in this build under Delete account.";
const REPORTS =
  "If you report a message or a person, the Resbite team reads the report and keeps a copy of what was reported, even if the message or that person’s account is deleted. If you delete your account, the reports you sent are deleted too. A report is deleted 180 days after the team closes it.";
const BLOCKS = "Blocks stay until you undo them. The Resbite team can see who blocked whom for 7 days.";
const NONE_BLOCKED = "You haven’t blocked anyone.";
const OFFLINE = "Check your connection and try again.";
const contactLine = (address) => `Questions, or something wrong in a chat? Write to ${address}.`;
/** The vertical gap between two rows' boxes, in CSS px. */
async function gapBetween(upper, lower) {
  const a = await upper.boundingBox(),
    b = await lower.boundingBox();
  assert.ok(a && b, "both rows are drawn");
  return Math.round(b.y - (a.y + a.height));
}
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});

// Blocked people's fixture: Ana, signed in (approved, phone verified), on a stubbed Supabase.
const ANA = "11111111-1111-4111-8111-111111111111";
const LEO = "44444444-4444-4444-8444-444444444444";
const MIA = "33333333-3333-4333-8333-333333333333";
const SOL = "55555555-5555-4555-8555-555555555555";
const fixtureJwt = (sub) =>
  [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");
const ana = {
  id: ANA,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "447700900834",
  phone_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
};
/** my_blocks' rows as the server sends them, newest first. */
const blockRow = (user_id, name) => ({ user_id, name });
/** Puts the app in the background and brings it back: RN-web's AppState follows document.visibilityState. */
async function foreground(page) {
  await page.evaluate(() => {
    const set = (v) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
    set("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    set("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
/**
 * A page signed in as Ana whose blocks change as the app unblocks. `failReads` and `failUnblocks` are how many of the
 * next my_blocks reads, or block_user calls, fail as a lost connection would; while `holdReads` is set, each read is
 * parked until `release()`, answered as it would have been on arrival.
 */
async function signedIn({ blocks = [], width = 390, failReads = 0, failUnblocks = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", locale: "en-GB" });
  // No "Get notified?" on any screen this opens.
  await context.addInitScript(() => {
    globalThis.__resbiteDevice ??= { reminders: [], calendar: [], permission: "denied" };
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ key, session }) => {
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem("fixture-seeded", "1");
      }
    },
    {
      key: AUTH_STORAGE_KEY,
      session: {
        user: ana,
        access_token: fixtureJwt(ANA),
        refresh_token: "fixture",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
      },
    },
  );
  const state = { blocks: [...blocks], failReads, failUnblocks, holdReads: false, parked: [] };
  const log = [],
    errors = [],
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The 503s are the lost connections under test.
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 503/.test(m.text())) errors.push(m.text());
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === new URL(base).origin) return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) {
      unexpected.push(`${req.method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    const path = url.pathname;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    log.push({ method: req.method(), path, body });
    const reply = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    const empty = () => route.fulfill({ status: 204, body: "" });
    const lost = () => reply({ message: "Fixture: lost connection" }, 503);
    if (path === "/auth/v1/user") return reply(ana);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: ANA, status: "approved" });
    if (path === "/rest/v1/rpc/note_app_session") return empty();
    if (path === "/rest/v1/profiles") return reply({ id: ANA, display_name: "Ana", avatar_path: null, avatar_revision: 0 });
    if (path === "/rest/v1/rpc/my_blocks") {
      const fail = state.failReads > 0;
      if (fail) state.failReads--;
      const rows = state.blocks.map((b) => ({ ...b }));
      const answer = () => (fail ? lost() : reply(rows));
      if (state.holdReads) return void state.parked.push(answer);
      return answer();
    }
    if (path === "/rest/v1/rpc/block_user") {
      if (state.failUnblocks > 0) {
        state.failUnblocks--;
        return lost();
      }
      if (body.p_block === false) state.blocks = state.blocks.filter((b) => b.user_id !== body.p_user);
      return empty();
    }
    // The reads of the signed-in shell that this screen doesn't need (My resbites' chats and the like).
    if (["/rest/v1/plans", "/rest/v1/attendees", "/rest/v1/plan_mutes", "/rest/v1/activities"].includes(path)) return reply([]);
    if (path === "/rest/v1/rpc/my_join_requests") return reply([]);
    if (path === "/rest/v1/rpc/my_connections") return reply({ requests: [], connected: [] });
    if (noChat(path) !== undefined) return reply(noChat(path));
    unexpected.push(`${req.method()} ${path}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });
  return {
    page,
    state,
    calls: (name) => log.filter((x) => x.method === "POST" && x.path === `/rest/v1/rpc/${name}`).map((x) => x.body),
    async release() {
      const answer = state.parked.shift();
      assert.ok(answer, "a read is held");
      await answer();
    },
    async done() {
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors");
      await context.close();
    },
  };
}
/** Opens Blocked people from Data & privacy's row, as a person does. */
async function openBlocked(page, query = "") {
  await page.goto(`${base}/data-privacy${query}`);
  await expect(heading(page, "Privacy")).toBeVisible();
  await button(page, "Blocked people").click();
  await expect(heading(page, "Blocked people")).toBeVisible();
}
const shown = (page, words) => visible(page.getByText(words, { exact: true }));
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*.supabase.co/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "Preview the design", exact: true })
    .click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Data & privacy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Privacy", exact: true }),
  ).toBeVisible();
  // Each topic opens a sheet with today's text, word for word.
  await page.getByRole("button", { name: "On this device", exact: true }).click();
  await expect(
    page.getByText(/^Contacts are read only when you choose them\./),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close sheet", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "About this page", exact: true }).click();
  await expect(
    page.getByText(/^Resbite is in private development\./),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close sheet", exact: true }),
  ).toHaveCount(0);
  // The Chat messages topic: chat core's words, hedged as Delete account's What happens is, then what a report keeps.
  await page.getByRole("button", { name: "Chat messages", exact: true }).click();
  await expect(page.getByText(CHAT_CORE, { exact: true })).toBeVisible();
  await expect(page.getByText(REPORTS, { exact: true })).toBeVisible();
  await expect(page.getByText(BLOCKS, { exact: true })).toBeVisible();
  assert.ok(
    await page.evaluate(
      (texts) => {
        const find = (text) => [...document.querySelectorAll("div,span")].find((el) => el.textContent === text);
        const found = texts.map(find);
        return found.every((el, i) => el && (i === 0 || found[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
      },
      [CHAT_CORE, REPORTS, BLOCKS],
    ),
    "chat core's line, then the reports line, then the blocks line",
  );
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close sheet", exact: true })).toHaveCount(0);
  pass("preview: the Chat messages topic keeps chat core's words, then what a report keeps, then how long blocks stay");
  // The Contact topic, as this build was started (G-N10, G-S14).
  const lastTopic = expectSupport ? "Contact" : "Preview & samples";
  const blockedRow = button(page, "Blocked people");
  await expect(blockedRow).toBeVisible();
  // No empty card or placeholder: the topics' card meets Blocked people's as Blocked people's meets Delete account's.
  assert.equal(
    await gapBetween(button(page, lastTopic), blockedRow),
    await gapBetween(blockedRow, button(page, "Delete account")),
    "nothing drawn between the topics and Blocked people",
  );
  await page.screenshot({ path: join(tmpdir(), `resbite-privacy${expectSupport ? "-contact" : ""}.png`), fullPage: true });
  if (!expectSupport) {
    await expect(page.getByRole("button", { name: "Contact", exact: true })).toHaveCount(0);
    await expect(page.getByText(/Write to|Copy address|Questions, or something wrong/)).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    pass("contact: no address in this build, so no Contact topic and no placeholder");
  } else {
    const context = page.context();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
    await page.getByRole("button", { name: "Contact", exact: true }).click();
    await expect(heading(page, "Contact")).toBeVisible();
    const line = page.getByText(contactLine(expectSupport), { exact: true });
    await expect(line).toBeVisible();
    assert.equal(await line.evaluate((el) => getComputedStyle(el).userSelect), "text", "the line, address and all, is selectable");
    const link = page.getByRole("link", { name: expectSupport, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `mailto:${expectSupport}`);
    const copy = page.getByRole("button", { name: "Copy address", exact: true });
    await expect(copy).toBeVisible();
    await expect(page.getByText("Copied", { exact: true })).toHaveCount(0);
    // A browser that refuses the copy (the async clipboard rejects, and the old execCommand fallback fails): no Copied.
    await page.evaluate(() => {
      globalThis.__copyRefused = true;
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (text) =>
        globalThis.__copyRefused ? Promise.reject(new DOMException("Fixture: refused", "NotAllowedError")) : write(text);
      const exec = document.execCommand.bind(document);
      document.execCommand = (...args) => (globalThis.__copyRefused ? false : exec(...args));
    });
    await copy.click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Copied", { exact: true })).toHaveCount(0);
    await expect(line).toBeVisible();
    await page.evaluate(() => (globalThis.__copyRefused = false));
    await copy.click();
    await expect(page.getByText("Copied", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expectSupport, "the address alone is copied");
    await page.screenshot({ path: join(tmpdir(), "resbite-privacy-contact-sheet.png") });
    await page.getByRole("button", { name: "Close sheet", exact: true }).click();
    await expect(page.getByRole("button", { name: "Close sheet", exact: true })).toHaveCount(0);
    pass(`contact: ${expectSupport} as selectable text, Copy address copies it and says Copied (nothing when refused), mailto: link`);
  }
  // Blocked people in the preview: no account, so nobody is blocked, and nothing is asked of the server.
  await blockedRow.click();
  await expect(heading(page, "Blocked people")).toBeVisible();
  await expect(page.getByText(NONE_BLOCKED, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Unblock / })).toHaveCount(0);
  await button(page, "Privacy").click();
  await expect(heading(page, "Privacy")).toBeVisible();
  pass("preview: Blocked people opens, says nobody is blocked, and reads nothing");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(
    page.getByText("Deletion immediately closes access.", { exact: true }),
  ).toBeVisible();
  // The full warnings, and the former Privacy deletion paragraph, sit in "What happens".
  await page.getByRole("button", { name: "What happens", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What happens", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/^Future plans you organized are cancelled\./),
  ).toBeVisible();
  await expect(
    page.getByText(/^Signing out does not delete your account or shared plans\./),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close sheet", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "You are exploring the design. Preview cannot delete a real account.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Permanently delete account",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveCount(0);
  assert.equal(
    requests.length,
    0,
    "Preview must not request backend data or send OTP/deletion calls",
  );
  await page.screenshot({
    path: join(tmpdir(), "resbite-deletion-preview.png"),
    fullPage: true,
  });
  if (!enabled) {
    await page.goto(`${base}/delete-account`);
    await expect(
      page.getByText(
        /Account deletion is not enabled in this development build/,
      ),
    ).toBeVisible();
    assert.equal(requests.length, 0);
  } else {
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      phone: "447700900834",
      phone_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { providers: ["email"] },
      user_metadata: { registration_details_version: 1 },
      created_at: "2026-01-01T00:00:00Z",
    };
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: user.id,
          exp: expires_at,
          role: "authenticated",
        }),
      ).toString("base64url"),
      "local-fixture-only",
    ].join(".");
    const session = {
      access_token: token,
      refresh_token: "fixture",
      token_type: "bearer",
      expires_at,
      expires_in: 3600,
      user,
    };
    await page.evaluate(
      ({ session, user }) => {
        sessionStorage.clear();
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem(
          `resbite.people.v1.${user.id}`,
          JSON.stringify({ groups: [], plans: {}, invitations: [] }),
        );
        sessionStorage.setItem(
          `resbite.create-journal.v1.${user.id}`,
          "deletion-fixture-journal",
        );
        sessionStorage.setItem("resbite.pending-invite", "a".repeat(64));
      },
      { session, user },
    );
    await page.unroute("**/*.supabase.co/**");
    let accepted = null,
      requestCount = 0,
      proofCount = 0,
      statusCount = 0,
      otpCount = 0;
    // The Apple-only case below swaps these: the signed-in account, the token the app sends as
    // Authorization, the proof the worker should receive, and who Apple's sign-in returns.
    let current = user,
      expectedAuthorization = token,
      expectedProof = token,
      appleProof = null;
    const appleNonces = [];
    await page.route("**/*.supabase.co/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const reply = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (path === "/auth/v1/user") return reply(current);
      if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
      if (path === "/rest/v1/rpc/account_access_status")
        return reply({ account_id: current.id, status: "approved" });
      if (path === "/rest/v1/profiles")
        return reply({ id: current.id, display_name: "Fixture", avatar_path: null });
      if (path === "/auth/v1/otp") {
        otpCount++;
        assert.equal(req.postDataJSON().create_user, false);
        return reply({});
      }
      if (path === "/auth/v1/verify") {
        proofCount++;
        assert.equal(req.postDataJSON().type, "email");
        return reply(session);
      }
      if (path === "/auth/v1/token") {
        proofCount++;
        if (new URL(req.url()).searchParams.get("grant_type") === "id_token") {
          // Sign in with Apple's id-token call, from the deletion screen's isolated client.
          const body = req.postDataJSON();
          assert.equal(body.provider, "apple");
          assert.equal(body.id_token, "fixture-apple-identity-token");
          appleNonces.push(body.nonce);
          assert.ok(appleProof, "Apple's sign-in was not expected here");
          return reply(appleProof);
        }
        return reply(session);
      }
      if (path === "/auth/v1/logout") return reply({});
      if (path === "/functions/v1/delete-account") {
        const body = req.postDataJSON();
        if (body.action === "status") {
          statusCount++;
          return accepted
            ? reply({ requestId: body.requestId, status: "queued" })
            : reply({}, 404);
        }
        assert.equal(body.action, "request");
        assert.equal(body.proof, expectedProof);
        assert.equal(req.headers().authorization, `Bearer ${expectedAuthorization}`);
        assert.equal(body.recoveryToken.length, 64);
        const saved = await page.evaluate(
          (id) => JSON.parse(sessionStorage.getItem(`resbite.deletion.${id}`)),
          current.id,
        );
        assert.equal(saved.requestId, body.requestId);
        assert.equal(saved.recoveryToken, body.recoveryToken);
        requestCount++;
        accepted = body;
        return route.abort("failed"); // Committed write, lost reply.
      }
      throw Error(`Unexpected intercepted API ${path}`);
    });
    await page.goto(`${base}/delete-account`);
    // An email account opens on the code (it may never have had a password); the password is one tap away.
    await expect(
      page.getByRole("button", { name: "Send verification code", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Use my password instead", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Send verification code", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Use an email code instead", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Current password", { exact: true })
      .fill("fixture-password");
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await page
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, 1);
    assert.equal(proofCount, 1);
    assert.ok(statusCount >= 2);
    const remaining = await page.evaluate(
      (id) => ({
        journal: sessionStorage.getItem(`resbite.create-journal.v1.${id}`),
        people: sessionStorage.getItem(`resbite.people.v1.${id}`),
        invite: sessionStorage.getItem("resbite.pending-invite"),
        session: sessionStorage.getItem("sb-ewcsgvhuojxdpaspwsrx-auth-token"),
        receipt: sessionStorage.getItem(`resbite.deletion.${id}`),
      }),
      user.id,
    );
    assert.equal(remaining.journal, null);
    assert.equal(remaining.people, null);
    assert.equal(remaining.invite, null);
    assert.equal(remaining.session, null);
    assert.ok(remaining.receipt);
    await page.reload();
    await page
      .getByRole("button", { name: "Check deletion status", exact: true })
      .click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, 1);
    assert.equal(proofCount, 1);
    assert.ok(statusCount >= 3);
    // Fresh synthetic account session: OTP plus a failed local journal cleanup.
    accepted = null;
    await page.evaluate(
      ({ session, user }) => {
        sessionStorage.clear();
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem(`resbite.create-journal.v1.${user.id}`, "retry-journal");
      },
      { session, user },
    );
    await page.reload();
    // The code step is the default: no switch needed.
    await page
      .getByRole("button", { name: "Send verification code", exact: true })
      .click();
    await expect(
      page.getByText("Check your email for the verification code.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(otpCount, 1);
    await page
      .getByLabel("Email verification code", { exact: true })
      .fill("123456");
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await page.evaluate(() => {
      const original = Storage.prototype.removeItem;
      let fail = true;
      Storage.prototype.removeItem = function (key) {
        if (fail && key.startsWith("resbite.create-journal.v1.")) {
          fail = false;
          throw Error(
            "Fixture cleanup locked. Check deletion status to retry.",
          );
        }
        return original.call(this, key);
      };
    });
    await page
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    await expect(
      page.getByText(
        "Fixture cleanup locked. Check deletion status to retry.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Check deletion status", exact: true })
      .click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, 2);
    assert.equal(proofCount, 2);
    assert.equal(
      await page.evaluate(
        (id) => sessionStorage.getItem(`resbite.create-journal.v1.${id}`),
        user.id,
      ),
      null,
    );
    // GI2-D10: an Apple-only account confirms by signing in with Apple again. Web has no Sign in
    // with Apple, so Apple's native module is stubbed at Expo's module boundary (on web,
    // expo-modules-core reads native modules from ExpoDomWebView.expoModulesProxy): the app's own appleSignInDeps,
    // nonce and id-token call run as on the phone, and the id-token endpoint is intercepted above.
    const jwt = (claims) =>
      [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({ role: "authenticated", exp: expires_at, ...claims })).toString("base64url"),
        "local-fixture-only",
      ].join(".");
    const appleUser = {
      ...user,
      id: "22222222-2222-4222-8222-222222222222",
      email: "fixture-apple@example.invalid",
      app_metadata: { provider: "apple", providers: ["apple"] },
    };
    const appleToken = jwt({ sub: appleUser.id });
    const appleSession = { ...session, access_token: appleToken, user: appleUser };
    const appleProofFor = (account) => ({
      ...appleSession,
      access_token: jwt({
        sub: account.id,
        amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) }],
        app_metadata: account.app_metadata,
      }),
      refresh_token: "fixture-apple-proof",
      user: account,
    });
    accepted = null;
    current = appleUser;
    expectedAuthorization = appleToken;
    await page.addInitScript(() => {
      globalThis.__appleSheet = { result: "cancel", nonces: [] };
      globalThis.ExpoDomWebView = {
        expoModulesProxy: {
          ExpoAppleAuthentication: {
            isAvailableAsync: async () => true,
            addListener() {},
            removeListeners: async () => {},
            requestAsync: async (options) => {
              const sheet = globalThis.__appleSheet;
              sheet.nonces.push(options.nonce);
              if (sheet.result === "cancel")
                throw Object.assign(new Error("Fixture: sheet closed"), {
                  code: "ERR_REQUEST_CANCELED",
                });
              return {
                user: "fixture-apple-user",
                identityToken: "fixture-apple-identity-token",
                authorizationCode: "fixture-apple-code",
                fullName: null,
                email: null,
                realUserStatus: 1,
                state: null,
              };
            },
          },
        },
      };
    });
    await page.evaluate(
      ({ session, user }) => {
        sessionStorage.clear();
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
      },
      { session: appleSession, user: appleUser },
    );
    await page.goto(`${base}/delete-account`);
    const appleButton = page.getByRole("button", {
      name: "Continue with Apple",
      exact: true,
    });
    await expect(
      page.getByText("To confirm it’s you, sign in with Apple again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(appleUser.email, { exact: true })).toBeVisible();
    await expect(appleButton).toBeVisible();
    await expect(appleButton).toBeDisabled();
    for (const name of [
      "Permanently delete account",
      "Send verification code",
      "Use an email code instead",
      "Use my password instead",
    ])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await expect(appleButton).toBeEnabled();
    const sheetNonces = () => page.evaluate(() => globalThis.__appleSheet.nonces);
    const appSession = () =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("sb-ewcsgvhuojxdpaspwsrx-auth-token")),
      );
    const before = { proofCount, requestCount };
    // A closed sheet: nothing is requested and nothing is said.
    await appleButton.click();
    await expect.poll(async () => (await sheetNonces()).length).toBe(1);
    await expect(appleButton).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    assert.deepEqual({ proofCount, requestCount }, before);
    // A different Apple ID is refused, and the app stays signed in as the same account.
    appleProof = appleProofFor({
      ...appleUser,
      id: "33333333-3333-4333-8333-333333333333",
    });
    await page.evaluate(() => (globalThis.__appleSheet.result = "ok"));
    await appleButton.click();
    await expect(
      page.getByText("Reauthentication returned a different account.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(requestCount, before.requestCount);
    assert.equal((await appSession()).access_token, appleToken);
    // Apple's sign-in for this account: its fresh session is the proof; the app's own session
    // stays the Authorization, then cleanup signs out as for a password or a code.
    appleProof = appleProofFor(appleUser);
    expectedProof = appleProof.access_token;
    await appleButton.click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, before.requestCount + 1);
    assert.equal(proofCount, before.proofCount + 2);
    const nonces = await sheetNonces();
    assert.equal(nonces.length, 3);
    assert.equal(appleNonces.length, 2);
    // Apple's sheet gets the SHA-256 of the one-use nonce Supabase receives.
    assert.equal(
      nonces[2],
      createHash("sha256").update(appleNonces[1]).digest("hex"),
    );
    assert.equal(await appSession(), null);
    assert.ok(
      await page.evaluate(
        (id) => sessionStorage.getItem(`resbite.deletion.${id}`),
        appleUser.id,
      ),
    );
  }
  assert.deepEqual(errors, []);
  // Blocked people, signed in (G-S10).
  {
    const f = await signedIn({ blocks: [blockRow(LEO, "Leo"), blockRow(MIA, null), blockRow(SOL, "\u200FAna\u200B")] }),
      { page } = f;
    await openBlocked(page);
    for (const name of ["Leo", "Someone", "Ana"]) {
      await expect(shown(page, name)).toBeVisible();
      // The button reads Unblock beside the name, and is named for the person.
      await expect(button(page, `Unblock ${name}`)).toBeVisible();
      await expect(button(page, `Unblock ${name}`)).toHaveText("Unblock");
    }
    // The marks are gone from what is drawn and what is spoken.
    await expect(page.getByText(/\u200F|\u200B/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /\u200F|\u200B/ })).toHaveCount(0);
    await expect(page.getByText(NONE_BLOCKED, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: join(tmpdir(), "resbite-blocked-people.png"), fullPage: true });
    const focused = () => page.evaluate(() => document.activeElement?.textContent ?? null);
    const said = (words) => page.locator('[aria-live="polite"]').filter({ hasText: words });
    await button(page, "Unblock Leo").click();
    await expect(shown(page, "Leo")).toHaveCount(0);
    await expect(button(page, "Unblock Leo")).toHaveCount(0);
    assert.deepEqual(f.calls("block_user"), [{ p_user: LEO, p_block: false }]);
    assert.equal(f.calls("my_blocks").length, 1, "the row goes without a second read");
    await expect(shown(page, "Someone")).toBeVisible();
    await expect(shown(page, "Ana")).toBeVisible();
    // Said, and focus on the row that took its place.
    await expect(said("Unblocked Leo.")).toBeVisible();
    await expect.poll(focused).toBe("Someone");
    await button(page, "Unblock Someone").click();
    await expect(button(page, "Unblock Someone")).toHaveCount(0);
    await expect(said("Unblocked Someone.")).toBeVisible();
    await expect(said("Unblocked Leo.")).toHaveCount(0);
    await expect.poll(focused).toBe("Ana");
    await button(page, "Unblock Ana").click();
    await expect(page.getByText(NONE_BLOCKED, { exact: true })).toBeVisible();
    await expect(said("Unblocked Ana.")).toBeVisible();
    await expect.poll(focused).toBe(NONE_BLOCKED);
    assert.deepEqual(f.calls("block_user"), [
      { p_user: LEO, p_block: false },
      { p_user: MIA, p_block: false },
      { p_user: SOL, p_block: false },
    ]);
    await button(page, "Privacy").click();
    await expect(heading(page, "Privacy")).toBeVisible();
    await f.done();
    pass("blocked: Leo, Someone and Ana listed; each Unblock sends block_user { p_user, p_block: false }, its row goes, Unblocked <name>. is said and focus moves on; then nobody");
  }
  {
    const f = await signedIn({ blocks: [] }),
      { page } = f;
    await openBlocked(page);
    await expect(page.getByText(NONE_BLOCKED, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Unblock / })).toHaveCount(0);
    await f.done();
    pass("blocked: nobody blocked says so");
  }
  {
    const f = await signedIn({ blocks: [blockRow(LEO, "Leo")], failReads: 1 }),
      { page } = f;
    await openBlocked(page);
    await expect(page.getByRole("alert").filter({ hasText: OFFLINE })).toBeVisible();
    await expect(button(page, "Try again")).toBeVisible();
    await expect(page.getByText(NONE_BLOCKED, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Leo", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Unblock / })).toHaveCount(0);
    await button(page, "Try again").click();
    await expect(shown(page, "Leo")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(button(page, "Try again")).toHaveCount(0);
    assert.equal(f.calls("my_blocks").length, 2);
    await f.done();
    pass("blocked: a failed read shows the error line with Try again and names nobody; Try again lists Leo");
  }
  {
    const f = await signedIn({ blocks: [blockRow(LEO, "Leo"), blockRow(MIA, "Mia")], failUnblocks: 1 }),
      { page } = f;
    await openBlocked(page);
    await button(page, "Unblock Leo").click();
    await expect(page.getByRole("alert").filter({ hasText: OFFLINE })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(1);
    await expect(shown(page, "Leo")).toBeVisible();
    await expect(button(page, "Unblock Leo")).toBeEnabled();
    // The line sits with Leo's row, before Mia's.
    const order = await page.evaluate(
      ([alert, mia]) => {
        const a = document.querySelector('[role="alert"]');
        const m = [...document.querySelectorAll('[role="button"]')].find((el) => el.getAttribute("aria-label") === mia);
        const leo = [...document.querySelectorAll('[role="button"]')].find((el) => el.getAttribute("aria-label") === alert);
        return Boolean(a && m && leo && leo.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING && a.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      ["Unblock Leo", "Unblock Mia"],
    );
    assert.ok(order, "the error follows Leo's Unblock and comes before Mia's row");
    await button(page, "Unblock Leo").click();
    await expect(button(page, "Unblock Leo")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    assert.deepEqual(f.calls("block_user"), [
      { p_user: LEO, p_block: false },
      { p_user: LEO, p_block: false },
    ]);
    await f.done();
    pass("blocked: a failed unblock keeps the row and says why beside it; the next one goes through");
  }
  {
    const f = await signedIn({ blocks: [blockRow(LEO, "Leo")] }),
      { page } = f;
    await openBlocked(page);
    await expect(shown(page, "Leo")).toBeVisible();
    // A refresh starts (the app comes back to the foreground) and its answer, read before the unblock, is held.
    f.state.holdReads = true;
    await foreground(page);
    await expect.poll(() => f.state.parked.length).toBe(1);
    await button(page, "Unblock Leo").click();
    await expect(page.getByText(NONE_BLOCKED, { exact: true })).toBeVisible();
    f.state.holdReads = false;
    await f.release();
    await page.waitForTimeout(300);
    await expect(page.getByText("Leo", { exact: true })).toHaveCount(0);
    await expect(page.getByText(NONE_BLOCKED, { exact: true })).toBeVisible();
    await f.done();
    pass("blocked: a refresh still running when Unblock goes never brings the row back");
  }
  // my_blocks names a person by the first word of their name, so a long name is one long word (ruling SR4).
  for (const [width, large] of [
    [390, false],
    [320, false],
    [320, true],
  ]) {
    const word = "W".repeat(18),
      longer = "W".repeat(40),
      at = `${width} px${large ? " under Larger Text" : ""}`;
    const f = await signedIn({ blocks: [blockRow(LEO, word), blockRow(MIA, "Christopher"), blockRow(SOL, longer)], width, failUnblocks: 1 }),
      { page } = f;
    await openBlocked(page, large ? "?largeText=1" : "");
    if (large) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await expect(shown(page, word)).toBeVisible();
    // With a failed unblock's line in the card too.
    await button(page, `Unblock ${word}`).click();
    await expect(page.getByRole("alert").filter({ hasText: OFFLINE })).toBeVisible();
    const problems = await page.evaluate((names) => {
      const out = [];
      // The card's edges are the page's 20 px gutter.
      const left = 20,
        right = window.innerWidth - 20;
      if (document.documentElement.scrollWidth > window.innerWidth) out.push("the page scrolls sideways");
      const within = (el, what) => {
        const b = el.getBoundingClientRect();
        if (b.left < left - 1 || b.right > right + 1) out.push(`${what} spans ${Math.round(b.left)}–${Math.round(b.right)}, outside ${left}–${right}`);
        return b;
      };
      for (const el of document.querySelectorAll('[role="button"][aria-label^="Unblock "]')) within(el, el.getAttribute("aria-label"));
      for (const el of document.querySelectorAll('[role="alert"]')) within(el, "the error line");
      for (const name of names) {
        const el = [...document.querySelectorAll("div")].find((d) => d.textContent === name && !d.closest('[role="button"]'));
        if (!el) {
          out.push(`${name.slice(0, 12)}… is not drawn`);
          continue;
        }
        const b = within(el, `${name.slice(0, 12)}…`);
        if (el.scrollWidth > el.clientWidth + 1) out.push(`${name.slice(0, 12)}… overflows its own box`);
        if (b.width < 0.4 * (right - left)) out.push(`${name.slice(0, 12)}… is squeezed to ${Math.round(b.width)} px`);
      }
      return out;
    }, [word, "Christopher", longer]);
    assert.deepEqual(problems, [], `the names wrap inside the card at ${at}`);
    if (!large) {
      // An ordinary name isn't broken: one line.
      const box = await shown(page, "Christopher").boundingBox();
      assert.ok(box.height <= 33, `Christopher stays on one line at ${at} (${box.height} px)`);
    }
    for (const name of [word, "Christopher", longer]) {
      const box = await button(page, `Unblock ${name}`).boundingBox();
      assert.ok(box.height >= 44, `Unblock ${name.slice(0, 12)}… is at least 44 pt tall at ${at}`);
      await expect(button(page, `Unblock ${name}`)).toHaveText("Unblock");
    }
    await page.screenshot({ path: join(tmpdir(), `resbite-blocked-people-long-${width}${large ? "-large" : ""}.png`), fullPage: true });
    await f.done();
    pass(`blocked: an 18- and a 40-letter single-word name wrap inside the card at ${at}, Christopher stays whole, each Unblock at least 44 pt`);
  }
  console.log(
    `Deletion UI passed: preview/disabled no outbound calls${enabled ? ", enabled synthetic password/OTP (an email account opens on the code, the password one switch away), lost reply, local cleanup failure/retry including drafts, restart receipt recovery, Apple-only account confirms with Apple (closed sheet quiet, different Apple ID refused with the app session unchanged, isolated proof)" : ""}. No real account, email or deletion request.`,
  );
} finally {
  await browser.close();
}
