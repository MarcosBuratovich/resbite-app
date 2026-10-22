// GI1: opening the event's one link (/r/<code>). The native router turns it into /invite?code=<code>
// (routeSystemLink, unit-tested in appLinks.test.ts); this drives that screen on the web build. Signed in and
// approved: claim_plan_link, then the event page, and the kept code is cleared. The organizer's own link lands
// on their event. An inactive code says so and drops the kept code, so a restart opens the app as usual; a lost
// connection keeps it; "Go to My resbites" leaves either. A malformed code claims nothing. A per-person link
// (before GI1) that is refused, or is the organizer's own, is dropped the same way.
// GI2: signed out, the link is the guest's account screen: the invitation's card (invitation_page), the 18+ tick
// before the providers (web has no Apple), the email code, the Name step when the account has no name, then
// join_by_link and the event page. A cold start with a kept code and a session but no kept tick asks for the tick
// again; a refused tick or a dead invitation are handled as the server says. Every Supabase request is intercepted.
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
// GI2 guest links: GUEST joins, AGE is refused for a missing tick, GONE is refused as unavailable (the page still
// read it as open), DEAD reads as inactive, FLAKY loses the connection on the first join only.
const GUEST = "GuestGuestGuestGuest_5";
const AGE = "AgeAgeAgeAgeAgeAgeAge6";
const GONE = "GoneGoneGoneGoneGone_7";
const DEAD = "DeadDeadDeadDeadDead_8";
const FLAKY = "FlakyFlakyFlakyFlaky_9";
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
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return signedIn ? reply(user) : reply({ message: "No session" }, 401);
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
    if (path === "/rest/v1/rpc/claim_plan_link") {
      const body = req.postDataJSON();
      claims.push(body);
      // The code is kept on the device while it is claimed.
      assert.equal(await pending(page), body.p_code);
      if (body.p_code === OPEN) return reply(invited.id);
      if (body.p_code === OWN) return reply(own.id);
      if (body.p_code === NET) return reply({ message: "Fixture: connection lost" }, 500);
      return reply({ code: "42501", message: "Invitation unavailable" }, 403);
    }
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
 * A person without access: signed out unless `signedIn`, optionally with a kept code and a kept tick. The account
 * is access_pending until join_by_link succeeds; the email code 123456 signs in.
 */
