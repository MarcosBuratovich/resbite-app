// GI1: opening the event's one link (/r/<code>). The native router turns it into /invite?code=<code>
// (routeSystemLink, unit-tested in appLinks.test.ts); this drives that screen on the web build. Signed in and
// approved: claim_plan_link, then the event page, and the kept code is cleared. The organizer's own link lands
// on their event. Signed out: the code is kept and "Sign in" shows. An inactive code says so and drops the kept
// code, so a restart opens the app as usual; a lost connection keeps it; "Go to My resbites" leaves either. A
// malformed code claims nothing. Every Supabase request is intercepted.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { quietReminders } from "./qa-helpers.mjs";
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
const pending = (page) => page.evaluate(() => sessionStorage.getItem("resbite.pending-invite"));

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
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });
  return { page, errors, claims };
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
      "PASS: signed in, an event link joins and lands on the invitation (code cleared); the organizer's own link lands on their event; an inactive link says so and drops the code (a cold start opens Create); a lost connection keeps it (a cold start returns to it); Go to My resbites leaves and drops it; a malformed one claims nothing.",
    );
  }
  {
    const { page, errors, claims } = await fixture({ signedIn: false });
    // Signed out: the code is kept on the device and the sign-in path shows.
    await page.goto(`${base}/invite?code=${OPEN}`);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(OPEN);
    assert.deepEqual(claims, []);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: signed out, an event link is kept on the device and Sign in shows.");
  }
} finally {
  await browser.close();
}
