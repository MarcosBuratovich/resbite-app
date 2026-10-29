// Creating a resbite, Plan 3: the resbite page for every role and state, its More sheet, the people list and the
// idea page. Every Supabase request is intercepted; nothing is sent. Each scenario builds its own fixture, walks
// the screen and asserts what is visible, the roles and the requests the app made (names and arguments).
//   owner      the page (Invite, Edit, More; You’re hosting; the people row), More (four rows, mute, cancel)
//   repeating  Every Thursday; the two cancel choices
//   ended      · Ended; Do this again alone; no More
//   running    Edit is there and a guest reply is accepted
//   admin      You’re an admin; Change my reply; Cancel resbite; Can’t go → the guest page
//   guest      Hosted by Ana; You’re going + Change; an unanswered guest sees counts, Your answer, no More
//   people     the groups, Make admin, Approve, Send again only for a code this phone holds
//   idea       Back over the image, Use idea
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { quietReminders } from "./qa-helpers.mjs";

const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const user = {
  id: "11111111-1111-4111-8111-111111111111",
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

// The plan-read select the app sends for one resbite (src/services/plans.ts `planWithDetails`).
const PLAN_SELECT = "*,plan_meeting_details(note),plan_admins(user_id)";
// The plan screen (after Do this again or Use idea) reads the cover columns too.
const COVER_SELECT = "cover_path,cover_description,cover_revision";
// ...and the named-columns read the plan gateway sends (src/services/plans.ts `planColumns`, used by the reminder sync).
const PLAN_COLUMNS =
  "id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,status,version,owner_id,has_meeting_details,guest_note,guest_note_at,area,place_tbd,repeat_weeks,series_id,repeats_from,plan_meeting_details(note),plan_admins(user_id)";
const HOST = { id: "33333333-3333-4333-8333-333333333333", name: "Ana" };
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const SERIES_ID = "55555555-5555-4555-8555-555555555555";
const hour = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
// 5 March 2099 is a Thursday.
const THURSDAY = "2099-03-05T15:00:00Z";
const basePlan = {
  id: PLAN_ID,
  activity_id: "coffee-together",
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
  owner_id: user.id,
  starts_at: THURSDAY,
  ends_at: "2099-03-05T17:00:00Z",
  time_zone: "UTC",
  place_label: "Fixture café",
  place_tbd: false,
  area: "Near the station",
  note: "",
  status: "active",
  version: 1,
  cover_path: null,
  cover_revision: 0,
  cover_description: "",
  guest_note: "",
  guest_note_at: null,
  repeat_weeks: null,
  series_id: SERIES_ID,
  repeats_from: null,
  has_meeting_details: false,
};
const g = (id, name, response) => ({ user_id: id, response, profiles: { display_name: name } });
const ALEX = g("g1", "Alex", "accepted");
const BEA = g("g2", "Bea", "accepted");
const CY = g("g3", "Cy", "maybe");
const DI = g("g4", "Di", "declined");
// Pat's code is on this phone (sent on WhatsApp); the second number's isn't (the host changed phones).
const PAT = { phone: "447700900222", e164: "+447700900222", name: "Pat Lee", code: "PatCodePatCodePatCode1" };
const UNSTORED = { phone: "447700900333", label: "+44 7700 900333" };
const phoneRow = (phone) => ({ phone, country: "44", answered: false, response: null });
const SAM = { user_id: "r1", name: "Sam Reed", response: "accepted", ending: "34", created_at: "2099-02-20T10:00:00Z" };
const CODE_STORE = `resbite.invite-codes.v1.${user.id}`;
const errors = [];

/**
 * One scenario: a fresh browser context with every Supabase request answered from `world`. `world.plan` is merged
 * over the base plan; `viewer` is "owner" (the signed-in person owns it), "admin" or "guest". Returns the page,
 * the requests made and the state the fixture holds, so a scenario can read them.
 */
async function open(world = {}) {
  const viewer = world.viewer ?? "owner";
  const state = {
    plan: { ...basePlan, ...(viewer === "owner" ? {} : { owner_id: HOST.id }), ...world.plan },
    attendee: world.attendee ?? (viewer === "owner" ? null : { version: 1, response: "pending" }),
    guests: world.guests ?? [],
    admins: viewer === "admin" ? [user.id] : [...(world.admins ?? [])],
    phoneInvites: world.phoneInvites ?? [],
    requests: world.requests ?? [],
    muted: Boolean(world.muted),
  };
  const log = [];
  const planSelects = new Set();
  const unexpected = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await quietReminders(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ s, store }) => {
      sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(s));
      if (store.value && !sessionStorage.getItem(store.key)) sessionStorage.setItem(store.key, JSON.stringify(store.value));
    },
    {
      s: session,
      store: {
        key: CODE_STORE,
        value: world.storedCodes ? { [PLAN_ID]: world.storedCodes } : null,
      },
    },
  );
  const rpcs = (name) => log.filter((c) => c.name === name).map((c) => c.body);
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const none = () => route.fulfill({ status: 204, body: "" });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/note_app_session") return none();
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles") {
      if (url.searchParams.get("id") === `eq.${HOST.id}`) return reply({ display_name: HOST.name });
      return reply({ id: user.id, display_name: "Fixture", avatar_path: null, avatar_revision: 0 });
    }
    if (path.startsWith("/storage/v1/object/sign/")) return reply({ message: "Fixture: no signed links" }, 400);
    if (path === "/rest/v1/activities") return reply(world.activities ?? []);
    if (path === "/rest/v1/plan_mutes") return reply(state.muted ? [{ series_id: SERIES_ID }] : []);
    if (path === "/rest/v1/plans") {
      const select = url.searchParams.get("select");
      planSelects.add(select);
      const insider = state.plan.owner_id === user.id || ["accepted", "maybe"].includes(state.attendee?.response);
      const row = {
        ...state.plan,
        note: "",
        has_meeting_details: Boolean(state.plan.note),
        plan_meeting_details: insider && state.plan.note ? { note: state.plan.note } : null,
        plan_admins: state.admins.map((user_id) => ({ user_id })),
      };
      return reply(one ? row : [row]);
    }
    if (path === "/rest/v1/attendees") {
      const select = url.searchParams.get("select");
      if (select === "plan_id,response") return reply(state.attendee ? [{ plan_id: PLAN_ID, response: state.attendee.response }] : []);
      if (one) return reply(state.attendee);
      const own = state.attendee ? [g(user.id, "Fixture", state.attendee.response)] : [];
      // The server shows an unanswered invitee only their own row (UX-P5).
      return reply(state.attendee?.response === "pending" ? own : [...state.guests, ...own.filter((r) => r.response !== "pending")]);
    }
    const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(path)?.[1];
    if (!rpc) {
      unexpected.push(`${req.method()} ${path}`);
      return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
    }
    const body = req.postData() ? req.postDataJSON() : null;
    log.push({ name: rpc, body });
    switch (rpc) {
      case "set_plan_mute":
        state.muted = body.p_muted;
        return reply(state.muted);
      case "respond": {
        assert.equal(body.p_version, state.attendee.version);
        state.attendee = { version: state.attendee.version + 1, response: body.p_response };
        // The server ends an admin's part when they can’t go.
        if (viewer === "admin" && ["declined", "withdrawn"].includes(body.p_response)) state.admins = [];
        return reply(state.attendee.version);
      }
      case "change_plan_v4":
        if (body.p_cancel) {
          state.plan = { ...state.plan, status: "cancelled", version: state.plan.version + 1 };
          return reply(state.plan.version);
        }
        return reply({ message: "Fixture: edits are not under test" }, 400);
      case "appoint_admin":
        state.admins = [...state.admins, body.p_user];
        return none();
      case "remove_admin":
        state.admins = state.admins.filter((id) => id !== body.p_user);
        return none();
      case "plan_phone_invitations":
        return reply(state.phoneInvites);
      case "plan_join_requests":
        return reply(state.requests);
      case "decide_join_request": {
        const asked = state.requests.find((r) => r.user_id === body.p_user);
        state.requests = state.requests.filter((r) => r !== asked);
        if (body.p_approve) state.guests = [...state.guests, g(asked.user_id, asked.name, asked.response)];
        return reply({ status: body.p_approve ? "approved" : "declined" });
      }
      default:
        unexpected.push(`rpc ${rpc}`);
        return reply({ message: `Unexpected rpc ${rpc}` }, 400);
    }
  });
  return {
    page,
    state,
    log,
    rpcs,
    planSelects,
    unexpected,
    close: () => context.close(),
  };
}

