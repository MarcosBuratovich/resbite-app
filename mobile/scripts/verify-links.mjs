// The event's one link opened in the app (GI1's /r/<code>, which the native router turns into /invite?code=<code>:
// routeSystemLink, unit-tested in appLinks.test.ts); this drives that screen on the web build. Open-link approval
// (plan 3) changed what it does: an answer through the link is a request the host approves, so nobody joins by
// opening it (verify-open-link-app covers the waiting screen, the answer, the tick and My resbites in depth).
//  - Signed in: request_to_join ("pending"). A new person lands on /waiting?plan=, a guest ("already") or the
//    organizer ("owner") on the event page. The kept code is cleared. A link turned off, started or cancelled
//    says so and drops the kept code, so a restart opens the app as usual; a lost connection keeps it;
//    "Go to My resbites" leaves either. A malformed code sends nothing. A per-person link (before GI1) that is
//    refused, or is the organizer's own, is dropped the same way.
//  - Signed out: the invitation's card (invitation_page) with Sign up to reply and I have an account; a card that
//    can't be read offers Retry; a cancelled, past or turned-off link says so with Go to Resbite and drops the
//    kept code. No tick, providers or email on this screen (GI2's email-code guest account is retired).
//  - Waiting for access (the beta hasn't approved the account yet): a kept code goes through /account to the
//    invite screen, which sends the request with the account's name once the phone and name are there; the
//    request opens on /waiting?plan= and is listed on the waiting-for-access screen. A refusal or a lost
//    connection is handled as the server says.
// Every Supabase request is intercepted.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, heading, quietReminders } from "./qa-helpers.mjs";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "447700900834",
  phone_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};
const expiry = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
  "local-fixture-only",
].join(".");
const session = {
  access_token: token,
  refresh_token: "local-fixture",
  token_type: "bearer",
  expires_at: expiry,
  expires_in: 3600,
  user,
};
const invited = {
  id: "22222222-2222-4222-8222-222222222222",
  activity_id: "coffee-together",
  title: "Film club",
  description: "",
  categories: ["community"],
  owner_id: "33333333-3333-4333-8333-333333333333",
  starts_at: "2099-03-01T19:30:00Z",
  time_zone: "UTC",
  place_label: "12 Old Street",
  area: "Near Old Street",
  note: "",
  status: "active",
  version: 1,
};
const own = { ...invited, id: "44444444-4444-4444-8444-444444444444", title: "Book swap", owner_id: user.id };
const OPEN = "OpenOpenOpenOpenOpen_1";
const OWN = "OwnOwnOwnOwnOwnOwn-__2";
const OFF = "OffOffOffOffOffOffOff3";
const NET = "NetNetNetNetNetNetNet4";
// Per-person links from before GI1: one turned off (42501), one the organizer's own (22023).
const REVOKED_TOKEN = "c".repeat(64);
const OWN_TOKEN = "d".repeat(64);
const pending = (page) => page.evaluate(() => sessionStorage.getItem("resbite.pending-invite"));
const terms = (page) => page.evaluate(() => sessionStorage.getItem("resbite.pending-terms"));
// Signed-out and waiting-for-access links: GUEST is open, DEAD/CANCELLED/HAPPENED read as closed, CARDFAIL's card
// can't be read the first time, GONE is refused for good, FLAKY loses the connection on the first request only.
const GUEST = "GuestGuestGuestGuest_5";
const GONE = "GoneGoneGoneGoneGone_7";
const DEAD = "DeadDeadDeadDeadDead_8";
const FLAKY = "FlakyFlakyFlakyFlaky_9";
const CANCELLED = "CancelledCancelledCa_a";
const HAPPENED = "HappenedHappenedHapp_b";
const CARDFAIL = "CardFailCardFailCard_c";
// A person already in (state "already"), who lands on the event.
const ALREADY = "AlreadyAlreadyAlread_d";
const filmNight = { ...invited, id: "55555555-5555-4555-8555-555555555555", title: "Film night" };
const sessionFor = (account) => ({ ...session, user: account });