async function guestFixture({ metadata = {}, signedIn = false, kept = null, tick = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await quietReminders(page);
  let guest = {
    ...user,
    id: "66666666-6666-4666-8666-666666666666",
    email: "guest@example.invalid",
    user_metadata: metadata,
  };
  let signed = signedIn,
    joined = false,
    profile = null;
  const opens = [],
    otps = [],
    joins = [],
    details = [];
  await page.addInitScript(
    ({ session, kept, tick }) => {
      if (sessionStorage.getItem("fixture-seeded")) return;
      sessionStorage.setItem("fixture-seeded", "1");
      if (session) sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session));
      if (kept) sessionStorage.setItem("resbite.pending-invite", kept);
      if (tick) sessionStorage.setItem("resbite.pending-terms", tick);
    },
    { session: signedIn ? sessionFor(guest) : null, kept, tick },
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
      if (p_code === DEAD) return reply({ state: "inactive" });
      return reply({ state: "open", host: "Stephen", title: "Film night", starts_at: "2099-10-23T18:30:00Z", time_zone: "Europe/London" });
    }
    if (path === "/rest/v1/rpc/note_link_open") {
      opens.push(req.postDataJSON().p_code);
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/auth/v1/otp") {
      otps.push(req.postDataJSON().email);
      return reply({});
    }
    if (path === "/auth/v1/verify") {
      if (req.postDataJSON().token !== "123456")
        return reply({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }, 403);
      signed = true;
      return reply(sessionFor(guest));
    }
    if (path === "/auth/v1/user") return signed ? reply(guest) : reply({ message: "No session" }, 401);
    if (path === "/rest/v1/rpc/account_access_status")
      return reply({ account_id: guest.id, status: joined ? "approved" : "access_pending" });
    if (path === "/rest/v1/rpc/join_by_link") {
      const body = req.postDataJSON();
      joins.push(body);
      // The code is still kept on the device while the join runs.
      assert.equal(await pending(page), body.p_code);
      if (body.p_code === AGE) return reply({ code: "22023", message: "Age confirmation required" }, 400);
      if (body.p_code === GONE) return reply({ code: "42501", message: "Invitation unavailable" }, 403);
      if (body.p_code === FLAKY && joins.length === 1) return reply({ message: "Fixture: connection lost" }, 503);
      joined = true;
      profile = { id: guest.id, display_name: body.p_name, avatar_path: null, avatar_revision: 0 };
      return reply(filmNight.id);
    }
    if (path === "/rest/v1/rpc/save_registration_details") {
      const { p_details } = req.postDataJSON();
      details.push(p_details);
      guest = {
        ...guest,
        user_metadata: { ...guest.user_metadata, registration_details: p_details, registration_details_version: 1 },
      };
      return reply({ account_id: guest.id, registration_details: p_details });
    }
    if (path === "/rest/v1/profiles") {
      if (url.searchParams.get("id") === `eq.${filmNight.owner_id}`)
        return reply({ id: filmNight.owner_id, display_name: "Stephen", avatar_path: null, avatar_revision: 0 });
      return reply(one ? profile : profile ? [profile] : []);
    }
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/plans") return reply(one ? filmNight : [filmNight]);
    if (path === "/rest/v1/attendees") {
      if (one) return reply({ version: 1, response: "pending" });
      return reply([{ user_id: guest.id, plan_id: filmNight.id, response: "pending", profiles: { display_name: "Guest" } }]);
    }
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });
  return { page, errors, opens, otps, joins, details };
}