const btn = (page, name) => page.getByRole("button", { name, exact: true });
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const text = (page, value) => page.getByText(value, { exact: true });
const goto = async (f, path, title = f.state.plan.title) => {
  await f.page.goto(`${base}${path}`);
  await expect(heading(f.page, title)).toBeVisible();
};
/** The bottom row's buttons, by name, in the content bar. */
const bar = (f) => f.page.getByTestId("content-bottom");
async function scenario(name, fixture, walk) {
  const f = await open(fixture);
  try {
    await walk(f);
    assert.deepEqual(f.unexpected, [], `${name}: unexpected requests`);
    // Every plan read embeds the Meeting details and the admins, whichever of the two selects it uses.
    if (fixture.noPlanRead) assert.equal(f.planSelects.size, 0, `${name}: no plan read`);
    else assert.ok(f.planSelects.size > 0, `${name}: the plan was read`);
    for (const select of f.planSelects)
      assert.ok([PLAN_SELECT, PLAN_COLUMNS, COVER_SELECT].includes(select), `${name}: the plan select ${select}`);
  } finally {
    await f.close();
  }
}
const pass = (line) => console.log(`PASS: ${line}`);

try {
  const going2 = [ALEX, BEA, CY, DI];
  const hostFixture = {
    guests: going2,
    phoneInvites: [phoneRow(PAT.phone)],
    requests: [SAM],
    storedCodes: { [PAT.e164]: { code: PAT.code, name: PAT.name, sentVia: "whatsapp" } },
  };

  // --- The owner's page ---
  await scenario("owner", hostFixture, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(text(page, "You’re hosting")).toBeVisible();
    await expect(bar(f).getByRole("button")).toHaveText(["Invite", "Edit", "More"]);
    await expect(btn(page, "Edit Coffee evening")).toBeVisible();
    await expect(text(page, "Thursday 5 March 2099").or(page.getByText(/Thu 5 Mar/)).first()).toBeVisible();
    await expect(text(page, "Fixture café")).toBeVisible();
    await expect(text(page, "Bring a book")).toBeVisible();
    // Going Alex and Bea, Maybe Cy, Can’t go Di, one personal link not answered, one open-link request waiting.
    const row = "Going 2 · Maybe 1 · Can’t go 1 · 1 invited · 1 waiting";
    await expect(text(page, row)).toBeVisible();
    await expect(btn(page, `${row}. Alex and Bea`)).toBeVisible();
    await expect(page.getByText("Hosted by")).toHaveCount(0);
    assert.deepEqual(f.rpcs("plan_phone_invitations"), [{ p_plan: PLAN_ID }]);
    assert.deepEqual(f.rpcs("plan_join_requests"), [{ p_plan: PLAN_ID }]);
    // Invite opens the Invite screen for this resbite.
    await btn(page, "Invite").click();
    await expect(page).toHaveURL(new RegExp(`/invitations\\?plan=${PLAN_ID}`));
  });
  pass("owner: Invite, Edit and More; You’re hosting; the people row reads Going 2 · Maybe 1 · Can’t go 1 · 1 invited · 1 waiting; Invite opens /invitations?plan=");

  // --- More: the four rows, Mute, Cancel ---
  await scenario("more", hostFixture, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await btn(page, "More").click();
    for (const row of ["Add to calendar", "Mute this resbite", "Do this again", "Cancel resbite"])
      await expect(btn(page, row)).toBeVisible();
    await expect(btn(page, "Change my reply")).toHaveCount(0);
    await btn(page, "Mute this resbite").click();
    await expect(btn(page, "Unmute this resbite")).toBeVisible();
    await expect(btn(page, "Mute this resbite")).toHaveCount(0);
    assert.deepEqual(f.rpcs("set_plan_mute"), [{ p_plan: PLAN_ID, p_muted: true }]);
    await btn(page, "Unmute this resbite").click();
    await expect(btn(page, "Mute this resbite")).toBeVisible();
    assert.deepEqual(f.rpcs("set_plan_mute").at(-1), { p_plan: PLAN_ID, p_muted: false });
    // The cancel question sits in the sheet; Keep resbite goes back to the rows and sends nothing.
    await btn(page, "Cancel resbite").click();
    await expect(heading(page, "Cancel this resbite for everyone?")).toBeVisible();
    await expect(btn(page, "Yes, cancel resbite")).toBeVisible();
    await expect(btn(page, "Cancel just this one")).toHaveCount(0);
    await btn(page, "Keep resbite").click();
    await expect(btn(page, "Cancel resbite")).toBeVisible();
    assert.deepEqual(f.rpcs("change_plan_v4"), []);
    await btn(page, "Cancel resbite").click();
    await btn(page, "Yes, cancel resbite").click();
    await expect(text(page, "Your resbite is cancelled.")).toBeVisible();
    await expect(text(page, "Cancelled")).toBeVisible();
    const [cancel] = f.rpcs("change_plan_v4");
    assert.equal(f.rpcs("change_plan_v4").length, 1);
    assert.equal(cancel.p_plan, PLAN_ID);
    assert.equal(cancel.p_version, 1);
    assert.equal(cancel.p_cancel, true);
    assert.equal(cancel.p_stop_repeating, false);
  });
  pass("More: the four rows; Mute this resbite → set_plan_mute {p_muted: true} and the row reads Unmute this resbite; Keep resbite sends nothing; Yes, cancel resbite → change_plan_v4 {p_cancel: true, p_stop_repeating: false}");

  // --- A repeating resbite ---
  const repeating = { plan: { repeat_weeks: 1 }, guests: going2 };
  await scenario("repeating", repeating, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(text(page, "Every Thursday")).toBeVisible();
    await btn(page, "More").click();
    await btn(page, "Cancel resbite").click();
    await expect(heading(page, "Cancel this resbite for everyone?")).toBeVisible();
    await expect(text(page, "It repeats every Thursday. Everyone invited will be told.")).toBeVisible();
    await expect(btn(page, "Cancel just this one")).toBeVisible();
    await expect(btn(page, "Cancel this and stop repeating")).toBeVisible();
    await expect(btn(page, "Yes, cancel resbite")).toHaveCount(0);
    await btn(page, "Cancel this and stop repeating").click();
    await expect(text(page, "Your resbite is cancelled.")).toBeVisible();
    const [cancel] = f.rpcs("change_plan_v4");
    assert.equal(f.rpcs("change_plan_v4").length, 1);
    assert.equal(cancel.p_cancel, true);
    assert.equal(cancel.p_stop_repeating, true);
  });
  await scenario("repeating, just this one", repeating, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await btn(page, "More").click();
    await btn(page, "Cancel resbite").click();
    await btn(page, "Cancel just this one").click();
    await expect(text(page, "Your resbite is cancelled.")).toBeVisible();
    assert.deepEqual(
      f.rpcs("change_plan_v4").map((b) => [b.p_cancel, b.p_stop_repeating]),
      [[true, false]],
    );
  });
  pass("repeating: the second When line reads Every Thursday; two cancel choices; Cancel this and stop repeating → p_stop_repeating: true; Cancel just this one → false");

  // --- An ended resbite ---
  await scenario(
    "ended",
    { plan: { starts_at: "2020-03-05T15:00:00Z", ends_at: "2020-03-05T17:00:00Z", repeat_weeks: 1 }, guests: going2 },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(page.getByText(/ · Ended$/)).toBeVisible();
      await expect(text(page, "Ended")).toBeVisible();
      await expect(text(page, "Every Thursday · the next one is in My resbites")).toBeVisible();
      await expect(bar(f).getByRole("button")).toHaveText(["Do this again"]);
      for (const gone of ["More", "Invite", "Edit Coffee evening", "Cancel resbite"]) await expect(btn(page, gone)).toHaveCount(0);
      await btn(page, "Do this again").click();
      await expect(page).toHaveURL(new RegExp(`/arrange\\?again=${PLAN_ID}`));
    },
  );
  pass("ended: the When line ends · Ended, an Ended chip, Every Thursday · the next one is in My resbites; Do this again is the only action, no More; it opens the plan screen with ?again=");

  // --- A resbite that has started and not ended ---
  const startsAgo = Date.now() - hour;
  const running = { starts_at: iso(startsAgo), ends_at: iso(Date.now() + hour) };
  await scenario("running (owner)", { plan: running, guests: going2 }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(btn(page, "Edit Coffee evening")).toBeVisible();
    await expect(btn(page, "More")).toBeVisible();
    await expect(page.getByText(/ · Ended$/)).toHaveCount(0);
  });
  await scenario("running (guest)", { viewer: "guest", plan: running, guests: [ALEX] }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(page.getByRole("radiogroup", { name: "Your answer" })).toBeVisible();
    await page.getByRole("radio", { name: "Going", exact: true }).click();
    await expect(text(page, "You’re going")).toBeVisible();
    assert.deepEqual(f.rpcs("respond"), [{ p_plan: PLAN_ID, p_response: "accepted", p_version: 1 }]);
  });
  pass("running: the owner still has Edit and More; a guest’s Going is accepted (respond {p_response: accepted, p_version: 1}) and the bar reads You’re going");

  // --- An admin ---
  // This admin answered Maybe, so Can’t go is sent as "declined" (after Going it is "withdrawn", below).
  const adminFixture = { viewer: "admin", attendee: { version: 1, response: "maybe" }, guests: [ALEX, BEA] };
  await scenario("admin", adminFixture, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(text(page, "You’re an admin")).toBeVisible();
    await expect(text(page, "You’re hosting")).toHaveCount(0);
    await expect(bar(f).getByRole("button")).toHaveText(["Invite", "Edit", "More"]);
    await btn(page, "More").click();
    for (const row of ["Add to calendar", "Mute this resbite", "Do this again", "Change my reply", "Cancel resbite"])
      await expect(btn(page, row)).toBeVisible();
    // Can’t go ends the admin’s part on the server; the page is read again and shows the guest view.
    await btn(page, "Change my reply").click();
    await expect(page.getByRole("radiogroup", { name: "Your answer" })).toBeVisible();
    await page.getByRole("radio", { name: "Can’t go", exact: true }).click();
    await expect(text(page, "Hosted by Ana")).toBeVisible();
    assert.deepEqual(f.rpcs("respond"), [{ p_plan: PLAN_ID, p_response: "declined", p_version: 1 }]);
    await expect(text(page, "You’re an admin")).toHaveCount(0);
    await expect(btn(page, "Invite")).toHaveCount(0);
    await expect(text(page, "You can’t go")).toBeVisible();
    await expect(btn(page, "Cancel resbite")).toHaveCount(0);
  });
  pass("admin: You’re an admin; Invite, Edit, More; Change my reply and Cancel resbite among the rows; Can’t go → respond {p_response: declined}, then the guest page (Hosted by Ana, You can’t go, no Invite)");

  // An admin who was Going sends "withdrawn" for Can’t go; the server ends their admin part for it as for "declined",
  // and the page reloads into the guest view.
  await scenario("admin, was Going", { viewer: "admin", attendee: { version: 1, response: "accepted" }, guests: [ALEX, BEA] }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await btn(page, "More").click();
    await btn(page, "Change my reply").click();
    await page.getByRole("radio", { name: "Can’t go", exact: true }).click();
    await expect.poll(() => f.rpcs("respond")).toEqual([{ p_plan: PLAN_ID, p_response: "withdrawn", p_version: 1 }]);
    await expect(text(page, "Hosted by Ana")).toBeVisible();
    await expect(text(page, "You’re an admin")).toHaveCount(0);
    await expect(btn(page, "Invite")).toHaveCount(0);
  });
  pass("admin who was Going: Can’t go sends respond {p_response: withdrawn}, then the guest page (Hosted by Ana, no Invite)");

  // --- A guest ---
  await scenario(
    "guest",
    { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, BEA] },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(text(page, "Hosted by Ana")).toBeVisible();
      await expect(text(page, "You’re hosting")).toHaveCount(0);
      await expect(text(page, "You’re going")).toBeVisible();
      await expect(page.getByText("Fixture café")).toBeVisible();
      await expect(text(page, "Going 3 · Can’t go 0")).toBeVisible();
      // Only Add to calendar and Mute for a guest.
      await btn(page, "More").click();
      await expect(btn(page, "Add to calendar")).toBeVisible();
      await expect(btn(page, "Mute this resbite")).toBeVisible();
      await expect(btn(page, "Cancel resbite")).toHaveCount(0);
      await expect(btn(page, "Change my reply")).toHaveCount(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await expect(btn(page, "Add to calendar")).toHaveCount(0);
      // Change opens the answer sheet with the current answer; Maybe is saved and the bar follows.
      await btn(page, "Change your answer").click();
      await expect(page.getByRole("radiogroup", { name: "Your answer" })).toBeVisible();
      await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeChecked();
      await page.getByRole("radio", { name: "Maybe", exact: true }).click();
      await expect(text(page, "Maybe")).toBeVisible();
      await expect(page.getByRole("radiogroup", { name: "Your answer" })).toHaveCount(0);
      assert.deepEqual(f.rpcs("respond"), [{ p_plan: PLAN_ID, p_response: "maybe", p_version: 1 }]);
      // The people row opens the people list, where a guest has no actions.
      await page.getByRole("button", { name: /^Going 2 · Maybe 1 · Can’t go 0\./ }).click();
      await expect(page).toHaveURL(new RegExp(`/guests\\?plan=${PLAN_ID}`));
      await expect(heading(page, "People")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
    },
  );
  await scenario("guest, not answered", { viewer: "guest", guests: [ALEX] }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(text(page, "Hosted by Ana")).toBeVisible();
    // Counts only: no names, no way into the people list; the area stands in for the place.
    await expect(text(page, "Going 0 · Can’t go 0")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Going / })).toHaveCount(0);
    await expect(text(page, "Near the station")).toBeVisible();
    await expect(page.getByText("Fixture café")).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "Your answer" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveText(["Going", "Maybe", "Can’t go"]);
    await expect(btn(page, "More")).toHaveCount(0);
    await expect(btn(page, "Change your answer")).toHaveCount(0);
    assert.deepEqual(f.rpcs("respond"), []);
  });
  pass("guest: Hosted by Ana; You’re going + Change opens the answer sheet (Going selected) and Maybe saves; More has Add to calendar and Mute only; the people row opens a list without actions; an unanswered guest sees counts only, the Your answer control and no More");

  // --- The people list ---
  await scenario(
    "people",
    {
      guests: going2,
      phoneInvites: [phoneRow(PAT.phone), phoneRow(UNSTORED.phone)],
      requests: [SAM],
      storedCodes: { [PAT.e164]: { code: PAT.code, name: PAT.name, sentVia: "whatsapp" } },
    },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/guests?plan=${PLAN_ID}`);
      await expect(heading(page, "People")).toBeVisible();
      const groups = ["Going · 2", "Maybe · 1", "Can’t go · 1", "Invited, not answered yet · 2", "Waiting for you · 1"];
      for (const group of groups) await expect(heading(page, group)).toBeVisible();
      await expect(page.getByRole("heading")).toHaveText(["People", ...groups]);
      await expect(text(page, "Invited by WhatsApp")).toBeVisible();
      await expect(text(page, "Invited by link")).toBeVisible();
      await expect(text(page, "Asked through the link")).toBeVisible();
      // Make admin: only on a Going guest; the host then sees the badge.
      await btn(page, "Actions for Bea").click();
      for (const row of ["Make admin", "Remove from this resbite"]) await expect(btn(page, row)).toBeVisible();
      await btn(page, "Make admin").click();
      await expect(text(page, "Admin")).toBeVisible();
      assert.deepEqual(f.rpcs("appoint_admin"), [{ p_plan: PLAN_ID, p_user: "g2" }]);
      await btn(page, "Actions for Bea").click();
      await expect(btn(page, "Remove as admin")).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, "Actions for Cy").click();
      await expect(btn(page, "Make admin")).toHaveCount(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      // Send again offers the app the invitation went by, and only for the code this phone holds.
      await btn(page, "Actions for Pat Lee").click();
      await expect(btn(page, "Send again on WhatsApp")).toBeVisible();
      await expect(btn(page, "Send again on Messages")).toHaveCount(0);
      await expect(btn(page, "Remove")).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, `Actions for ${UNSTORED.label}`).click();
      await expect(btn(page, "Send again on WhatsApp")).toHaveCount(0);
      await expect(btn(page, "Send again on Messages")).toHaveCount(0);
      await expect(btn(page, "Remove")).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      // Approve sends the join-request decision, and Sam joins the Going group.
      await btn(page, "Actions for Sam Reed").click();
      await expect(btn(page, "Decline")).toBeVisible();
      await btn(page, "Approve").click();
      await expect(heading(page, "Waiting for you · 1")).toHaveCount(0);
      await expect(heading(page, "Going · 3")).toBeVisible();
      assert.deepEqual(f.rpcs("decide_join_request"), [{ p_plan: PLAN_ID, p_user: "r1", p_approve: true }]);
    },
  );
  pass("people: the groups in order with counts; Actions for Bea → Make admin → appoint_admin and the Admin badge; Remove as admin offered after; Send again on WhatsApp only for the code this phone holds; Approve → decide_join_request {p_approve: true} and Sam moves to Going");

  // --- The idea page ---
  const painting = {
    id: "painting",
    title: "Painting",
    categories: ["creative", "mindful"],
    description: "Paint something together.",
    artwork_key: "painting",
    source_ids: ["fixture"],
    published: true,
    duration_minutes: 90,
    tips: ["Bring an apron."],
  };
  await scenario("idea", { activities: [painting], noPlanRead: true }, async (f) => {
    const { page } = f;
    await goto(f, "/activity/painting", "Painting");
    const picture = page.getByRole("img", { name: "Painting", exact: true });
    await expect(picture).toBeVisible();
    const [back, cover] = [await btn(page, "Back").boundingBox(), await picture.boundingBox()];
    assert.ok(back && cover, "Back and the picture are on screen");
    assert.ok(
      back.x >= cover.x && back.y >= cover.y && back.x + back.width <= cover.x + cover.width && back.y + back.height <= cover.y + cover.height,
      `Back sits over the image: ${JSON.stringify({ back, cover })}`,
    );
    await expect(text(page, "90 minutes")).toBeVisible();
    await expect(text(page, "Bring an apron.")).toBeVisible();
    await btn(page, "Use idea").click();
    await expect(page).toHaveURL(/\/arrange\?activity=painting/);
  });
  pass("idea: Back sits over the image, the chips, description and tips follow; Use idea opens the plan screen with ?activity=painting");

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