async function fixture({ signedIn = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await quietReminders(page);
  if (signedIn)
    await page.addInitScript(
      (session) => sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session)),
      session,
    );
  const claims = [];
  let requested = false;
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return signedIn ? reply(user) : reply({ message: "No session" }, 401);
    if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: url.searchParams.get("id") === `eq.${invited.owner_id}` ? "Stephen" : "Fixture", avatar_path: null, avatar_revision: 0 });
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/plans") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const rows = [invited, own].filter((p) => !id || p.id === id);
      return reply(one ? (rows[0] ?? null) : rows);
    }
    if (path === "/rest/v1/attendees") {
      if (one) return reply({ version: 1, response: "pending" });
      return reply([{ user_id: user.id, plan_id: invited.id, response: "pending", profiles: { display_name: "Fixture" } }]);
    }
    if (path === "/rest/v1/rpc/request_to_join") {
      const body = req.postDataJSON();
      claims.push(body);
      // The code is kept on the device while it is sent.
      assert.equal(await pending(page), body.p_code);
      if (body.p_code === OPEN) {
        requested = true;
        return reply({ state: "waiting", plan_id: invited.id, response: "pending" });
      }
      if (body.p_code === ALREADY) return reply({ state: "already", plan_id: invited.id, response: "accepted" });
      if (body.p_code === OWN) return reply({ state: "owner", plan_id: own.id, response: "accepted" });
      if (body.p_code === NET) return reply({ message: "Fixture: connection lost" }, 500);
      return reply({ code: "42501", message: "Invitation unavailable" }, 403);
    }
    if (path === "/rest/v1/rpc/my_join_requests")
      return reply(
        requested
          ? [{ plan_id: invited.id, title: "Film club", starts_at: invited.starts_at, ends_at: null, time_zone: "UTC", host: "Stephen", area: "Near Old Street", image: { kind: "mark", ref: null }, response: "pending", status: "waiting" }]
          : [],
      );
    if (path === "/rest/v1/rpc/claim_invite") {
      const body = req.postDataJSON();
      claims.push(body);
      assert.equal(await pending(page), body.p_token);
      if (body.p_token === OWN_TOKEN) return reply({ code: "22023", message: "Owner cannot claim own invitation" }, 400);
      return reply({ code: "42501", message: "Invitation unavailable" }, 403);
    }
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });
  return { page, errors, claims };
}

/**
 * A person without a signed-in approved account: signed out unless `signedIn` (then an account the beta hasn't
 * approved, waiting for access), optionally with a kept code. request_to_join answers by code; the account never
 * becomes approved here (the host's approval is what grants access).
 */
