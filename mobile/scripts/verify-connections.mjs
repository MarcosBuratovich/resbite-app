// Connections in headless Chrome (CO-02, CO-P6). Every Supabase request is answered by the fixture below; any other
// path fails the run, and the connection RPCs the app sends are asserted by name and arguments.
//   profile    the Connections row above People lists, with the pending-request count as a badge (none when the read
//              fails or there are no requests); the old "People & groups" name is gone
//   screen     Requests · 1 (a card: the context line, Accept and Not now side by side) and Connected · 2 (Met at…,
//              Met on Resbite), the footer line; Accept sends accept_connection { p_user } and moves the person under
//              Connected · 3; the dots → Remove connection → the in-place confirm: Keep goes back, Remove sends
//              remove_connection { p_user } and the row goes; Back returns to Profile, whose badge has gone
//   decline    under Larger Text the two pills stack; a failed Accept keeps the card and says why; Not now sends
//              decline_connection { p_user } and removes the card; Accept on a request withdrawn meanwhile (42501 'No
//              request') says nothing and reads the list again, so the card goes
//   edges      the empty state (no footer line); a failed read offers Try again
//   invite     Invite people as the host: Your connections · 3 above Phone contacts, alphabetical, Lucas (on the
//              resbite) "Invited" without a tick, the event link's hint; ticking Marta makes Invite 1, which sends
//              invite_contacts { p_plan, p_invites: [{ user }] } and Almost there names her
//   mixed      a number and two connections: the number's call first, then the connections' own; one of them refused
//              (42501 'Not a connection') is sent again one by one, so Marta is invited, Ben's link is offered and a
//              line says one connection couldn't be
//   more       nine connections bring the search field (accent-blind); the only connection picked being refused says
//              so and stays on the Pick step; a failed read leaves the section out, with no error
//   people     as a guest who answered Going, on Pedro's resbite's people list: the dots on the host → Connect on
//              Resbite sends request_connection { p_user, p_plan }; the sheet then says Request sent with Cancel
//              request, which sends cancel_connection_request { p_user } and brings Connect back; Inés's request is
//              accepted from her dots (accept_connection { p_user }) and her row shows Connected
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
const LUCAS = "66666666-6666-4666-8666-666666666666";
const SOFIA = "77777777-7777-4777-8777-777777777777";
// Ana's picnic, which she hosts: the plan read of Invite people.
const MAP_PLAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PICNIC = {
  id: "88888888-8888-4888-8888-888888888888",
  activity_id: null,
  title: "Picnic in the park",
  description: "",
  categories: ["community"],
  owner_id: ANA,
  starts_at: "2099-06-06T11:00:00Z",
  ends_at: "2099-06-06T14:00:00Z",
  time_zone: "Europe/London",
  place_label: "Fixture park",
  area: "Near the river",
  note: "",
  status: "active",
  version: 1,
  cover_path: null,
  cover_revision: 0,
  cover_description: "",
  guest_note: "",
  guest_note_at: null,
  place_tbd: false,
  repeat_weeks: null,
  series_id: "series-picnic",
  repeats_from: null,
  has_meeting_details: false,
};
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
const lucas = row(LUCAS, "Lucas", "Board game night");
const sofia = row(SOFIA, "Sofía Gil", "Board game night");

/**
 * A page signed in as Ana on a stubbed Supabase whose connections change as the app accepts, declines and removes.
 * With `plan`, Ana hosts it, or is a guest on it (`mine`, her own row) when someone else owns it (`names` gives the
 * owner's name): `guests` are its attendee rows, and invite_contacts answers as the server does, refusing the whole
 * call (42501 'Not a connection') when it holds anyone in `refuse`. `pairs` are Ana's connection states with the
 * people there (plan_connection_states), which change as she asks, cancels and accepts from the people list.
 */
