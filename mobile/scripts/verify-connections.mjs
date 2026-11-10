// Connections in headless Chrome (CO-02, CO-P6). Every Supabase request is answered by the fixture below; any other
// path fails the run, and the connection RPCs the app sends are asserted by name and arguments.
//   profile    the Connections row above People lists, with the pending-request count as a badge (none when the read
//              fails or there are no requests); the old "People & groups" name is gone
//   screen     Requests · 1 (a card: the context line, Accept and Not now side by side) and Connected · 2 (Met at…,
//              Met on Resbite), the footer line; Accept sends accept_connection { p_user } and moves the person under
//              Connected · 3; the dots → Remove connection → the in-place confirm: Keep goes back, Remove sends
//              remove_connection { p_user } and the row goes; Back returns to Profile, whose badge has gone
//   decline    under Larger Text the two pills stack; a failed Accept keeps the card and says why; Not now sends
//              decline_connection { p_user } and removes the card
//   edges      the empty state (no footer line); a failed read offers Try again
//   (Task 8 adds "Your connections" on Invite people below.)
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, heading, heightOf, inOrder, quietReminders, visible } from "./qa-helpers.mjs";

const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const STORAGE_KEY = "sb-ewcsgvhuojxdpaspwsrx-auth-token";
const ANA = "11111111-1111-4111-8111-111111111111";
const PEDRO = "22222222-2222-4222-8222-222222222222";
const MARTA = "33333333-3333-4333-8333-333333333333";
const TOMAS = "44444444-4444-4444-8444-444444444444";
const INES = "55555555-5555-4555-8555-555555555555";
const jwt = (sub) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ sub, exp, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");
};
const user = {
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
// my_connections' rows as the server sends them: requests newest first, connected by name.
const row = (user_id, name, title, context) => ({
  user_id,
  name,
  avatar_path: null,
  avatar_revision: 0,
  series_id: title ? `series-${name}` : null,
  title,
  ...(context ? { context } : {}),
});
const pedro = row(PEDRO, "Pedro", "Board game night", "going");
const ines = row(INES, "Inés", "Picnic in the park", "met");
const marta = row(MARTA, "Marta", "Picnic in the park");
const tomas = row(TOMAS, "Tomás", null);

/** A page signed in as Ana on a stubbed Supabase whose connections change as the app accepts, declines and removes. */
async function fixture({ requests = [pedro], connected = [marta, tomas], width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", locale: "en-GB" });
  await quietReminders(context);
  const page = await context.newPage();
  await page.addInitScript(
    ({ key, session }) => {
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem("fixture-seeded", "1");
      }
    },
    {
      key: STORAGE_KEY,
      session: {
        user,
        access_token: jwt(ANA),
        refresh_token: "fixture",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
      },
    },
  );
  const state = {
    requests: [...requests],
    connected: [...connected],
    // How many of the next reads, or accepts, fail as a lost connection would.
    failReads: 0,
    failAccepts: 0,
  };
  const log = [],
    errors = [],
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The 503s are the failures under test.
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 503/.test(m.text()))
      errors.push(m.text());
  });
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    log.push({ method, path, body });
    const reply = (value, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    const empty = () => route.fulfill({ status: 204, body: "" });
    const lost = () => reply({ message: "Fixture: lost connection" }, 503);
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: ANA, status: "approved" });
    if (path === "/rest/v1/rpc/note_app_session") return empty();
    if (path === "/rest/v1/profiles") return reply({ id: ANA, display_name: "Ana", avatar_path: null, avatar_revision: 0 });
    if (path === "/rest/v1/activities" || path === "/rest/v1/plans" || path === "/rest/v1/attendees" || path === "/rest/v1/plan_mutes")
      return reply([]);
    if (path === "/rest/v1/rpc/my_join_requests") return reply([]);
    if (path === "/rest/v1/rpc/my_connections") {
      if (state.failReads > 0) {
        state.failReads--;
        return lost();
      }
      return reply({ requests: state.requests, connected: state.connected });
    }
    if (path === "/rest/v1/rpc/accept_connection") {
      if (state.failAccepts > 0) {
        state.failAccepts--;
        return lost();
      }
      const asked = state.requests.find((p) => p.user_id === body.p_user);
      state.requests = state.requests.filter((p) => p.user_id !== body.p_user);
      if (asked) {
        const { context: _context, ...now } = asked;
        state.connected = [...state.connected, now].sort((a, b) => a.name.localeCompare(b.name));
      }
      return empty();
    }
    if (path === "/rest/v1/rpc/decline_connection") {
      state.requests = state.requests.filter((p) => p.user_id !== body.p_user);
      return empty();
    }
    if (path === "/rest/v1/rpc/remove_connection") {
      state.connected = state.connected.filter((p) => p.user_id !== body.p_user);
      return empty();
    }
    unexpected.push(`${method} ${path}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });
  return {
    page,
    state,
    calls: (name) => log.filter((x) => x.method === "POST" && x.path === `/rest/v1/rpc/${name}`),
    async done() {
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors");
      await context.close();
    },
  };
}

const connectionsRow = (page, label) => page.getByRole("button", { name: label, exact: true });

try {
  // 1. Profile: Connections sits above People lists with the count of pending requests; the old name is gone.
  // 2. The screen: requests, then connections; Accept; Remove with its in-place confirm; Back.
  {
    const f = await fixture(),
      { page } = f;
    await page.goto(`${base}/profile`);
    await expect(heading(page, "Profile")).toBeVisible();
    await expect(connectionsRow(page, "Connections, 1 request")).toBeVisible();
    await expect(visible(connectionsRow(page, "Connections, 1 request").getByText("1", { exact: true }))).toBeVisible();
    await expect(button(page, "People lists")).toBeVisible();
    await expect(page.getByRole("button", { name: "People & groups", exact: true })).toHaveCount(0);
    assert.ok(
      await inOrder(page, [connectionsRow(page, "Connections, 1 request"), button(page, "People lists")]),
      "Connections comes before People lists",
    );
    assert.equal(f.calls("my_connections").length, 1, "Profile reads the connections once on focus");

    await connectionsRow(page, "Connections, 1 request").click();
    await expect(heading(page, "Connections")).toBeVisible();
    await expect(heading(page, "Connections")).toBeFocused();
    await expect(heading(page, "Requests · 1")).toBeVisible();
    await expect(heading(page, "Connected · 2")).toBeVisible();
    for (const name of ["Pedro", "Marta", "Tomás"]) await expect(visible(page.getByText(name, { exact: true }))).toBeVisible();
    await expect(visible(page.getByText("You're both going to Board game night", { exact: true }))).toBeVisible();
    await expect(visible(page.getByText("Met at Picnic in the park", { exact: true }))).toBeVisible();
    await expect(visible(page.getByText("Met on Resbite", { exact: true }))).toBeVisible();
    await expect(
      visible(page.getByText("You can only connect with people who share a resbite with you. There is no search.", { exact: true })),
    ).toBeVisible();
    assert.ok(
      await inOrder(page, [heading(page, "Requests · 1"), visible(page.getByText("Pedro", { exact: true })), heading(page, "Connected · 2")]),
      "the requests come first",
    );
    // A request has no dots; the pills are labelled with the person and sit side by side, each 44 pt or taller.
    await expect(button(page, "Actions for Pedro")).toHaveCount(0);
    const accept = button(page, "Accept Pedro's request"),
      notNow = button(page, "Not now, Pedro's request");
    await expect(accept).toBeVisible();
    await expect(notNow).toBeVisible();
    const [a, n] = [await accept.boundingBox(), await notNow.boundingBox()];
    assert.ok(Math.abs(a.y - n.y) <= 1 && a.x + a.width <= n.x, "Accept and Not now side by side");
    assert.ok(a.height >= 44 && n.height >= 44, `the pills are ${a.height} and ${n.height} tall`);
    assert.ok((await heightOf(button(page, "Actions for Marta"))) >= 44, "the dots are a 44 pt target");

    await accept.click();
    await expect(heading(page, "Connected · 3")).toBeVisible();
    await expect(visible(page.getByRole("heading", { name: /^Requests/ }))).toHaveCount(0);
    await expect(visible(page.getByText("Met at Board game night", { exact: true }))).toBeVisible();
    await expect(button(page, "Actions for Pedro")).toBeVisible();
    assert.deepEqual(
      f.calls("accept_connection").map((x) => x.body),
      [{ p_user: PEDRO }],
    );
    assert.ok(
      await inOrder(page, [button(page, "Actions for Marta"), button(page, "Actions for Pedro"), button(page, "Actions for Tomás")]),
      "Pedro joins the connections in name order",
    );

    // Keep goes back to the menu and removes nobody.
    await button(page, "Actions for Tomás").click();
    await expect(visible(page.getByText("Tomás", { exact: true }))).toHaveCount(2);
    await button(page, "Remove connection").click();
    await expect(heading(page, "Remove Tomás from your connections? Neither of you will be told.")).toBeVisible();
    await button(page, "Keep").click();
    await expect(button(page, "Remove connection")).toBeVisible();
    await button(page, "Close sheet").click();
    await expect(button(page, "Remove connection")).toHaveCount(0);
    assert.equal(f.calls("remove_connection").length, 0, "Keep sends nothing");

    await button(page, "Actions for Marta").click();
    await button(page, "Remove connection").click();
    await expect(heading(page, "Remove Marta from your connections? Neither of you will be told.")).toBeVisible();
    await button(page, "Remove").click();
    await expect(button(page, "Remove connection")).toHaveCount(0);
    await expect(heading(page, "Remove Marta from your connections? Neither of you will be told.")).toHaveCount(0);
    await expect(button(page, "Actions for Marta")).toHaveCount(0);
    await expect(visible(page.getByText("Marta", { exact: true }))).toHaveCount(0);
    await expect(heading(page, "Connected · 2")).toBeVisible();
    assert.deepEqual(
      f.calls("remove_connection").map((x) => x.body),
      [{ p_user: MARTA }],
    );

    // Back to Profile: read again on focus, with no request left there is no badge.
    await button(page, "Back").click();
    await expect(heading(page, "Profile")).toBeVisible();
    await expect(connectionsRow(page, "Connections")).toBeVisible();
    await expect(connectionsRow(page, "Connections, 1 request")).toHaveCount(0);
    assert.equal(f.calls("decline_connection").length, 0);
    await f.done();
  }
  console.log("PASS: Profile's Connections row and badge, above People lists; Requests and Connected; Accept; Remove with Keep and Remove; Back.");

  // 3. Under Larger Text the pills stack; a failed Accept keeps the card and says why; Not now declines.
  {
    const f = await fixture({ requests: [ines, pedro], connected: [marta], width: 320 }),
      { page } = f;
    f.state.failAccepts = 1;
    await page.goto(`${base}/connections?largeText=1`);
    await expect(heading(page, "Requests · 2")).toBeVisible();
    await expect(visible(page.getByText("You were both at Picnic in the park", { exact: true }))).toBeVisible();
    const accept = button(page, "Accept Inés's request"),
      notNow = button(page, "Not now, Inés's request");
    const [a, n] = [await accept.boundingBox(), await notNow.boundingBox()];
    assert.ok(n.y >= a.y + a.height - 1 && Math.abs(a.x - n.x) <= 1, "under Larger Text Not now stacks under Accept");
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(fits, "no sideways scrolling at 320 px under Larger Text");

    await accept.click();
    await expect(visible(page.getByText("Check your connection and try again.", { exact: true }))).toBeVisible();
    await expect(heading(page, "Requests · 2")).toBeVisible();
    await expect(heading(page, "Connected · 1")).toBeVisible();
    assert.deepEqual(f.calls("accept_connection").map((x) => x.body), [{ p_user: INES }]);

    await notNow.click();
    await expect(heading(page, "Requests · 1")).toBeVisible();
    await expect(button(page, "Accept Inés's request")).toHaveCount(0);
    await expect(visible(page.getByText("Check your connection and try again.", { exact: true }))).toHaveCount(0);
    await expect(button(page, "Accept Pedro's request")).toBeVisible();
    await expect(heading(page, "Connected · 1")).toBeVisible();
    assert.deepEqual(f.calls("decline_connection").map((x) => x.body), [{ p_user: INES }]);
    await f.done();
  }
  console.log("PASS: under Larger Text the pills stack; a failed Accept keeps the card; Not now declines.");

  // 4. Nobody yet: the empty state and no footer line, and no badge on Profile. A failed read offers Try again, and
  // on Profile a failed read shows no badge.
  {
    const f = await fixture({ requests: [], connected: [] }),
      { page } = f;
    await page.goto(`${base}/profile`);
    await expect(connectionsRow(page, "Connections")).toBeVisible();
    await connectionsRow(page, "Connections").click();
    await expect(
      visible(page.getByText("Nobody yet. You can connect with people who share a resbite with you, from its people list.", { exact: true })),
    ).toBeVisible();
    await expect(page.getByText("You can only connect with people who share a resbite with you. There is no search.", { exact: true })).toHaveCount(0);
    await expect(visible(page.getByRole("heading", { name: /^(Requests|Connected)/ }))).toHaveCount(0);
    await f.done();
  }
  {
    const f = await fixture(),
      { page } = f;
    f.state.failReads = 2;
    await page.goto(`${base}/profile`);
    await expect(heading(page, "Profile")).toBeVisible();
    await expect.poll(() => f.calls("my_connections").length).toBe(1);
    await expect(connectionsRow(page, "Connections")).toBeVisible();
    await expect(connectionsRow(page, "Connections, 1 request")).toHaveCount(0);
    await connectionsRow(page, "Connections").click();
    await expect(visible(page.getByText("Check your connection and try again.", { exact: true }))).toBeVisible();
    await expect(button(page, "Accept Pedro's request")).toHaveCount(0);
    await button(page, "Try again").click();
    await expect(heading(page, "Requests · 1")).toBeVisible();
    await expect(visible(page.getByText("Check your connection and try again.", { exact: true }))).toHaveCount(0);
    await f.done();
  }
  console.log("PASS: the empty state without the footer line; a failed read shows no badge and offers Try again.");

  // Task 8 continues here: "Your connections" on Invite people.

  console.log("PASS: Connections (first half). All Supabase requests intercepted.");
} finally {
  await browser.close();
}