async function guestFixture({ metadata = {}, signedIn = false, kept = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await quietReminders(page);
  // The guest keeps the fixture's confirmed phone: without one, Add your number (verify-phone) comes before any request.
  const guest = {
    ...user,
    id: "66666666-6666-4666-8666-666666666666",
    email: "guest@example.invalid",
    user_metadata: metadata,
  };
  const opens = [],
    joins = [];
  let requested = false,
    cardReads = 0;
  await page.addInitScript(
    ({ session, kept }) => {
      if (sessionStorage.getItem("fixture-seeded")) return;
      sessionStorage.setItem("fixture-seeded", "1");
      if (session) sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session));
      if (kept) sessionStorage.setItem("resbite.pending-invite", kept);
    },
    { session: signedIn ? sessionFor(guest) : null, kept },
  );
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/rest/v1/rpc/invitation_page") {
      const { p_code } = req.postDataJSON();
      cardReads++;
      if (p_code === DEAD) return reply({ state: "inactive" });
      if (p_code === CANCELLED) return reply({ state: "cancelled", host: "Stephen" });
      if (p_code === HAPPENED) return reply({ state: "happened" });
      if (p_code === CARDFAIL && cardReads === 1) return reply({ message: "Fixture: connection lost" }, 500);
      return reply({ state: "open", host: "Stephen", title: "Film night", starts_at: "2099-10-23T18:30:00Z", time_zone: "Europe/London", area: "Near Old Street", image: { kind: "mark", ref: null } });
    }
    if (path === "/rest/v1/rpc/note_link_open") {
      opens.push(req.postDataJSON().p_code);
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/auth/v1/user") return signedIn ? reply(guest) : reply({ message: "No session" }, 401);
    if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: guest.id, status: "access_pending" });
    if (path === "/rest/v1/rpc/request_to_join") {
      const body = req.postDataJSON();
      joins.push(body);
      // The code is still kept on the device while the request runs.
      assert.equal(await pending(page), body.p_code);
      if (body.p_code === GONE) return reply({ code: "42501", message: "Invitation unavailable" }, 403);
      if (body.p_code === FLAKY && joins.length === 1) return reply({ message: "Fixture: connection lost" }, 503);
      requested = true;
      return reply({ state: "waiting", plan_id: filmNight.id, response: "pending" });
    }
    if (path === "/rest/v1/rpc/my_join_requests")
      return reply(
        requested
          ? [{ plan_id: filmNight.id, title: "Film night", starts_at: filmNight.starts_at, ends_at: null, time_zone: "UTC", host: "Stephen", area: "Near Old Street", image: { kind: "mark", ref: null }, response: "pending", status: "waiting" }]
          : [],
      );
    // The account has no profile and no plans: it waits for access.
    if (path === "/rest/v1/profiles") return reply(one ? null : []);
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/plans") return reply(one ? null : []);
    if (path === "/rest/v1/attendees") return reply(one ? null : []);
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });
  return { page, errors, opens, joins };
}

const refusedLink = "This link isn’t open to you right now.";
const lostConnection = "Check your connection and try again.";