try {
  {
    const { page, errors, claims } = await fixture();
    // Signed in and approved: joins, lands on the invitation, and the kept code is cleared.
    await page.goto(`${base}/invite?code=${OPEN}`);
    await expect(page.getByRole("heading", { name: "Film club", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeVisible();
    assert.deepEqual(claims, [{ p_code: OPEN }]);
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
    await page.goto(`${base}/invite?code=${OFF}`);
    await expect(inactive).toBeVisible();
    await expect(page.getByRole("heading", { name: "You’re invited.", exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    // So a cold start opens the app as usual, not this error.
    await page.goto(base);
    await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/create");
    await expect(inactive).toHaveCount(0);
    // "Go to My resbites" leaves the error.
    await page.goto(`${base}/invite?code=${OFF}`);
    await expect(inactive).toBeVisible();
    await page.getByRole("button", { name: "Go to My resbites", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My resbites", exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/plans");
    // A lost connection keeps the code for a retry, and a cold start comes back to it; leaving drops it.
    await page.goto(`${base}/invite?code=${NET}`);
    await expect(
      page.getByText("This invitation could not be opened. Check your connection and try again.", { exact: true }),
    ).toBeVisible();
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
    // A malformed code claims nothing and leaves a kept invitation alone.
    const before = claims.length;
    await page.evaluate((code) => sessionStorage.setItem("resbite.pending-invite", code), OPEN);
    await page.goto(`${base}/invite?code=short`);
    await expect(page.getByText("This invitation link is incomplete.", { exact: true })).toBeVisible();
    assert.equal(claims.length, before);
    assert.equal(await pending(page), OPEN);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      "PASS: signed in, an event link joins and lands on the invitation (code cleared); the organizer's own link lands on their event; an inactive link says so and drops the code (a cold start opens Create); a lost connection keeps it (a cold start returns to it); Go to My resbites leaves and drops it; a refused or own per-person link is dropped too; a malformed one claims nothing.",
    );
  }
  {
    const { page, errors, opens, otps, joins, details } = await guestFixture();
    // Signed out: the guest's account screen, with the invitation's card, the tick first and the providers
    // disabled until it is ticked. Web has no Sign in with Apple.
    await page.goto(`${base}/invite?code=${GUEST}`);
    await expect(heading(page, "Create your account to reply")).toBeVisible();
    await expect(page.getByText("Stephen invited you", { exact: true })).toBeVisible();
    await expect(page.getByText("Film night", { exact: true })).toBeVisible();
    await expect(page.getByText("Fri 23 Oct, 7.30pm", { exact: true })).toBeVisible();
    for (const name of ["Continue with Google", "Continue with email"]) await expect(button(page, name)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toHaveCount(0);
    await expect(page.getByText("Resbite is for people aged 18 and over.", { exact: true })).toBeVisible();
    const tick = page.getByRole("checkbox", { name: "I’m 18 or over", exact: true });
    await expect(tick).not.toBeChecked();
    await tick.click();
    await expect(tick).toBeChecked();
    for (const name of ["Continue with Google", "Continue with email"]) await expect(button(page, name)).toBeEnabled();
    await expect(page.getByText("Resbite is for people aged 18 and over.", { exact: true })).toHaveCount(0);
    // The tick and the code are kept on the device for after the sign-in; the open was counted once.
    await expect.poll(() => terms(page)).toBe("2026-10");
    await expect.poll(() => pending(page)).toBe(GUEST);
    assert.deepEqual(opens, [GUEST]);
    // Email by code: an invalid address is refused here, a valid one gets a code and the resend countdown.
    await button(page, "Continue with email").click();
    await expect(heading(page, "What’s your email?")).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("not-an-email");
    await button(page, "Send code").click();
    await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
    assert.deepEqual(otps, []);
    await page.getByLabel("Email", { exact: true }).fill("guest@example.invalid");
    await button(page, "Send code").click();
    await expect(heading(page, "Check your email")).toBeVisible();
    await expect(page.getByText("Didn’t get it? Send a new code in 1:00", { exact: true })).toBeVisible();
    await expect(page.getByText("We sent a 6-digit code to guest@example.invalid.", { exact: true })).toBeVisible();
    assert.deepEqual(otps, ["guest@example.invalid"]);
    // A wrong code says so and empties the boxes; the right one signs in.
    const digits = page.getByLabel("6-digit code", { exact: true });
    await digits.fill("000000");
    await expect(page.getByText("That code doesn’t match. Try again.", { exact: true })).toBeVisible();
    await expect(digits).toHaveValue("");
    await digits.fill("123456");
    // The account has no name, so the Name step asks for it, then the join and the event page.
    await expect(heading(page, "What’s your name?")).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("Guest One");
    await button(page, "Continue").click();
    await expect(heading(page, "Film night")).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/event");
    assert.deepEqual(joins, [{ p_code: GUEST, p_name: "Guest One", p_terms_version: "2026-10" }]);
    // Setup is marked reviewed with the account's (empty) optional details, so "About you" is skipped.
    assert.deepEqual(details, [{ birth_date: null, phone: null, city: null, interests: [] }]);
    // Signing in on the screen remounts it; the same visit's open is not counted again.
    assert.deepEqual(opens, [GUEST]);
    await expect.poll(() => pending(page)).toBe(null);
    await expect.poll(() => terms(page)).toBe(null);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      "PASS: signed out, an event link shows the guest's account screen (card, tick first, providers disabled until ticked, no Apple on web, one open counted); email code (invalid address, countdown 1:00, wrong code empties the boxes); the Name step; join_by_link with the name and terms 2026-10; the event page; setup marked reviewed; code and tick cleared.",
    );
  }
  {
    const { page, errors, joins } = await guestFixture({ metadata: { full_name: "Guest Two" }, signedIn: true, kept: GUEST });
    // A cold start with a kept code and a session but no kept tick: the tick row again, with one Continue.
    await page.goto(base);
    await expect(heading(page, "Create your account to reply")).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/invite");
    const tick = page.getByRole("checkbox", { name: "I’m 18 or over", exact: true });
    await expect(tick).not.toBeChecked();
    await expect(button(page, "Continue")).toBeDisabled();
    for (const name of ["Continue with Google", "Continue with email", "I already have an account"])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    assert.deepEqual(joins, []);
    await tick.click();
    await button(page, "Continue").click();
    // The account's name is known, so it joins straight away.
    await expect(heading(page, "Film night")).toBeVisible();
    assert.deepEqual(joins, [{ p_code: GUEST, p_name: "Guest Two", p_terms_version: "2026-10" }]);
    await expect.poll(() => pending(page)).toBe(null);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: a cold start with a kept code and a session but no kept tick asks for the tick with one Continue, then joins with the account's name.");
  }
  {
    const { page, errors, joins } = await guestFixture({ metadata: { full_name: "Guest Three" }, signedIn: true, kept: AGE, tick: "2026-10" });
    // The server refuses the tick (it was lost): the tick row again, unticked, and the kept tick dropped.
    await page.goto(base);
    await expect(heading(page, "Create your account to reply")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "I’m 18 or over", exact: true })).not.toBeChecked();
    await expect(button(page, "Continue")).toBeDisabled();
    assert.deepEqual(joins.map((j) => j.p_code), [AGE]);
    await expect.poll(() => terms(page)).toBe(null);
    await expect.poll(() => pending(page)).toBe(AGE);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: a refused tick shows the tick row again with one Continue; the code stays kept.");
  }
  {
    const { page, errors, joins } = await guestFixture({ metadata: { full_name: "Guest Four" }, signedIn: true, kept: GONE, tick: "2026-10" });
    // An invitation that is no longer available says so and drops the kept code, so a cold start opens as usual.
    await page.goto(base);
    await expect(page.getByText("This invitation is no longer active.", { exact: true })).toBeVisible();
    await expect(button(page, "Go to Resbite")).toBeVisible();
    assert.deepEqual(joins.map((j) => j.p_code), [GONE]);
    await expect.poll(() => pending(page)).toBe(null);
    await page.goto(base);
    await expect(heading(page, "Waiting for access")).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/account");
    await expect(page.getByText("If someone invited you to a resbite, open their link again.", { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: an unavailable invitation shows the inactive state and drops the kept code; a cold start lands on the normal start.");
  }
  {
    const { page, errors, joins } = await guestFixture({ metadata: { full_name: "Guest Five" }, signedIn: true, kept: FLAKY, tick: "2026-10" });
    // A lost connection during the join says so with Retry and keeps the code; Retry joins.
    await page.goto(base);
    await expect(page.getByText("Check your connection and try again.", { exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(FLAKY);
    await button(page, "Retry").click();
    await expect(heading(page, "Film night")).toBeVisible();
    assert.deepEqual(joins.map((j) => j.p_name), ["Guest Five", "Guest Five"]);
    await expect.poll(() => pending(page)).toBe(null);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: a lost connection during the join shows the connection copy with Retry and keeps the code; Retry joins.");
  }
  {
    const { page, errors, opens } = await guestFixture();
    // Signed out, a dead link says so with Go to Resbite, and offers no account creation.
    await page.goto(`${base}/invite?code=${DEAD}`);
    await expect(page.getByText("This invitation is no longer active.", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "I’m 18 or over", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue with email", exact: true })).toHaveCount(0);
    assert.deepEqual(opens, [DEAD]);
    await button(page, "Go to Resbite").click();
    await expect(heading(page, "Get together")).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: signed out, a dead link shows its state with Go to Resbite and no account creation.");
  }
} finally {
  await browser.close();
}