async function fixture({
  requests = [pedro],
  connected = [marta, tomas],
  width = 390,
  plan = null,
  guests = [],
  refuse = [],
  mine = null,
  names = {},
  pairs = {},
} = {}) {
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
    guests: guests.map(({ user_id, name, response = "pending" }) => ({ user_id, response, profiles: { display_name: name } })),
    pairs: { ...pairs },
  };
  const log = [],
    errors = [],
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The 503s and the 403 ('No request') are the failures under test.
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (503|403)/.test(m.text()))
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
    // As the server refuses a request it no longer holds (withdrawn, or answered elsewhere).
    const noRequest = () => reply({ code: "42501", message: "No request", details: null, hint: null }, 403);
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: ANA, status: "approved" });
    if (path === "/rest/v1/rpc/note_app_session") return empty();
    // Someone else's name (a host's, for a guest's resbite), else Ana's own profile.
    const named = names[url.searchParams.get("id")?.replace(/^eq\./, "")];
    if (path === "/rest/v1/profiles") return reply(named ? { display_name: named } : { id: ANA, display_name: "Ana", avatar_path: null, avatar_revision: 0 });
    // The plan read (one row), Ana's own row when she is a guest, and the guests on it.
    if (plan && path === "/rest/v1/plans" && url.searchParams.get("id") === `eq.${plan.id}`)
      return reply({ ...plan, plan_meeting_details: null, plan_admins: [] });
    if (plan && path === "/rest/v1/attendees" && url.searchParams.get("plan_id") === `eq.${plan.id}`)
      return reply(url.searchParams.get("select") === "version,response" ? mine : state.guests);
    if (plan && path === "/rest/v1/rpc/plan_connection_states") {
      assert.equal(body.p_plan, plan.id);
      return reply(state.pairs);
    }
    if (plan && path === "/rest/v1/rpc/request_connection") {
      assert.equal(body.p_plan, plan.id);
      state.pairs[body.p_user] = "requested_by_me";
      return reply("requested");
    }
    if (plan && path === "/rest/v1/rpc/cancel_connection_request") {
      if (state.pairs[body.p_user] === "requested_by_me") delete state.pairs[body.p_user];
      return empty();
    }
    if (path === "/rest/v1/activities" || path === "/rest/v1/plans" || path === "/rest/v1/attendees" || path === "/rest/v1/plan_mutes")
      return reply([]);
    if (plan && path === "/rest/v1/rpc/plan_link") return reply("AbCdEfGhIjKlMnOpQrStUv");
    if (plan && path === "/rest/v1/rpc/contacts_on_resbite") return reply([]);
    if (plan && path === "/rest/v1/rpc/invite_contacts") {
      assert.equal(body.p_plan, plan.id);
      if (body.p_invites.some((x) => refuse.includes(x.user)))
        return reply({ code: "42501", message: "Not a connection", details: null, hint: null }, 403);
      return reply(
        body.p_invites.map((x) => {
          if (!x.user) return { phone: x.phone, kind: "link" };
          if (x.user === plan.owner_id || state.guests.some((g) => g.user_id === x.user)) return { user: x.user, kind: "already" };
          state.guests.push({ user_id: x.user, response: "pending", profiles: { display_name: "Invited" } });
          return { user: x.user, kind: "app" };
        }),
      );
    }
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
      // A request on the people list (pairs) or on the Connections screen (requests).
      if (state.pairs[body.p_user] === "requested_by_them") {
        state.pairs[body.p_user] = "connected";
        return empty();
      }
      const asked = state.requests.find((p) => p.user_id === body.p_user);
      if (!asked) return noRequest();
      state.requests = state.requests.filter((p) => p.user_id !== body.p_user);
      const { context: _context, ...now } = asked;
      state.connected = [...state.connected, now].sort((a, b) => a.name.localeCompare(b.name));
      return empty();
    }
    if (path === "/rest/v1/rpc/decline_connection") {
      if (!state.requests.some((p) => p.user_id === body.p_user)) return noRequest();
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
const tick = (page, name) => visible(page.getByRole("checkbox", { name: `Select ${name}`, exact: true }));
const text = (page, words) => visible(page.getByText(words, { exact: true }));
const REFUSED = "One of your connections can't be invited right now. The others were.";

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

    // Pedro withdraws his request meanwhile: Accept is refused with 'No request', which says nothing and reads the
    // list again, so his card goes.
    f.state.requests = [];
    const reads = f.calls("my_connections").length;
    await button(page, "Accept Pedro's request").click();
    await expect(button(page, "Accept Pedro's request")).toHaveCount(0);
    await expect(visible(page.getByRole("heading", { name: /^Requests/ }))).toHaveCount(0);
    await expect(heading(page, "Connected · 1")).toBeVisible();
    assert.equal(f.calls("my_connections").length, reads + 1, "the list is read again");
    await expect(visible(page.getByText("Check your connection and try again.", { exact: true }))).toHaveCount(0);
    await expect(visible(page.getByText("Couldn't do that. Try again.", { exact: true }))).toHaveCount(0);
    await expect(visible(page.getByRole("alert"))).toHaveCount(0);
    assert.deepEqual(f.calls("accept_connection").map((x) => x.body), [{ p_user: INES }, { p_user: PEDRO }]);
    await f.done();
  }
  console.log("PASS: under Larger Text the pills stack; a failed Accept keeps the card; Not now declines; a withdrawn request goes quietly.");

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

  // 5. Invite people as the host: Your connections above the phone contacts, alphabetical; Lucas is on the resbite
  // already, so he reads "Invited" and can't be ticked; ticking Marta makes Invite 1, which invites her by user id.
  {
    const f = await fixture({ requests: [], connected: [sofia, marta, lucas], plan: PICNIC, guests: [{ user_id: LUCAS, name: "Lucas" }] }),
      { page } = f;
    await page.goto(`${base}/invitations?plan=${PICNIC.id}`);
    await expect(heading(page, "Invite people")).toBeVisible();
    await expect(heading(page, "Your connections · 3")).toBeVisible();
    await expect(heading(page, "Phone contacts")).toBeVisible();
    // First names, alphabetical, above the phone contacts and the event link.
    assert.ok(
      await inOrder(page, [
        heading(page, "Your connections · 3"),
        text(page, "Lucas"),
        tick(page, "Marta"),
        tick(page, "Sofía Gil"),
        heading(page, "Phone contacts"),
        visible(page.getByLabel("Search contacts", { exact: true })),
        heading(page, "Or share the event link"),
      ]),
      "connections, alphabetical, then phone contacts, then the event link",
    );
    await expect(text(page, "Sofía")).toBeVisible();
    await expect(text(page, "Sofía Gil")).toHaveCount(0);
    // Lucas: "Invited" in place of the tick, nothing to select.
    await expect(tick(page, "Lucas")).toHaveCount(0);
    await expect(visible(page.getByLabel("Lucas, Invited", { exact: true }))).toBeVisible();
    await expect(text(page, "Invited")).toHaveCount(1);
    // Three connections: no search field.
    await expect(page.getByLabel("Search connections", { exact: true })).toHaveCount(0);
    // The event link's hint.
    await expect(text(page, "Anyone who answers through the link waits for your approval.")).toBeVisible();
    await expect(page.getByText("Anyone can answer with it, and you approve them first.", { exact: true })).toHaveCount(0);
    // A 24 pt box inside a 44 pt target.
    assert.ok((await heightOf(tick(page, "Marta"))) >= 44, "the tick's target is 44 pt or taller");
    const box = await tick(page, "Marta").locator("[data-testid='tick-box']").boundingBox();
    assert.ok(box && Math.round(box.width) === 24 && Math.round(box.height) === 24, `the box is ${box?.width} × ${box?.height}`);
    await expect(tick(page, "Marta")).toHaveAttribute("aria-checked", "false");
    await expect(button(page, "Invite 0")).toBeDisabled();

    await tick(page, "Marta").click();
    await expect(tick(page, "Marta")).toHaveAttribute("aria-checked", "true");
    await expect(button(page, "Invite 1")).toBeEnabled();
    // A second tap clears it; a third ticks her again.
    await tick(page, "Marta").click();
    await expect(button(page, "Invite 0")).toBeDisabled();
    await tick(page, "Marta").click();
    await button(page, "Invite 1").click();
    await expect(heading(page, "Almost there")).toBeVisible();
    assert.deepEqual(
      f.calls("invite_contacts").map((x) => x.body),
      [{ p_plan: PICNIC.id, p_invites: [{ user: MARTA }] }],
    );
    await expect(text(page, "Marta is invited. They’ll see it in Resbite.")).toBeVisible();
    await expect(heading(page, /^Your connections/)).toHaveCount(0);
    await expect(visible(page.getByRole("alert"))).toHaveCount(0);
    assert.equal(f.calls("my_connections").length, 1, "Invite people reads the connections once");
    await f.done();
  }
  console.log(
    "PASS: Invite people: Your connections · 3 above Phone contacts (first names, alphabetical), Lucas Invited without a tick, a 24 pt box in a 44 pt target, the event link's new hint; Invite 1 sends invite_contacts { p_plan, p_invites: [{ user: Marta }] } and Almost there names her.",
  );

  // 6. A number and two connections, one of whom can no longer be invited: the number goes in its own call, first;
  // the connections' call is refused as a whole, so each is sent again alone. Marta and Ben are invited; a line says
  // one connection couldn't be.
  {
    const f = await fixture({ requests: [], connected: [marta, sofia, lucas], plan: PICNIC, refuse: [SOFIA] }),
      { page } = f;
    await page.goto(`${base}/invitations?plan=${PICNIC.id}`);
    await expect(heading(page, "Your connections · 3")).toBeVisible();
    // Nobody is on the resbite: everyone can be ticked.
    await expect(text(page, "Invited")).toHaveCount(0);
    await page.getByLabel("Name (optional)", { exact: true }).fill("Ben Ito");
    await page.getByLabel("Phone number", { exact: true }).fill("+44 7700 900456");
    await button(page, "Add").click();
    await expect(page.getByLabel("Remove Ben Ito", { exact: true })).toBeVisible();
    await tick(page, "Marta").click();
    await tick(page, "Sofía Gil").click();
    await button(page, "Invite 3").click();
    await expect(heading(page, "Almost there")).toBeVisible();
    const sent = f.calls("invite_contacts").map((x) => x.body.p_invites);
    assert.equal(sent.length, 4, "the number, the connections, then each connection alone");
    assert.deepEqual(sent[0].map((x) => x.phone), ["447700900456"]);
    assert.ok(sent[0].every((x) => !("user" in x)), "the number's call carries no connection");
    assert.deepEqual(sent.slice(1), [[{ user: MARTA }, { user: SOFIA }], [{ user: MARTA }], [{ user: SOFIA }]]);
    await expect(text(page, "Marta is invited. They’ll see it in Resbite.")).toBeVisible();
    await expect(button(page, "WhatsApp: Ben Ito")).toBeVisible();
    await expect(text(page, REFUSED)).toBeVisible();
    await f.done();
  }
  console.log(
    "PASS: a number and two connections: the number's own call first, then the connections'; a refused call is sent again one by one, so Marta and Ben are invited and the refusal line shows.",
  );

  // 7. Nine connections bring a search field, accent-blind; the count stays. The only pick refused says so and keeps
  // the Pick step. A failed read leaves the section out, quietly.
  {
    const nine = ["Ana B", "Bea", "Carla", "Dani", "Inés", "Jon", "Lucía", "Marta", "Sofía Gil"].map((name, i) =>
      row(name === "Sofía Gil" ? SOFIA : `99999999-9999-4999-8999-99999999999${i}`, name, null),
    );
    const f = await fixture({ requests: [], connected: nine, plan: PICNIC, refuse: [SOFIA] }),
      { page } = f;
    await page.goto(`${base}/invitations?plan=${PICNIC.id}`);
    await expect(heading(page, "Your connections · 9")).toBeVisible();
    const search = visible(page.getByLabel("Search connections", { exact: true }));
    await expect(search).toBeVisible();
    assert.ok(await inOrder(page, [heading(page, "Your connections · 9"), search, tick(page, "Ana B")]), "the search sits above the rows");
    await expect(page.getByRole("checkbox", { name: /^Select / })).toHaveCount(9);
    await search.fill("ines");
    await expect(visible(page.getByRole("checkbox", { name: /^Select / }))).toHaveCount(1);
    await expect(tick(page, "Inés")).toBeVisible();
    await search.fill("SOF");
    await expect(visible(page.getByRole("checkbox", { name: /^Select / }))).toHaveCount(1);
    await expect(heading(page, "Your connections · 9")).toBeVisible();
    await tick(page, "Sofía Gil").click();
    await search.fill("");
    await expect(visible(page.getByRole("checkbox", { name: /^Select / }))).toHaveCount(9);
    await expect(tick(page, "Sofía Gil")).toHaveAttribute("aria-checked", "true");
    await button(page, "Invite 1").click();
    await expect(text(page, "Couldn't do that. Try again.")).toBeVisible();
    await expect(heading(page, "Invite people")).toBeVisible();
    await expect(heading(page, "Almost there")).toHaveCount(0);
    await expect(tick(page, "Sofía Gil")).toHaveAttribute("aria-checked", "true");
    assert.deepEqual(f.calls("invite_contacts").map((x) => x.body.p_invites), [[{ user: SOFIA }], [{ user: SOFIA }]]);
    await f.done();
  }
  {
    const f = await fixture({ requests: [], connected: [marta], plan: PICNIC }),
      { page } = f;
    f.state.failReads = 1;
    await page.goto(`${base}/invitations?plan=${PICNIC.id}`);
    await expect(heading(page, "Invite people")).toBeVisible();
    await expect(button(page, "Invite 0")).toBeVisible();
    await expect.poll(() => f.calls("my_connections").length).toBe(1);
    await page.waitForTimeout(300);
    await expect(page.getByRole("heading", { name: /^Your connections/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Phone contacts", exact: true })).toHaveCount(0);
    await expect(visible(page.getByRole("alert"))).toHaveCount(0);
    await f.done();
  }
  console.log(
    "PASS: nine connections bring an accent-blind search above the rows; the only pick refused says Couldn't do that and keeps the Pick step; a failed read leaves the section out with no error.",
  );

  // 8. The people list, as a guest who answered Going on Pedro's resbite: Ana asks the host to connect, sees the
  // request sent, cancels it, and accepts Inés's request to her.
  {
    const games = { ...PICNIC, id: MAP_PLAN, owner_id: PEDRO, title: "Board game night", series_id: "series-games" };
    const f = await fixture({
      requests: [],
      connected: [],
      plan: games,
      mine: { version: 1, response: "accepted" },
      names: { [PEDRO]: "Pedro" },
      guests: [
        { user_id: ANA, name: "Ana", response: "accepted" },
        { user_id: INES, name: "Inés", response: "accepted" },
        { user_id: TOMAS, name: "Tomás", response: "accepted" },
      ],
      pairs: { [INES]: "requested_by_them" },
    }),
      { page } = f;
    const sheet = page.locator("[aria-modal]");
    const closeSheet = () => button(page, "Close sheet").first().click();
    await page.goto(`${base}/guests?plan=${MAP_PLAN}`);
    await expect(heading(page, "People")).toBeVisible();
    await expect(heading(page, "Going · 4")).toBeVisible();
    await expect(page.getByLabel("Pedro, Hosting", { exact: true })).toBeVisible();
    // Ana's own row has no dots.
    await expect(button(page, "Actions for Ana")).toHaveCount(0);

    // Connect on the host's row: the request names Pedro and this resbite.
    await button(page, "Actions for Pedro").click();
    await expect(sheet.getByText("Hosting", { exact: true })).toBeVisible();
    await expect(page.getByText("Pedro decides. Then you can invite each other in the app.", { exact: true })).toBeVisible();
    await button(page, "Connect on Resbite").click();
    await expect(button(page, "Connect on Resbite")).toHaveCount(0);
    assert.deepEqual(f.calls("request_connection").map((x) => x.body), [{ p_user: PEDRO, p_plan: MAP_PLAN }]);
    // The states are read again before the sheet closes: reopened, it says Request sent, with Cancel request.
    assert.ok(f.calls("plan_connection_states").length >= 2, "the states are read again after the request");
    await button(page, "Actions for Pedro").click();
    await expect(visible(sheet.getByText("Request sent", { exact: true }))).toBeVisible();
    await expect(button(page, "Cancel request")).toBeVisible();
    await expect(button(page, "Connect on Resbite")).toHaveCount(0);

    // Cancel request: the request goes, and Connect is offered again.
    await button(page, "Cancel request").click();
    await expect(button(page, "Cancel request")).toHaveCount(0);
    assert.deepEqual(f.calls("cancel_connection_request").map((x) => x.body), [{ p_user: PEDRO }]);
    await button(page, "Actions for Pedro").click();
    await expect(button(page, "Connect on Resbite")).toBeVisible();
    await expect(sheet.getByText("Request sent", { exact: true })).toHaveCount(0);
    await closeSheet();
    await expect(button(page, "Connect on Resbite")).toHaveCount(0);

    // Inés asked Ana: Accept from her dots, and her row shows Connected, with nothing left to do there.
    await expect(page.getByLabel("Inés, Connected", { exact: true })).toHaveCount(0);
    await button(page, "Actions for Inés").click();
    await expect(button(page, "Not now")).toBeVisible();
    await button(page, "Accept Inés's request").click();
    await expect(button(page, "Accept Inés's request")).toHaveCount(0);
    assert.deepEqual(f.calls("accept_connection").map((x) => x.body), [{ p_user: INES }]);
    await expect(page.getByLabel("Inés, Connected", { exact: true })).toBeVisible();
    await expect(visible(page.getByText("Connected", { exact: true }))).toHaveCount(1);
    await expect(button(page, "Actions for Inés")).toHaveCount(0);
    // Tomás was never asked: Connect stays on his row; nothing was declined.
    await expect(button(page, "Actions for Tomás")).toBeVisible();
    assert.equal(f.calls("decline_connection").length, 0);
    await expect(visible(page.getByRole("alert"))).toHaveCount(0);
    await f.done();
  }
  console.log(
    "PASS: the people list as a guest: Connect on the host's row sends request_connection { p_user, p_plan }, then Request sent with Cancel request, which sends cancel_connection_request { p_user } and brings Connect back; Accept Inés's request sends accept_connection { p_user } and her row shows Connected.",
  );

  console.log("PASS: Connections, the people list's Connect, Cancel request and Accept, and Your connections on Invite people. All Supabase requests intercepted.");
} finally {
  await browser.close();
}