try {
  {
    const { page, errors, claims } = await fixture();
    // Signed in: the event link is a request. A new person lands on their waiting screen, and the kept code is cleared.
    await page.goto(`${base}/invite?code=${OPEN}`);
    await expect(page.getByRole("heading", { name: "Waiting for Stephen", exact: true })).toBeVisible();
    await expect(page.getByText("Film club", { exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/waiting");
    assert.equal(new URL(page.url()).searchParams.get("plan"), invited.id);
    assert.deepEqual(claims, [{ p_code: OPEN, p_name: null, p_response: "pending", p_terms_version: null }]);
    await expect.poll(() => pending(page)).toBe(null);
    // Someone already in lands on the event page, answering as before.
    await page.goto(`${base}/invite?code=${ALREADY}`);
    await expect(page.getByRole("heading", { name: "Film club", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/event");
    await expect.poll(() => pending(page)).toBe(null);
    // The organizer opening their own event's link lands on their event.
    await page.goto(`${base}/invite?code=${OWN}`);
    await expect(page.getByRole("heading", { name: "Book swap", exact: true })).toBeVisible();
    await expect(page.getByText("Hosting", { exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    // An inactive, started or cancelled event's link says so, and the kept code is dropped.
    const inactive = page.getByText(
      "This invitation is no longer active, or the event has started or was cancelled.",
      { exact: true },
    );
    const refused = page.getByText(refusedLink, { exact: true });
    await page.goto(`${base}/invite?code=${OFF}`);
    await expect(refused).toBeVisible();
    await expect(page.getByRole("heading", { name: "You’re invited.", exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    // So a cold start opens the app as usual, not this error.
    await page.goto(base);
    await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/create");
    await expect(refused).toHaveCount(0);
    // "Go to My resbites" leaves the error.
    await page.goto(`${base}/invite?code=${OFF}`);
    await expect(refused).toBeVisible();
    await page.getByRole("button", { name: "Go to My resbites", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My resbites", exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/plans");
    // A lost connection keeps the code for a retry, and a cold start comes back to it; leaving drops it.
    await page.goto(`${base}/invite?code=${NET}`);
    await expect(page.getByText(lostConnection, { exact: true })).toBeVisible();
    assert.equal(await pending(page), NET);
    await page.goto(base);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/invite");
    assert.equal(new URL(page.url()).searchParams.get("code"), NET);
    await page.getByRole("button", { name: "Go to My resbites", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My resbites", exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    // The same for a refused per-person link: it says so, is dropped, and a cold start opens Create.
    await page.goto(`${base}/invite?token=${REVOKED_TOKEN}`);
    await expect(inactive).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    await page.goto(base);
    await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/create");
    // The organizer's own per-person link says whose it is, and is dropped too.
    await page.goto(`${base}/invite?token=${OWN_TOKEN}`);
    await expect(page.getByText("You organize this resbite. Open it from My resbites.", { exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    assert.deepEqual(
      claims.filter((c) => c.p_token).map((c) => c.p_token),
      [REVOKED_TOKEN, OWN_TOKEN],
    );
    // A malformed code sends nothing and leaves a kept invitation alone.
    const before = claims.length;
    await page.evaluate((code) => sessionStorage.setItem("resbite.pending-invite", code), OPEN);
    await page.goto(`${base}/invite?code=short`);
    await expect(page.getByText("This invitation link is incomplete.", { exact: true })).toBeVisible();
    assert.equal(claims.length, before);
    assert.equal(await pending(page), OPEN);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      "PASS: signed in, an event link sends request_to_join and lands a new person on /waiting?plan= (code cleared), a guest on the event page, the organizer on their event; a link turned off says so and drops the code (a cold start opens Create); a lost connection keeps it (a cold start returns to it); Go to My resbites leaves and drops it; a refused or own per-person link is dropped too; a malformed one sends nothing.",
    );
  }
  {
    const { page, errors, opens, joins } = await guestFixture();
    // Signed out: the invitation's card, then Sign up to reply or I have an account. No tick, providers or email.
    await page.goto(`${base}/invite?code=${GUEST}`);
    await expect(heading(page, "You’re invited.")).toBeVisible();
    await expect(page.getByText("Stephen invited you", { exact: true })).toBeVisible();
    await expect(page.getByText("Film night", { exact: true })).toBeVisible();
    await expect(page.getByText("Near Old Street", { exact: true })).toBeVisible();
    await expect(page.getByText("We’ll keep this invitation ready while you finish setting up.", { exact: true })).toBeVisible();
    await expect(button(page, "Sign up to reply")).toBeVisible();
    await expect(button(page, "I have an account")).toBeVisible();
    for (const gone of ["Continue with Google", "Continue with Apple", "Continue with email", "Send code", "Continue"])
      await expect(page.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByText("Resbite is for people aged 18 and over.", { exact: true })).toHaveCount(0);
    // The code is kept on the device for after the sign-in; the open was counted once; nothing is requested yet.
    await expect.poll(() => pending(page)).toBe(GUEST);
    assert.deepEqual(opens, [GUEST]);
    assert.deepEqual(joins, []);
    // Sign up to reply goes to the phone sign-up; the code stays kept.
    await button(page, "Sign up to reply").click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/auth/phone");
    assert.equal(await pending(page), GUEST);
    assert.deepEqual(opens, [GUEST]);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: signed out, an event link shows the invitation's card (host, title, area) with Sign up to reply and I have an account, no tick, providers or email; the code is kept, one open is counted, nothing is requested; Sign up to reply opens the phone sign-up.");
  }
  {
    const { page, errors, opens } = await guestFixture();
    // A card that can't be read says so with Retry, which reads it again.
    await page.goto(`${base}/invite?code=${CARDFAIL}`);
    await expect(page.getByText("Check your connection and try again.", { exact: true })).toBeVisible();
    await expect(heading(page, "You’re invited.")).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("Film night", { exact: true })).toBeVisible();
    await expect(button(page, "Sign up to reply")).toBeVisible();
    assert.deepEqual(opens, [CARDFAIL]);
    await expect.poll(() => pending(page)).toBe(CARDFAIL);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: signed out, an unreadable card shows the connection copy with Retry, which reads it again; the code stays kept.");
  }
  for (const [code, sentence] of [
    [DEAD, "This invitation is no longer active."],
    [CANCELLED, "Stephen cancelled this resbite."],
    [HAPPENED, "This resbite has already happened."],
  ]) {
    const { page, errors, opens, joins } = await guestFixture();
    // Signed out, a dead link says so with Go to Resbite, offers no sign-up and drops the kept code.
    await page.goto(`${base}/invite?code=${code}`);
    await expect(heading(page, sentence)).toBeVisible();
    await expect(button(page, "Sign up to reply")).toHaveCount(0);
    await expect(button(page, "I have an account")).toHaveCount(0);
    assert.deepEqual(opens, [code]);
    await expect.poll(() => pending(page)).toBe(null);
    await button(page, "Go to Resbite").click();
    await expect(heading(page, "Get together")).toBeVisible();
    assert.deepEqual(joins, []);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("PASS: signed out, an inactive, cancelled or past link says so with Go to Resbite, offers no sign-up and drops the kept code.");
  {
    const { page, errors, joins } = await guestFixture({ metadata: { full_name: "Guest Two" }, signedIn: true, kept: GUEST });
    // Waiting for access with a kept code: a cold start goes through /account to the invite screen, which sends the
    // request with the account's name (the beta's approval is not what lets them in), and opens the waiting screen.
    await page.goto(base);
    await expect(heading(page, "Waiting for Stephen")).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/waiting");
    assert.equal(new URL(page.url()).searchParams.get("plan"), filmNight.id);
    assert.deepEqual(joins, [{ p_code: GUEST, p_name: "Guest Two", p_response: "pending", p_terms_version: null }]);
    await expect(page.getByText("Film night", { exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    // Done leaves for the waiting-for-access screen, which lists the request.
    await button(page, "Done").click();
    await expect(heading(page, "Waiting for access")).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/account");
    await expect(heading(page, "Invitations")).toBeVisible();
    await expect(page.getByText("Waiting for Stephen", { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    assert.equal(new URL(page.url()).pathname, "/account", "no redirect back");
    assert.equal(joins.length, 1);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: waiting for access with a kept code, a cold start sends request_to_join with the account's name, lands on /waiting?plan= and clears the code; Done leaves for Waiting for access, which lists the request.");
  }
  {
    const { page, errors, joins } = await guestFixture({ metadata: { full_name: "Guest Four" }, signedIn: true, kept: GONE });
    // A link that is no longer available says so and drops the kept code, so a cold start opens as usual.
    await page.goto(base);
    await expect(page.getByText(refusedLink, { exact: true })).toBeVisible();
    await expect(button(page, "Go to Resbite")).toBeVisible();
    assert.deepEqual(joins.map((j) => j.p_code), [GONE]);
    await expect.poll(() => pending(page)).toBe(null);
    await page.goto(base);
    await expect(heading(page, "Waiting for access")).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/account");
    await expect(page.getByText("If someone invited you to a resbite, open their link again.", { exact: true })).toBeVisible();
    await expect(heading(page, "Invitations")).toHaveCount(0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: waiting for access, a refused link says so with Go to Resbite and drops the kept code; a cold start lands on Waiting for access.");
  }
  {
    const { page, errors, joins } = await guestFixture({ metadata: { full_name: "Guest Five" }, signedIn: true, kept: FLAKY });
    // A lost connection says so, keeps the code and offers Refresh invitation, which sends the request again.
    await page.goto(base);
    await expect(page.getByText(lostConnection, { exact: true })).toBeVisible();
    assert.equal(await pending(page), FLAKY);
    await button(page, "Refresh invitation").click();
    await expect(heading(page, "Waiting for Stephen")).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("plan"), filmNight.id);
    assert.deepEqual(joins.map((j) => j.p_name), ["Guest Five", "Guest Five"]);
    await expect.poll(() => pending(page)).toBe(null);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: waiting for access, a lost connection shows the connection copy and keeps the code; Refresh invitation sends the request again and lands on /waiting.");
  }
} finally {
  await browser.close();
}
