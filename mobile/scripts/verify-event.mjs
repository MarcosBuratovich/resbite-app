// Creating a resbite, Plan 3: the resbite page for every role and state, its More sheet, the people list and the
// idea page. Every Supabase request is intercepted; nothing is sent. Each scenario builds its own fixture, walks
// the screen and asserts what is visible, the roles and the requests the app made (names and arguments).
//   owner      the page (Invite, Edit, More; You’re hosting; the people row), More (four rows, mute, cancel)
//   cancel     a refused cancel stays in the sheet with its error; a fresh sheet shows no old error; a cancel refused
//              because the resbite has just ended closes the sheet over the ended page
//   repeating  Every Thursday; the two cancel choices
//   ended      · Ended; Do this again alone; no More; the people list (headed by the host's own Hosting row, which
//              Going's count includes) without host actions: only Connect on Resbite stays (CO rule 7)
//   running    Edit is there and a guest reply is accepted
//   admin      You’re an admin; Invite opens the contacts and the link; the invitations and requests (Approve);
//              Edit’s new photo goes into the owner’s folder; Change my reply; Can’t go → the guest page
//   guest      Hosted by Ana; You’re going + Change; an unanswered guest sees the server’s counts, Your answer, and More
//              holding Report or block alone
//   people     the groups (Going counts the owner's Hosting row, Ruling 21), Make admin (and its refusal), Remove as
//              admin on a Maybe admin, Approve, Send again only for a code this phone holds, an app invitation’s Remove
// Nobody here is connected with the viewer (plan_connection_states answers {}), so every answered row but the
// viewer's own, the owner's included, offers Connect on Resbite before any host action.
//   chat       Task 8 (CH-P14, K-S13): the Chat row after the people row and Bring someone, with the latest line and the
//              dot in words; its tap opens /chat?series=; closed it reads Chat closed · 23 messages with no dot, and a
//              closed chat with no message has no row; a refused (42501) or failing chat_summary hides the row while the
//              page still renders. Unless a scenario gives `chat`, chat_summary refuses (not in the chat).
//              Fix round 1: a failed re-read on return keeps the row, a refusal removes it (H36); the line is one
//              cleaned line (H37 D1); a pending invitee reads the whole "Everyone invited" announcement (H37 D3).
//   group      chat plan 2, Task 4: More's Leave this group on a group (never a one-off), also for a member who hasn't
//              answered and on an ended page with the chat open; the Chat row's Group chat; a pending guest's people
//              list on a group (everyone, Connect, no number); a bringer's own invitee and link; Leave from the
//              resbite page lands on My resbites, which reads its plans again without the group (I10), and offline it
//              stays in the confirm; a group's failed chat re-read after an answer keeps the row (challenge NOTE 6)
//   safety     chat plan 3, Task 5: the people sheet's Report and Block (Block only for a waiting join request); a
//              blocked person's row reads Blocked with no Connect; with my_blocks failing no row offers Block or Connect
//              and nothing says why (N13); Block then Unblock read my_blocks and the states again (NOTE 2); an unanswered
//              invitee's Report or block beside the announcement and in More (B1, B4, R-Q1, I-2), also when the
//              overview fails, and no row at all with nobody to name. Fix round 1 (ruling SR6): Keep after a block
//              confirm puts focus back on its Block row (the people list, the resbite page); a host blocking a waiting
//              join requester reads the guest's confirm; a block the server took stays known when my_blocks then fails
//   edges      /guests and /event without a plan; Back with no history; a failed read offers Try again
//   idea       Back over the image, Use idea
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { AUTH_STORAGE_KEY, inOrder, quietReminders } from "./qa-helpers.mjs";

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
// The plan screen (after Do this again or Use idea) reads the cover columns too, and a cover change its revision.
const COVER_SELECT = "cover_path,cover_description,cover_revision";
const COVER_REVISION_SELECT = "cover_path,cover_revision";
// The guest-list and own-row reads (src/services/rsvp.ts) and the reminder sync's (deviceReminders), and the mutes'.
// My resbites reads every attendee row of the account's plans (Leave lands there, I10).
const MY_ATTENDEES = "plan_id,user_id,response,version,profiles(display_name)";
const ATTENDEE_SELECTS = ["user_id,response,brought_by,level,profiles(display_name)", "version,response", "plan_id,response", MY_ATTENDEES];
const MUTE_SELECT = "series_id";
// ...and the named-columns read the plan gateway sends (src/services/plans.ts `planColumns`, used by the reminder sync).
// ...and My resbites' list read (src/services/plans.ts `planListColumns`).
const PLAN_LIST = "*,plan_admins(user_id)";
const PLAN_COLUMNS =
  "id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,status,version,owner_id,has_meeting_details,guest_note,guest_note_at,area,place_tbd,repeat_weeks,series_id,repeats_from,bring_invites,bring_levels,plan_meeting_details(note),plan_admins(user_id)";
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
// Invited in the app, not answered yet.
const ELI = g("g5", "Eli", "pending");
const CODE_STORE = `resbite.invite-codes.v1.${user.id}`;
// A 1×1 PNG, for the signed cover links.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const errors = [];

/** A PNG of the given size, drawn in the page (the cover chooser takes it as a photo). */
async function syntheticPng(page, width, height) {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#e07a5f";
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height],
  );
  return Buffer.from(base64, "base64");
}

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
    admins: [...(viewer === "admin" ? [user.id] : []), ...(world.admins ?? [])],
    phoneInvites: world.phoneInvites ?? [],
    requests: world.requests ?? [],
    muted: Boolean(world.muted),
    // The plan read fails while this is set (a lost connection).
    failPlanRead: Boolean(world.failPlanRead),
    // The next cancels are refused (42501), as for someone who is no longer a host.
    refuseCancels: world.refuseCancels ?? 0,
    // The resbite ends just as the host cancels: the cancel is refused (22023) and the plan reads as ended.
    endsOnCancel: Boolean(world.endsOnCancel),
    // appoint_admin refuses these people: they have never used the app.
    neverUsedApp: world.neverUsedApp ?? [],
    // chat_summary's answer (Task 8): a summary, "refused" (42501 'Not in this chat', the default) or "failed" (a 500).
    chat: world.chat ?? "refused",
    // The connection drops: the answer's reads and the chat's fail as a lost connection would (fix round 2).
    offline: false,
    // my_chat_overview's answer: nothing unread and no announcement unless a scenario gives one; "failed" is a 500.
    overview: world.overview ?? { chats: {}, announcements: {}, names: {} },
    // Chat plan 3: the people the viewer blocked (my_blocks), or "failed" (a 500); the viewer's connection states
    // (plan_connection_states), which a block ends; the host's name as their profile gives it. `blocksFailAfterBlock`:
    // once a block went through, every my_blocks read fails (fix round 1, Q2).
    blocked: world.blocked ?? [],
    blocksFailAfterBlock: Boolean(world.blocksFailAfterBlock),
    // block_user answers `stored` (server review M7): true for a block unless `blockNotStored` (the person stopped
    // being readable, so nothing was stored), false for an unblock.
    blockNotStored: Boolean(world.blockNotStored),
    // Final fix wave (I1): once a block went through, chat_summary answers what the server shows the blocker then
    // (`chatAfterBlock`: the line before the blocked person's), or fails (`chatFailsAfterBlock`).
    chatAfterBlock: world.chatAfterBlock ?? null,
    chatFailsAfterBlock: Boolean(world.chatFailsAfterBlock),
    blockedOnce: false,
    pairs: { ...(world.pairs ?? {}) },
    hostName: world.hostName ?? HOST.name,
    // my_bring_allowance's answer for a guest, when the scenario lets them bring.
    allowance: world.allowance ?? null,
    // Chat plan 2: the series is a group the viewer is in (series_is_group), so every member's row is read, whatever
    // the viewer's reply; `left` once leave_series went through, and `failLeaves` lost as a lost connection would.
    group: Boolean(world.group),
    left: false,
    failLeaves: world.failLeaves ?? 0,
    // How long leave_series waits before its answer (UI Q4); after a leave, My resbites' list read fails (UI Q3).
    delayLeaves: world.delayLeaves ?? 0,
    // How long series_is_group takes to answer (ruling GR6 M7: the page never waits for it).
    delayGroup: world.delayGroup ?? 0,
    failListAfterLeave: Boolean(world.failListAfterLeave),
    // The links a guest sent bringing someone (plan_phone_invitations answers a guest with their own only).
    guestLinks: world.guestLinks ?? [],
    // How many times My resbites read its list of plans.
    listReads: 0,
    uploads: [],
  };
  const log = [];
  const planSelects = new Set();
  const attendeeSelects = new Set();
  const muteSelects = new Set();
  // What a route handler found wrong (an assert there would only fail the request, not the scenario).
  const mismatches = [];
  const unexpected = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await quietReminders(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ key, s, store }) => {
      sessionStorage.setItem(key, JSON.stringify(s));
      if (store.value && !sessionStorage.getItem(store.key)) sessionStorage.setItem(store.key, JSON.stringify(store.value));
    },
    {
      key: AUTH_STORAGE_KEY,
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
      if (url.searchParams.get("id") === `eq.${HOST.id}`) return reply({ display_name: state.hostName });
      return reply({ id: user.id, display_name: "Fixture", avatar_path: null, avatar_revision: 0 });
    }
    // A cover: the upload, its signed link and the picture behind it.
    if (path.startsWith("/storage/v1/object/sign/plan-covers/") && req.method() === "POST")
      return reply({ signedURL: "/object/sign/plan-covers/fixture.jpg?token=fixture" });
    if (path === "/storage/v1/object/sign/plan-covers/fixture.jpg")
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
    if (path.startsWith("/storage/v1/object/plan-covers/")) {
      state.uploads.push(decodeURIComponent(path.slice("/storage/v1/object/plan-covers/".length)));
      return reply({ Key: `plan-covers/${state.uploads.at(-1)}`, Id: "fixture" });
    }
    if (path === "/rest/v1/activities") return reply(world.activities ?? []);
    if (path === "/rest/v1/plan_mutes") {
      muteSelects.add(url.searchParams.get("select"));
      return reply(state.muted ? [{ series_id: SERIES_ID }] : []);
    }
    if (path === "/rest/v1/plans") {
      const select = url.searchParams.get("select");
      planSelects.add(select);
      if (state.failPlanRead) return reply({ message: "Fixture: the read failed" }, 500);
      const insider = state.plan.owner_id === user.id || ["accepted", "maybe"].includes(state.attendee?.response);
      if (select === PLAN_LIST) state.listReads++;
      if (select === PLAN_LIST && state.left && state.failListAfterLeave) return reply({ message: "Fixture: the list read failed" }, 500);
      // After a leave, My resbites no longer lists the group's occurrence.
      if (!one && state.left) return reply([]);
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
      attendeeSelects.add(select);
      if (state.offline && select === "version,response") return route.abort("internetdisconnected");
      if (select === "plan_id,response") return reply(state.attendee ? [{ plan_id: PLAN_ID, response: state.attendee.response }] : []);
      if (select === MY_ATTENDEES)
        return reply(
          state.left || !state.attendee
            ? []
            : [{ plan_id: PLAN_ID, user_id: user.id, response: state.attendee.response, version: state.attendee.version, profiles: { display_name: "Fixture" } }],
        );
      if (one) return reply(state.attendee);
      const own = state.attendee ? [g(user.id, "Fixture", state.attendee.response)] : [];
      // A group's member reads every member's row, answered or not (G-B5).
      if (state.group) return reply([...state.guests, ...own]);
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
        if (body.p_version !== state.attendee.version)
          mismatches.push(`respond p_version ${body.p_version}, the row is at ${state.attendee.version}`);
        state.attendee = { version: state.attendee.version + 1, response: body.p_response };
        // The server ends an admin's part when they can’t go.
        if (viewer === "admin" && ["declined", "withdrawn"].includes(body.p_response)) state.admins = [];
        return reply(state.attendee.version);
      }
      case "change_plan_v4":
        if (body.p_cancel && state.endsOnCancel) {
          state.plan = { ...state.plan, starts_at: iso(Date.now() - 3 * hour), ends_at: iso(Date.now() - hour) };
          return reply({ code: "22023", message: "Plan unavailable" }, 400);
        }
        if (body.p_cancel && state.refuseCancels > 0) {
          state.refuseCancels--;
          return reply({ code: "42501", message: "Host required" }, 403);
        }
        if (body.p_cancel) {
          state.plan = { ...state.plan, status: "cancelled", version: state.plan.version + 1 };
          return reply(state.plan.version);
        }
        return reply({ message: "Fixture: edits are not under test" }, 400);
      case "appoint_admin":
        if (state.neverUsedApp.includes(body.p_user))
          return reply({ code: "22023", message: "Only a guest who uses the app can be an admin" }, 400);
        state.admins = [...state.admins, body.p_user];
        return none();
      case "remove_admin":
        state.admins = state.admins.filter((id) => id !== body.p_user);
        return none();
      // As the server does: a host reads every link; a guest only the links they sent bringing someone (none here).
      case "plan_phone_invitations":
        return reply(state.plan.owner_id === user.id || state.admins.includes(user.id) ? state.phoneInvites : state.guestLinks);
      case "plan_join_requests":
        return reply(state.requests);
      // The chain (circles of trust): nobody here was brought, and no guest sent a link. As the server does, a guest
      // gets no guests' links.
      case "plan_bringers":
        return reply({});
      case "plan_brought_invitations":
        return state.plan.owner_id === user.id || state.admins.includes(user.id)
          ? reply([])
          : reply({ code: "42501", message: "Plan owner required" }, 403);
      // The server's counts for an invitee who hasn't answered (plan_people_counts): every guest row, the viewer's too.
      case "plan_people_counts": {
        const all = [...state.guests, ...(state.attendee ? [g(user.id, "Fixture", state.attendee.response)] : [])];
        const n = (responses) => all.filter((r) => responses.includes(r.response)).length;
        return reply({ going: n(["accepted"]), maybe: n(["maybe"]), cant_go: n(["declined", "withdrawn"]) });
      }
      // The Invite screen's event link.
      case "plan_link":
        return reply("AAAAAAAAAAAAAAAAAAAAA1");
      // Connections: the viewer is connected with nobody here, so every answered row offers Connect on Resbite, and
      // Invite people shows no "Your connections" (verify-connections covers it).
      case "plan_connection_states":
        return reply(state.pairs);
      // Chat plan 3: the viewer's blocks; a block ends any connection between the two (G-B1), and unblocking brings
      // none back; the reports.
      case "my_blocks":
        if (state.blocked === "failed" || (state.blocksFailAfterBlock && state.blockedOnce))
          return reply({ message: "Fixture: the blocks read failed" }, 500);
        return reply(state.blocked.map((id) => ({ user_id: id, name: null, at: "2099-02-01T10:00:00Z" })));
      case "block_user":
        state.blockedOnce = true;
        if (Array.isArray(state.blocked)) {
          state.blocked = state.blocked.filter((id) => id !== body.p_user);
          if (body.p_block && !state.blockNotStored) state.blocked.unshift(body.p_user);
        }
        delete state.pairs[body.p_user];
        return reply(body.p_block === true && !state.blockNotStored);
      case "report_message":
      case "report_user":
        return none();
      case "my_connections":
        return reply({ requests: [], connected: [] });
      case "set_plan_cover_if_current": {
        // As the server does: a cover only from the plan owner's folder, and only one that was uploaded.
        if (body.p_path !== null && (!body.p_path.startsWith(`${state.plan.owner_id}/${body.p_plan}/`) || !state.uploads.includes(body.p_path)))
          return reply({ code: "42501", message: "Own uploaded cover required" }, 403);
        if (state.plan.cover_path !== body.p_expected_path || state.plan.cover_revision !== body.p_expected_revision)
          return reply({ code: "40001", message: "The cover changed elsewhere" }, 409);
        state.plan = { ...state.plan, cover_path: body.p_path, cover_revision: state.plan.cover_revision + 1, cover_description: "" };
        return reply({ cover_path: state.plan.cover_path, cover_revision: state.plan.cover_revision });
      }
      // Task 8: the Chat row reads the series' summary (K-S13).
      case "chat_summary":
        if (body.p_series !== state.plan.series_id) mismatches.push(`chat_summary p_series ${body.p_series}`);
        if (state.offline) return route.abort("internetdisconnected");
        if (state.chat === "refused") return reply({ code: "42501", message: "Not in this chat", details: null, hint: null }, 403);
        if (state.chat === "failed" || (state.chatFailsAfterBlock && state.blockedOnce))
          return reply({ message: "Fixture: the chat read failed" }, 500);
        if (state.chatAfterBlock && state.blockedOnce) return reply({ ...state.chat, ...state.chatAfterBlock });
        return reply(state.chat);
      // The chat screen a Chat row tap opens: an empty page, marked read. Its socket is refused below.
      case "chat_messages":
      case "chat_messages_since":
        if (state.chat === "refused") return reply({ code: "42501", message: "Not in this chat", details: null, hint: null }, 403);
        return reply({ rows: [], names: {}, as_of: new Date().toISOString() });
      case "mark_chat_read":
        return none();
      case "my_chat_overview": {
        if (state.overview === "failed") return reply({ message: "Fixture: the overview failed" }, 500);
        // As the server does: nothing by or about someone the viewer blocked (plan 3).
        const blocked = Array.isArray(state.blocked) ? state.blocked : [];
        const announcements = Object.fromEntries(Object.entries(state.overview.announcements ?? {}).filter(([, a]) => !blocked.includes(a.author_id)));
        const inviters = Object.fromEntries(Object.entries(state.overview.inviters ?? {}).filter(([, id]) => !blocked.includes(id)));
        return reply({ ...state.overview, announcements, inviters });
      }
      // Chat plan 2: whether the series is a group the viewer is in (I4), and Leave group (G-N13, I10).
      case "series_is_group":
        if (body.p_series !== state.plan.series_id) mismatches.push(`series_is_group p_series ${body.p_series}`);
        if (state.delayGroup) await new Promise((r) => setTimeout(r, state.delayGroup));
        return reply(state.group && !state.left);
      case "leave_series":
        if (body.p_series !== state.plan.series_id) mismatches.push(`leave_series p_series ${body.p_series}`);
        if (state.delayLeaves) await new Promise((r) => setTimeout(r, state.delayLeaves));
        if (state.failLeaves > 0) {
          state.failLeaves--;
          return route.abort("internetdisconnected");
        }
        state.left = true;
        return none();
      // My resbites' open-link requests (Leave lands there): none.
      case "my_join_requests":
        return reply([]);
      case "my_bring_allowance":
        return state.allowance ? reply(state.allowance) : reply({ code: "42501", message: "Not invited" }, 403);
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
  // The chat's Realtime socket never connects here (verify-chat covers it): nothing leaves the page.
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => ws.close());
  return {
    page,
    state,
    log,
    rpcs,
    planSelects,
    attendeeSelects,
    muteSelects,
    mismatches,
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
    assert.deepEqual(f.mismatches, [], `${name}: requests the fixture found wrong`);
    // Every plan read embeds the Meeting details and the admins, whichever of the two selects it uses.
    if (fixture.noPlanRead) assert.equal(f.planSelects.size, 0, `${name}: no plan read`);
    else assert.ok(f.planSelects.size > 0, `${name}: the plan was read`);
    for (const select of f.planSelects)
      assert.ok([PLAN_SELECT, PLAN_COLUMNS, COVER_SELECT, COVER_REVISION_SELECT, PLAN_LIST].includes(select), `${name}: the plan select ${select}`);
    // The guest list and the mutes are served by their selects too: a drift would otherwise be answered with defaults.
    for (const select of f.attendeeSelects) assert.ok(ATTENDEE_SELECTS.includes(select), `${name}: the attendees select ${select}`);
    for (const select of f.muteSelects) assert.equal(select, MUTE_SELECT, `${name}: the plan_mutes select`);
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
    await expect(text(page, "Thu 5 Mar · 15:00 to 17:00")).toBeVisible();
    await expect(text(page, "Fixture café")).toBeVisible();
    await expect(text(page, "Bring a book")).toBeVisible();
    // Going Alex and Bea, Maybe Cy, Can’t go Di, one personal link not answered, one open-link request waiting.
    const row = "Going 2 · Maybe 1 · Can’t go 1 · 1 invited · 1 waiting";
    await expect(text(page, row)).toBeVisible();
    await expect(btn(page, `${row}. Alex and Bea`)).toBeVisible();
    await expect(page.getByText("Hosted by")).toHaveCount(0);
    assert.deepEqual(f.rpcs("plan_phone_invitations"), [{ p_plan: PLAN_ID }]);
    // With the links their guests sent bringing someone, counted in "N invited" (none here).
    assert.deepEqual(f.rpcs("plan_brought_invitations"), [{ p_plan: PLAN_ID }]);
    assert.deepEqual(f.rpcs("plan_join_requests"), [{ p_plan: PLAN_ID }]);
    // The host reads every guest row, so the counts come from them, not from plan_people_counts.
    assert.deepEqual(f.rpcs("plan_people_counts"), []);
    assert.ok(f.attendeeSelects.has("user_id,response,brought_by,level,profiles(display_name)"), "the guest list was read");
    assert.ok(f.muteSelects.has(MUTE_SELECT), "the mutes were read");
    // Invite opens the Invite screen for this resbite.
    await btn(page, "Invite").click();
    await expect(page).toHaveURL(new RegExp(`/invitations\\?plan=${PLAN_ID}`));
  });
  pass("owner: Invite, Edit and More; You’re hosting; the When line reads Thu 5 Mar · 15:00 to 17:00; the people row reads Going 2 · Maybe 1 · Can’t go 1 · 1 invited · 1 waiting (no plan_people_counts); Invite opens /invitations?plan=");

  // --- A refused cancel ---
  await scenario("cancel refused", { ...hostFixture, refuseCancels: 1 }, async (f) => {
    const { page } = f;
    const sheet = page.locator("[aria-modal]");
    const refusal = "Your account can’t cancel this plan.";
    await goto(f, `/event?plan=${PLAN_ID}`);
    await btn(page, "More").click();
    await btn(page, "Cancel resbite").click();
    await btn(page, "Yes, cancel resbite").click();
    // The question stays open, with the reason inside the sheet.
    await expect(sheet.getByText(refusal, { exact: true })).toBeVisible();
    await expect(heading(page, "Cancel this resbite for everyone?")).toBeVisible();
    await expect(btn(page, "Yes, cancel resbite")).toBeEnabled();
    await expect(text(page, "Your resbite is cancelled.")).toHaveCount(0);
    // Closed and opened again, the sheet starts without the old error.
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    await expect(heading(page, "Cancel this resbite for everyone?")).toHaveCount(0);
    await btn(page, "More").click();
    await expect(btn(page, "Cancel resbite")).toBeVisible();
    await expect(sheet.getByText(refusal, { exact: true })).toHaveCount(0);
    await btn(page, "Cancel resbite").click();
    await btn(page, "Yes, cancel resbite").click();
    await expect(text(page, "Your resbite is cancelled.")).toBeVisible();
    await expect(heading(page, "Cancel this resbite for everyone?")).toHaveCount(0);
    assert.deepEqual(f.rpcs("change_plan_v4").map((b) => b.p_cancel), [true, true]);
  });
  pass("cancel refused: Yes, cancel resbite refused (42501) keeps the question open with Your account can’t cancel this plan. inside the sheet; More opened again shows no old error; the second try cancels and closes the sheet");

  // --- A cancel refused because the resbite has just ended ---
  await scenario("cancel after the end", { ...hostFixture, endsOnCancel: true }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await btn(page, "More").click();
    await btn(page, "Cancel resbite").click();
    await btn(page, "Yes, cancel resbite").click();
    // The reload shows the end: the question closes and the reason, said with the end, stays on the page.
    await expect(heading(page, "Cancel this resbite for everyone?")).toHaveCount(0);
    await expect(page.locator("[aria-modal]")).toHaveCount(0);
    await expect(text(page, "This resbite has ended or is no longer available.")).toBeVisible();
    await expect(page.getByText(/ · Ended$/)).toBeVisible();
    await expect(bar(f).getByRole("button")).toHaveText(["Do this again"]);
    assert.deepEqual(f.rpcs("change_plan_v4").map((b) => b.p_cancel), [true]);
  });
  pass("cancel after the end: Yes, cancel resbite refused (22023) as the resbite ends closes the sheet; the page says This resbite has ended or is no longer available. under the · Ended When line, with Do this again alone");

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
      // The people list stays readable for the host, headed by their own Hosting row (counted in Going), with no host
      // actions: only Connect on Resbite stays after the end (CO rule 7), and nothing on the host's own row.
      await page.getByRole("button", { name: /^Going 2 · Maybe 1 · Can’t go 1\./ }).click();
      await expect(heading(page, "Going · 3")).toBeVisible();
      await expect(page.getByLabel("Fixture, Hosting", { exact: true })).toBeVisible();
      await expect(btn(page, "Actions for Fixture")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(4);
      await btn(page, "Actions for Alex").click();
      await expect(btn(page, "Connect on Resbite")).toBeVisible();
      for (const gone of ["Make admin", "Remove from this resbite"]) await expect(btn(page, gone)).toHaveCount(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, "Back").click();
      await expect(heading(page, "Coffee evening")).toBeVisible();
      await btn(page, "Do this again").click();
      await expect(page).toHaveURL(new RegExp(`/arrange\\?again=${PLAN_ID}`));
    },
  );
  pass("ended: the When line ends · Ended, an Ended chip, Every Thursday · the next one is in My resbites; Do this again is the only action, no More; the people list opens with the host's Hosting row (Going · 3) and no host actions, only Connect on Resbite; Do this again opens the plan screen with ?again=");

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
  // An admin hosts as the owner does: Invite, the invitations not answered and the requests waiting, Edit.
  // Bea is an admin too, whom only the owner may act on.
  const hostingAdmin = {
    viewer: "admin",
    attendee: { version: 1, response: "accepted" },
    guests: [ALEX, BEA, CY],
    admins: [BEA.user_id],
    phoneInvites: [phoneRow(PAT.phone)],
    requests: [SAM],
  };
  await scenario("admin invites", hostingAdmin, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(text(page, "You’re an admin")).toBeVisible();
    await btn(page, "Invite").click();
    await expect(page).toHaveURL(new RegExp(`/invitations\\?plan=${PLAN_ID}`));
    await expect(heading(page, "Invite people")).toBeVisible();
    // The contacts (the Pick step), then the event link section; no refusal.
    await expect(btn(page, "Invite 0")).toBeVisible();
    await expect(heading(page, "Or share the event link")).toBeVisible();
    for (const control of ["Share link", "Copy link", "Turn off this link"]) await expect(btn(page, control)).toBeEnabled();
    await expect(page.getByText(/^Only a host can invite/)).toHaveCount(0);
    assert.deepEqual(f.rpcs("plan_link"), [{ p_plan: PLAN_ID }]);
  });
  pass("admin invites: Invite opens Invite people with the contacts (Invite 0) and Or share the event link (Share, Copy, Turn off; plan_link read once), no refusal");

  await scenario("admin people", hostingAdmin, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    // The admin reads the invitations and the requests, so the row counts them as the owner's does.
    const row = "Going 3 · Maybe 1 · Can’t go 0 · 1 invited · 1 waiting";
    await expect(text(page, row)).toBeVisible();
    assert.deepEqual(f.rpcs("plan_phone_invitations"), [{ p_plan: PLAN_ID }]);
    assert.deepEqual(f.rpcs("plan_join_requests"), [{ p_plan: PLAN_ID }]);
    assert.deepEqual(f.rpcs("plan_people_counts"), []);
    await page.getByRole("button", { name: new RegExp(`^${row}\\.`) }).click();
    await expect(heading(page, "People")).toBeVisible();
    // Going counts Ana's Hosting row, which heads it, as well as the three guests.
    const groups = ["Going · 4", "Maybe · 1", "Invited, not answered yet · 1", "Waiting for you · 1"];
    await expect(page.getByRole("heading")).toHaveText(["People", ...groups]);
    await expect(page.getByLabel("Ana, Hosting", { exact: true })).toBeVisible();
    // The owner's row: no host action for an admin, only Connect.
    await btn(page, "Actions for Ana").click();
    await expect(btn(page, "Connect on Resbite")).toBeVisible();
    await expect(btn(page, "Remove from this resbite")).toHaveCount(0);
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    // Another admin: no host actions for an admin who isn't the owner, only Connect.
    await btn(page, "Actions for Bea").click();
    await expect(btn(page, "Connect on Resbite")).toBeVisible();
    for (const gone of ["Make admin", "Remove as admin", "Remove from this resbite"]) await expect(btn(page, gone)).toHaveCount(0);
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    await btn(page, "Actions for Alex").click();
    await expect(btn(page, "Remove from this resbite")).toBeVisible();
    await expect(btn(page, "Make admin")).toHaveCount(0);
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    // Approve sends the decision, and Sam joins the Going group.
    await btn(page, "Actions for Sam Reed").click();
    await btn(page, "Approve").click();
    await expect(heading(page, "Waiting for you · 1")).toHaveCount(0);
    await expect(heading(page, "Going · 5")).toBeVisible();
    assert.deepEqual(f.rpcs("decide_join_request"), [{ p_plan: PLAN_ID, p_user: "r1", p_approve: true }]);
  });
  pass("admin people: the row reads Going 3 · Maybe 1 · Can’t go 0 · 1 invited · 1 waiting (plan_phone_invitations and plan_join_requests read); the list has Going · 4 under Ana's Hosting row, Invited and Waiting for you; only Connect on the owner and on another admin; Approve → decide_join_request {p_approve: true} and Sam moves to Going · 5");

  await scenario("admin cover", hostingAdmin, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await btn(page, "Edit Coffee evening").click();
    await expect(heading(page, "Edit resbite")).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await btn(page, "Add cover photo").click();
    await (await chooser).setFiles({ name: "cover.png", mimeType: "image/png", buffer: await syntheticPng(page, 1200, 800) });
    await expect(text(page, "Cover photo saved.")).toBeVisible();
    // Into the owner's folder (the policies and set_plan_cover_if_current want it there), not the admin's.
    assert.equal(f.state.uploads.length, 1);
    assert.match(f.state.uploads[0], new RegExp(`^${HOST.id}/${PLAN_ID}/[0-9a-f-]+\\.jpg$`));
    const [link] = f.rpcs("set_plan_cover_if_current");
    assert.deepEqual(link, { p_plan: PLAN_ID, p_path: f.state.uploads[0], p_expected_path: null, p_expected_revision: 0 });
    assert.equal(f.state.plan.cover_path, f.state.uploads[0]);
  });
  pass("admin cover: Edit → Add cover photo uploads into the owner’s folder (33333333-…/<plan>/<file>.jpg) and set_plan_cover_if_current links it; Cover photo saved.");

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
    // A guest who can’t go keeps Mute, but not Add to calendar (UX3’s calendar rule).
    await btn(page, "More").click();
    await expect(btn(page, "Mute this resbite")).toBeVisible();
    await expect(btn(page, "Add to calendar")).toHaveCount(0);
  });
  pass("admin: You’re an admin; Invite, Edit, More; Change my reply and Cancel resbite among the rows; Can’t go → respond {p_response: declined}, then the guest page (Hosted by Ana, You can’t go, no Invite) whose More has Mute but no Add to calendar");

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
      // The people row opens the people list, headed by Ana's Hosting row (counted in Going), where a guest has no
      // host actions: Connect on Resbite on the others' rows, the host's included, and nothing on their own.
      await page.getByRole("button", { name: /^Going 2 · Maybe 1 · Can’t go 0\./ }).click();
      await expect(page).toHaveURL(new RegExp(`/guests\\?plan=${PLAN_ID}`));
      await expect(heading(page, "People")).toBeVisible();
      await expect(page.getByRole("heading")).toHaveText(["People", "Going · 3", "Maybe · 1"]);
      await expect(page.getByLabel("Ana, Hosting", { exact: true })).toBeVisible();
      await expect(btn(page, "Actions for Fixture")).toHaveCount(0);
      await btn(page, "Actions for Ana").click();
      await expect(btn(page, "Connect on Resbite")).toBeVisible();
      await expect(btn(page, "Remove from this resbite")).toHaveCount(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, "Actions for Bea").click();
      await expect(btn(page, "Connect on Resbite")).toBeVisible();
      await expect(btn(page, "Remove from this resbite")).toHaveCount(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      // An answered guest reads every row: no plan_people_counts.
      assert.deepEqual(f.rpcs("plan_people_counts"), []);
      // ...and not the links they sent bringing someone (circles of trust): this resbite's circle is Nobody and they
      // brought nobody, so there are none to read (verify-circle reads them where the circle lets guests bring).
      assert.deepEqual(f.rpcs("plan_phone_invitations"), [], "no links read for a guest who can't have any");
    },
  );
  await scenario("guest, not answered", { viewer: "guest", guests: going2 }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(text(page, "Hosted by Ana")).toBeVisible();
    // The server's counts (they read only their own row): no names, no way into the people list; the area stands in
    // for the place.
    await expect(text(page, "Going 2 · Maybe 1 · Can’t go 1")).toBeVisible();
    assert.deepEqual(f.rpcs("plan_people_counts"), [{ p_plan: PLAN_ID }]);
    await expect(page.getByRole("button", { name: /^Going / })).toHaveCount(0);
    await expect(text(page, "Near the station")).toBeVisible();
    await expect(page.getByText("Fixture café")).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "Your answer" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveText(["Going", "Maybe", "Can’t go"]);
    // Plan 3 (B4, I-2): More beside the answer control, holding Report or block alone (Ana, the host the byline names).
    await btn(page, "More").click();
    await expect(btn(page, "Report or block")).toBeVisible();
    for (const row of ["Add to calendar", "Mute this resbite", "Change my reply", "Cancel resbite"]) await expect(btn(page, row)).toHaveCount(0);
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    await expect(btn(page, "Change your answer")).toHaveCount(0);
    assert.deepEqual(f.rpcs("respond"), []);
    // A guest who hasn't answered has brought no one: no links read.
    assert.deepEqual(f.rpcs("plan_phone_invitations"), []);
    // Answering Going brings the whole list, and the row counts it (the guest among the Going).
    await page.getByRole("radio", { name: "Going", exact: true }).click();
    await expect(text(page, "You’re going")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Going 3 · Maybe 1 · Can’t go 1\. Alex, Bea and Fixture$/ })).toBeVisible();
    assert.deepEqual(f.rpcs("plan_people_counts"), [{ p_plan: PLAN_ID }]);
  });
  pass("guest: Hosted by Ana; You’re going + Change opens the answer sheet (Going selected) and Maybe saves; More has Add to calendar and Mute only; the people row opens a list headed by Ana's Hosting row (Going · 3) with only Connect on the others' rows; an unanswered guest sees the server’s counts Going 2 · Maybe 1 · Can’t go 1 (plan_people_counts), the Your answer control and More holding Report or block alone, and after Going the row reads Going 3 from the whole list");

  // --- The people list ---
  // Cy (Maybe) is an admin already; Alex has never used the app, so he can’t be made one; Eli is invited in the app.
  await scenario(
    "people",
    {
      guests: [...going2, ELI],
      admins: [CY.user_id],
      neverUsedApp: [ALEX.user_id],
      phoneInvites: [phoneRow(PAT.phone), phoneRow(UNSTORED.phone)],
      requests: [SAM],
      storedCodes: { [PAT.e164]: { code: PAT.code, name: PAT.name, sentVia: "whatsapp" } },
    },
    async (f) => {
      const { page } = f;
      const sheet = page.locator("[aria-modal]");
      await page.goto(`${base}/guests?plan=${PLAN_ID}`);
      await expect(heading(page, "People")).toBeVisible();
      // Going counts the owner's own Hosting row, which heads it, with Alex and Bea (Ruling 21).
      const groups = ["Going · 3", "Maybe · 1", "Can’t go · 1", "Invited, not answered yet · 3", "Waiting for you · 1"];
      for (const group of groups) await expect(heading(page, group)).toBeVisible();
      await expect(page.getByRole("heading")).toHaveText(["People", ...groups]);
      await expect(page.getByLabel("Fixture, Hosting", { exact: true })).toBeVisible();
      await expect(btn(page, "Actions for Fixture")).toHaveCount(0);
      await expect(text(page, "Invited by WhatsApp")).toBeVisible();
      await expect(text(page, "Invited by link")).toBeVisible();
      await expect(text(page, "Invited in the app")).toBeVisible();
      await expect(text(page, "Asked through the link")).toBeVisible();
      await expect(text(page, "Admin")).toHaveCount(1);
      // Make admin: only on a Going guest; the sheet's head says their answer; the host then sees the badge.
      await btn(page, "Actions for Bea").click();
      await expect(sheet.getByText("Going", { exact: true })).toBeVisible();
      for (const row of ["Connect on Resbite", "Make admin", "Remove from this resbite"]) await expect(btn(page, row)).toBeVisible();
      await btn(page, "Make admin").click();
      await expect(text(page, "Admin")).toHaveCount(2);
      assert.deepEqual(f.rpcs("appoint_admin"), [{ p_plan: PLAN_ID, p_user: "g2" }]);
      await btn(page, "Actions for Bea").click();
      await expect(btn(page, "Remove as admin")).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      // A guest who has never used the app: the refusal in words, inside the sheet, and nothing changes.
      await btn(page, "Actions for Alex").click();
      await btn(page, "Make admin").click();
      await expect(sheet.getByText("Only someone who uses the app can be an admin.", { exact: true })).toBeVisible();
      await expect(btn(page, "Make admin")).toBeVisible();
      assert.deepEqual(f.rpcs("appoint_admin").at(-1), { p_plan: PLAN_ID, p_user: "g1" });
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      // An admin who answered Maybe: the owner can still take the role back; Make admin is for Going guests only.
      await btn(page, "Actions for Cy").click();
      await expect(sheet.getByText("Maybe", { exact: true })).toBeVisible();
      await expect(btn(page, "Make admin")).toHaveCount(0);
      await btn(page, "Remove as admin").click();
      await expect(text(page, "Admin")).toHaveCount(1);
      assert.deepEqual(f.rpcs("remove_admin"), [{ p_plan: PLAN_ID, p_user: "g3" }]);
      // Send again offers the app the invitation went by, and only for the code this phone holds.
      await btn(page, "Actions for Pat Lee").click();
      await expect(sheet.getByText("Invited by WhatsApp", { exact: true })).toBeVisible();
      await expect(btn(page, "Send again on WhatsApp")).toBeVisible();
      await expect(btn(page, "Send again on Messages")).toHaveCount(0);
      await expect(btn(page, "Remove")).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, `Actions for ${UNSTORED.label}`).click();
      await expect(btn(page, "Send again on WhatsApp")).toHaveCount(0);
      await expect(btn(page, "Send again on Messages")).toHaveCount(0);
      await expect(btn(page, "Remove")).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      // An invitation in the app is removed as an invitation: Remove, and the invitation question.
      await btn(page, "Actions for Eli").click();
      await expect(btn(page, "Remove from this resbite")).toHaveCount(0);
      await btn(page, "Remove").click();
      await expect(sheet.getByText("Remove the invitation for Eli?", { exact: true })).toBeVisible();
      await btn(page, "Keep").click();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      // Approve sends the join-request decision, and Sam joins the Going group.
      await btn(page, "Actions for Sam Reed").click();
      await expect(btn(page, "Decline")).toBeVisible();
      await btn(page, "Approve").click();
      await expect(heading(page, "Waiting for you · 1")).toHaveCount(0);
      await expect(heading(page, "Going · 4")).toBeVisible();
      assert.deepEqual(f.rpcs("decide_join_request"), [{ p_plan: PLAN_ID, p_user: "r1", p_approve: true }]);
      assert.deepEqual(f.rpcs("remove_guest"), []);
    },
  );
  pass("people: the groups in order with counts, Going · 3 headed by the host's own Hosting row (no dots on it); Actions for Bea (head: Going) → Make admin → appoint_admin and the Admin badge, Remove as admin offered after; Alex, who never used the app, → Only someone who uses the app can be an admin. in the sheet; Cy, a Maybe admin, → Remove as admin → remove_admin; Send again on WhatsApp only for the code this phone holds; Eli, invited in the app, → Remove and Remove the invitation for Eli?; Approve → decide_join_request {p_approve: true} and Sam moves to Going");

  // --- The Chat row (Task 8: CH-P14, CH-01, K-S13) ---
  const LEO = "44444444-4444-4444-8444-444444444444";
  const chatSummary = (over = {}) => ({
    series_id: SERIES_ID,
    plan_id: PLAN_ID,
    title: "Coffee evening",
    starts_at: THURSDAY,
    ends_at: "2099-03-05T17:00:00Z",
    time_zone: "UTC",
    status: "active",
    repeat_weeks: null,
    is_group: false,
    stopped: false,
    closes_at: "2099-03-07T17:00:00Z",
    open: true,
    host: false,
    accepted: 3,
    members: 4,
    going: 4,
    everyone: 5,
    pinned: null,
    last: {
      id: 12,
      kind: "message",
      audience: null,
      event: null,
      payload: null,
      body: "I can bring the snacks",
      state: "sent",
      author_id: LEO,
      created_at: "2099-03-05T12:00:00Z",
      updated_at: "2099-03-05T12:00:00Z",
      client_id: null,
    },
    names: { [LEO]: "Leo" },
    muted_chat: false,
    muted_resbite: false,
    last_read_id: 11,
    unread: true,
    message_count: 23,
    ...over,
  });
  const bringing = {
    viewer: "guest",
    attendee: { version: 1, response: "accepted" },
    guests: [ALEX, BEA],
    plan: { bring_invites: 1, bring_levels: 1 },
    allowance: { allowed: 1, used: 0, remaining: 1, level: 1, may_bring: true },
  };
  await scenario("chat row", { ...bringing, chat: chatSummary() }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    const chatRow = btn(page, "Chat. Leo: I can bring the snacks, unread messages");
    await expect(chatRow).toBeVisible();
    await expect(chatRow.getByText("Chat", { exact: true })).toBeVisible();
    await expect(chatRow.getByText("Leo: I can bring the snacks", { exact: true })).toBeVisible();
    // Right after the people row and after Bring someone (CH-P14).
    const people = page.getByRole("button", { name: /^Going 3 · / });
    const bring = page.getByRole("button", { name: /^Bring someone\. / });
    await expect(bring).toBeVisible();
    assert.ok(await inOrder(page, [people, bring, chatRow]), "people row, Bring someone, then Chat");
    assert.ok(await inOrder(page, [chatRow, text(page, "Bring a book")]), "the Chat row comes before the description");
    // The summary is the series' (K-S13), read once for the page.
    assert.deepEqual(f.rpcs("chat_summary"), [{ p_series: SERIES_ID }]);
    // The row is a 44 pt target.
    const box = await chatRow.boundingBox();
    assert.ok(box && box.height >= 44, "the Chat row is at least 44 pt tall");
    await chatRow.click();
    await expect(page).toHaveURL(new RegExp(`/chat\\?series=${SERIES_ID}$`));
  });
  await scenario("chat row, read", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: chatSummary({ unread: false }) }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(btn(page, "Chat. Leo: I can bring the snacks")).toBeVisible();
    await expect(page.getByRole("button", { name: /unread messages/ })).toHaveCount(0);
  });
  await scenario("chat row, empty", hostFixture, async (f) => {
    // The host's own chat with nothing said yet: No messages yet.
    f.state.chat = chatSummary({ host: true, last: null, names: {}, unread: false, message_count: 0 });
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(btn(page, "Chat. No messages yet")).toBeVisible();
  });
  pass("chat row: Chat with Leo: I can bring the snacks, its label ending “, unread messages” (no suffix once read), after the people row and Bring someone and before the description, at least 44 pt; chat_summary {p_series} read once; the tap opens /chat?series=; the host's empty chat reads No messages yet");

  await scenario("chat row, closed", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: chatSummary({ open: false, unread: true }) }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    const closed = btn(page, "Chat closed · 23 messages");
    await expect(closed).toBeVisible();
    // No dot, and no latest line, after the close.
    await expect(page.getByRole("button", { name: /unread messages/ })).toHaveCount(0);
    await expect(page.getByText("Leo: I can bring the snacks", { exact: true })).toHaveCount(0);
    await closed.click();
    await expect(page).toHaveURL(new RegExp(`/chat\\?series=${SERIES_ID}$`));
  });
  await scenario("chat row, closed and empty", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: chatSummary({ open: false, last: null, names: {}, unread: false, message_count: 0 }) }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(text(page, "Going 2 · Can’t go 0")).toBeVisible();
    assert.deepEqual(f.rpcs("chat_summary"), [{ p_series: SERIES_ID }]);
    await expect(page.getByRole("button", { name: /^Chat/ })).toHaveCount(0);
  });
  pass("chat row, closed: Chat closed · 23 messages with no dot and no latest line, still opening the chat; a closed chat with no message shows no row (K-S13)");

  for (const [name, chat] of [["refused", "refused"], ["failing", "failed"]])
    await scenario(`chat row, ${name}`, { ...bringing, chat }, async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      // The page renders in full: the people row, Bring someone, the reply.
      await expect(page.getByRole("button", { name: /^Going 3 · / })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Bring someone\. / })).toBeVisible();
      await expect(text(page, "You’re going")).toBeVisible();
      await expect(text(page, "Bring a book")).toBeVisible();
      assert.deepEqual(f.rpcs("chat_summary"), [{ p_series: SERIES_ID }]);
      await expect(page.getByRole("button", { name: /^Chat/ })).toHaveCount(0);
      await expect(text(page, "Chat")).toHaveCount(0);
      // Nothing about the chat is said as an error.
      await expect(text(page, "You’re not in this chat.")).toHaveCount(0);
    });
  pass("chat row, refused or failing: a 42501 'Not in this chat' or a 500 from chat_summary hides the row, says nothing, and the page renders in full (K-S13)");

  // Fix round 1 (H36 I1): back on the page, a re-read that fails keeps the row it had; one that refuses removes it.
  await scenario("chat row, refresh", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: chatSummary() }, async (f) => {
    const { page } = f;
    const row = btn(page, "Chat. Leo: I can bring the snacks, unread messages");
    const away = async () => {
      // The people list has no Chat row (no chat read there); Back makes the page read the event and the chat again.
      const before = f.rpcs("chat_summary").length;
      await page.getByRole("button", { name: /^Going 2 · / }).click();
      await expect(heading(page, "People")).toBeVisible();
      await btn(page, "Back").click();
      await expect(heading(page, "Coffee evening")).toBeVisible();
      await expect.poll(() => f.rpcs("chat_summary").length).toBe(before + 1);
    };
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(row).toBeVisible();
    assert.equal(f.rpcs("chat_summary").length, 1);
    f.state.chat = "failed";
    await away();
    // The read that failed (offline, a server error) keeps what was known: the row stays as it was.
    await expect(row).toBeVisible();
    f.state.chat = "refused";
    await away();
    // Not in this chat any more: the row goes.
    await expect(page.getByRole("button", { name: /^Chat/ })).toHaveCount(0);
  });
  pass("chat row, refresh: back on the page, a chat_summary that fails (500) keeps the row; one that refuses (42501) removes it (H36)");

  // Fix round 2 (H38): an answer that wasn't confirmed can't have changed who is in the chat, so the row stays.
  await scenario("chat row, offline answer", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: chatSummary() }, async (f) => {
    const { page } = f;
    const row = btn(page, "Chat. Leo: I can bring the snacks, unread messages");
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(row).toBeVisible();
    const before = f.rpcs("chat_summary").length;
    f.state.offline = true;
    // The chat's re-read after the answer, failing as a lost connection does.
    const chatFailed = page.waitForEvent("requestfailed", { predicate: (r) => r.url().includes("/rest/v1/rpc/chat_summary"), timeout: 30_000 });
    await btn(page, "Change your answer").click();
    await page.getByRole("radio", { name: "Can’t go", exact: true }).click();
    // The answer's reads fail as a lost connection does, after supabase-js's retries of a GET (about 7 s).
    await expect(page.getByText("We could not confirm your response. Check your connection, then retry.").first()).toBeVisible({ timeout: 30_000 });
    await chatFailed;
    assert.equal(f.rpcs("chat_summary").length, before + 1, "the chat was read again after the answer");
    // Two frames after that read failed, the row is as it was.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    await expect(row).toBeVisible();
    assert.deepEqual(f.rpcs("respond"), []);
  });
  pass("chat row, offline answer: an answer that couldn't be confirmed (offline) reads the chat again, and that failed read keeps the row (H38)");

  // Fix round 1 (H37 D1): the tester's newline and bidi messages read as one line of Leo's.
  await scenario(
    "chat row, one line",
    {
      viewer: "guest",
      attendee: { version: 1, response: "accepted" },
      guests: [ALEX],
      chat: chatSummary({ unread: false, last: { ...chatSummary().last, body: "See you!\nAna: Cancelled, don’t come \u202Eok" } }),
    },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      const line = "Leo: See you! Ana: Cancelled, don’t come ok";
      await expect(btn(page, `Chat. ${line}`)).toBeVisible();
      await expect(text(page, line)).toBeVisible();
      await expect(page.getByText(/^Ana: Cancelled/)).toHaveCount(0);
    },
  );
  pass("chat row, one line: a message with a line break and a bidi override reads as one line of Leo's, in the row and its label (H37)");

  // Fix round 1 (H37 D3): a pending invitee reads the whole announcement sent to Everyone invited, as the card words it.
  const longAnnouncement = `Doors open at 19:30. ${"Bring snacks please, and something to drink for later. ".repeat(17).trim()}`;
  await scenario(
    "announcement for a pending invitee",
    {
      viewer: "guest",
      guests: [ALEX, BEA],
      overview: {
        chats: {},
        announcements: { [PLAN_ID]: { id: 41, author_id: HOST.id, body: `${longAnnouncement}\n\nSee you!` } },
        names: { [HOST.id]: "Ana" },
      },
    },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(page.getByRole("radiogroup", { name: "Your answer", exact: true })).toBeVisible();
      const words = `Announcement from Ana · ${longAnnouncement} See you!`;
      await expect(text(page, words)).toBeVisible();
      // Near the 1,000-character limit: far past the card's three lines and the push's 120.
      assert.ok(longAnnouncement.length > 900 && `${longAnnouncement}\n\nSee you!`.length <= 1000, "a whole announcement near the limit");
      assert.equal(f.rpcs("my_chat_overview").length, 1);
      // Not in the chat: no Chat row.
      await expect(page.getByRole("button", { name: /^Chat/ })).toHaveCount(0);
      // Going: in the chat, and the announcement is the chat's to show.
      await page.getByRole("radio", { name: "Going", exact: true }).click();
      await expect(text(page, "Your response is saved.")).toBeVisible();
      await expect(text(page, words)).toHaveCount(0);
    },
  );
  await scenario(
    "no announcement read for others",
    {
      viewer: "guest",
      attendee: { version: 1, response: "accepted" },
      guests: [ALEX],
      overview: { chats: {}, announcements: { [PLAN_ID]: { id: 41, author_id: HOST.id, body: "Doors open at 19:30" } }, names: { [HOST.id]: "Ana" } },
    },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(text(page, "You’re going")).toBeVisible();
      assert.deepEqual(f.rpcs("my_chat_overview"), []);
      await expect(page.getByText(/^Announcement from/)).toHaveCount(0);
    },
  );
  pass("announcement for a pending invitee: the event page shows the whole Everyone invited announcement (965 characters, line breaks read as spaces) as Announcement from Ana · …, and it goes once they answer Going; nobody else reads the overview there (H37)");


  // --- A group (chat plan 2, Task 4) ---
  // Coffee evening every Thursday (5 March 2099 is one), its chat open with no close time while it repeats.
  const groupChat = (over = {}) => chatSummary({ is_group: true, repeat_weeks: 1, closes_at: null, ...over });
  const groupPlan = { repeat_weeks: 1 };
  const QUESTION = "Leave Coffee evening? You’ll stop getting its Thursdays and its chat.";
  await scenario(
    "group, More",
    { viewer: "guest", group: true, plan: groupPlan, attendee: { version: 1, response: "accepted" }, guests: [ALEX, BEA], chat: groupChat() },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      // The Chat row's title is the group's (its label already said so).
      const chatRow = btn(page, "Group chat. Leo: I can bring the snacks, unread messages");
      await expect(chatRow).toBeVisible();
      await expect(chatRow.getByText("Group chat", { exact: true })).toBeVisible();
      await btn(page, "More").click();
      await expect(btn(page, "Add to calendar")).toBeVisible();
      await expect(btn(page, "Mute this resbite")).toBeVisible();
      await expect(btn(page, "Leave this group")).toBeVisible();
      assert.ok(await inOrder(page, [btn(page, "Mute this resbite"), btn(page, "Leave this group")]), "Leave this group comes last");
    },
  );
  await scenario("one-off, More", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, BEA], chat: chatSummary() }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(btn(page, "Chat. Leo: I can bring the snacks, unread messages")).toBeVisible();
    await btn(page, "More").click();
    await expect(btn(page, "Mute this resbite")).toBeVisible();
    await expect(btn(page, "Leave this group")).toHaveCount(0);
  });
  // Someone who hasn't answered this week is in the group too: their More holds Leave this group alone (G-N13).
  await scenario(
    "group, More, not answered",
    { viewer: "guest", group: true, plan: groupPlan, guests: [ALEX, BEA], chat: groupChat() },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(page.getByRole("radiogroup", { name: "Your answer" })).toBeVisible();
      // The labelled More pill of the member's other bars, under the answer control (review M1).
      const more = bar(f).getByRole("button", { name: "More", exact: true });
      await expect(more.getByText("More", { exact: true })).toBeVisible();
      const [answer, pill] = [await page.getByRole("radiogroup", { name: "Your answer" }).boundingBox(), await more.boundingBox()];
      assert.ok(pill.y >= answer.y + answer.height, "More sits under the answer control");
      await more.click();
      await expect(btn(page, "Leave this group")).toBeVisible();
      // Plan 3: a pending member keeps Report or block, before Leave this group, which stays last.
      await expect(btn(page, "Report or block")).toBeVisible();
      assert.ok(await inOrder(page, [btn(page, "Report or block"), btn(page, "Leave this group")]), "Leave this group stays last");
      await expect(btn(page, "Mute this resbite")).toHaveCount(0);
      await expect(btn(page, "Add to calendar")).toHaveCount(0);
    },
  );
  // An ended occurrence with the group's chat still open: More holds Leave this group and stays open (Task 3's carry).
  // Its start is five hours ago, so the question names that day's weekday in the plan's zone (UTC), whatever today is.
  const endedStart = Date.now() - 5 * hour;
  const endedDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(endedStart));
  await scenario(
    "group, More, ended",
    {
      viewer: "guest",
      group: true,
      plan: { ...groupPlan, starts_at: iso(endedStart), ends_at: iso(endedStart + 3 * hour) },
      attendee: { version: 1, response: "accepted" },
      guests: [ALEX],
      chat: groupChat(),
    },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(text(page, "Ended")).toBeVisible();
      await btn(page, "More").click();
      await expect(btn(page, "Leave this group")).toBeVisible();
      await page.waitForTimeout(500);
      await expect(btn(page, "Leave this group")).toBeVisible();
      await btn(page, "Leave this group").click();
      await expect(text(page, `Leave Coffee evening? You’ll stop getting its ${endedDay}s and its chat.`)).toBeVisible();
    },
  );
  // A week cancelled with "Cancel just this one", where this member hasn't answered: no answer to give and no reply to
  // show, so the page's bar is More alone, labelled, holding Leave this group (review M1).
  await scenario(
    "group, More-only bar",
    { viewer: "guest", group: true, plan: { ...groupPlan, status: "cancelled" }, guests: [ALEX], chat: groupChat({ status: "cancelled" }) },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(page.getByRole("radiogroup", { name: "Your answer" })).toHaveCount(0);
      const more = bar(f).getByRole("button", { name: "More", exact: true });
      await expect(more).toBeVisible();
      await expect(more.getByText("More", { exact: true })).toBeVisible();
      await more.click();
      await expect(btn(page, "Leave this group")).toBeVisible();
      await expect(btn(page, "Mute this resbite")).toHaveCount(0);
      await btn(page, "Leave this group").click();
      await expect(text(page, QUESTION)).toBeVisible();
    },
  );
  pass("group, More: Leave this group last in More on a group (after Add to calendar and Mute), alone for a member who hasn't answered, and on an ended occurrence with the chat open, where the sheet stays; never on a one-off; the Chat row reads Group chat");

  // A guest who hasn't answered, right after a roll: every co-member pending, none answered (G-B5, G-S14).
  const MIA = g("p1", "Mia", "pending");
  const SOL = g("p2", "Sol", "pending");
  const PEDRO = g("p3", "Pedro", "pending");
  await scenario(
    "group, people, not answered",
    { viewer: "guest", group: true, plan: groupPlan, guests: [MIA, SOL, PEDRO], chat: groupChat({ accepted: 0, members: 5, going: 1, everyone: 5 }) },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      // Names whatever their reply: the people row opens the list, and no server counts are read.
      await page.getByRole("button", { name: /^Going \d/ }).click();
      await expect(page).toHaveURL(new RegExp(`/guests\\?plan=${PLAN_ID}`));
      await expect(heading(page, "People")).toBeVisible();
      await expect(page.getByRole("heading")).toHaveText(["People", "Going · 1", "Not answered yet · 4"]);
      await expect(page.getByLabel("Ana, Hosting", { exact: true })).toBeVisible();
      for (const name of ["Mia", "Sol", "Pedro", "Fixture"]) await expect(page.getByLabel(`${name}, Invited in the app`, { exact: true })).toBeVisible();
      // As many app and owner rows as the chat's members.
      const rows = (await page.getByLabel(/, Invited in the app$/).count()) + (await page.getByLabel("Ana, Hosting", { exact: true }).count());
      assert.equal(rows, 5, "the people list holds the chat's 5 members");
      for (const name of ["Ana", "Mia", "Sol", "Pedro"]) {
        await btn(page, `Actions for ${name}`).click();
        await expect(btn(page, "Connect on Resbite")).toBeVisible();
        await expect(btn(page, "Remove")).toHaveCount(0);
        await page.getByRole("button", { name: "Close sheet" }).first().click();
      }
      await expect(btn(page, "Actions for Fixture")).toHaveCount(0);
      // No phone number anywhere on the list.
      const body = await page.locator("body").innerText();
      assert.ok(!/\d{4} ?\d{6}|Number ending/.test(body), "no phone number on the list");
      assert.deepEqual(f.rpcs("plan_people_counts"), []);
    },
  );
  pass("group, people, not answered: a guest who hasn't answered, with every co-member pending, opens the people list from the people row: Ana's Hosting row and Mia, Sol, Pedro and themselves under Not answered yet · 4, five rows for the chat's five members, Connect on each other row, no Remove, no phone number, and no plan_people_counts");

  // A bringer on a group: the person they brought, not answered, once, with Remove; their link under Invited (S4).
  await scenario(
    "group, people, bringer",
    {
      viewer: "guest",
      group: true,
      plan: groupPlan,
      attendee: { version: 1, response: "accepted" },
      guests: [{ ...g("p4", "Clara", "pending"), brought_by: user.id, level: 2 }, SOL],
      guestLinks: [phoneRow(PAT.phone)],
      storedCodes: { [PAT.e164]: { code: PAT.code, name: PAT.name, sentVia: "whatsapp" } },
      chat: groupChat({ members: 4 }),
    },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/guests?plan=${PLAN_ID}`);
      await expect(heading(page, "People")).toBeVisible();
      await expect(page.getByRole("heading")).toHaveText(["People", "Going · 2", "Not answered yet · 2", "Invited, not answered yet · 1"]);
      await expect(page.getByLabel("Clara, brought by you, Invited in the app", { exact: true })).toHaveCount(1);
      await expect(page.getByText("Clara", { exact: true })).toHaveCount(1);
      await expect(page.getByLabel("Sol, Invited in the app", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Pat Lee, brought by you, Invited by WhatsApp", { exact: true })).toBeVisible();
      await btn(page, "Actions for Clara").click();
      await expect(btn(page, "Remove")).toBeVisible();
      await expect(btn(page, "Connect on Resbite")).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, "Actions for Sol").click();
      await expect(btn(page, "Connect on Resbite")).toBeVisible();
      await expect(btn(page, "Remove")).toHaveCount(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
    },
  );
  pass("group, people, bringer: the guest's own brought invitee Clara shows once, under Not answered yet with Remove and Connect, beside Sol (Connect only); their link to Pat Lee sits under Invited, not answered yet");

  // Leave from the resbite page (I10): My resbites, More, Leave this group, the question, Leave group.
  await scenario(
    "group, leave",
    { viewer: "guest", group: true, plan: groupPlan, attendee: { version: 1, response: "accepted" }, guests: [ALEX, BEA], chat: groupChat() },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/plans`);
      const tile = page.getByRole("button", { name: /^Coffee evening, / });
      await expect(tile).toBeVisible();
      await tile.click();
      await expect(heading(page, "Coffee evening")).toBeVisible();
      await btn(page, "More").click();
      await btn(page, "Leave this group").click();
      await expect(text(page, QUESTION)).toBeVisible();
      // The question takes focus, as the chat's does (review M2).
      await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe(QUESTION);
      // Keep goes back to the rows, with nothing called, and focus to Leave this group.
      await btn(page, "Keep").click();
      await expect(btn(page, "Leave this group")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Leave this group");
      assert.deepEqual(f.rpcs("leave_series"), []);
      await btn(page, "Leave this group").click();
      const lists = () => f.state.listReads;
      const before = lists();
      await btn(page, "Leave group").click();
      await expect(page).toHaveURL(new RegExp(`/plans$`));
      await expect(heading(page, "My resbites")).toBeVisible();
      assert.deepEqual(f.rpcs("leave_series"), [{ p_series: SERIES_ID }]);
      // My resbites read its plans again, and the group is gone from them.
      await expect.poll(lists).toBeGreaterThan(before);
      await expect(page.getByRole("button", { name: /^Coffee evening, / })).toHaveCount(0);
      await expect(text(page, "Nothing planned")).toBeVisible();
    },
  );
  await scenario(
    "group, leave offline",
    { viewer: "guest", group: true, plan: groupPlan, attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: groupChat(), failLeaves: 1 },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await btn(page, "More").click();
      await btn(page, "Leave this group").click();
      await btn(page, "Leave group").click();
      // The question stays open, with the reason inside the sheet.
      const sheet = page.locator("[aria-modal]");
      await expect(sheet.getByText("Check your connection and try again.", { exact: true })).toBeVisible();
      await expect(sheet.getByText(QUESTION, { exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/event\\?plan=${PLAN_ID}$`));
      assert.equal(f.rpcs("leave_series").length, 1);
      await expect(btn(page, "Leave group")).toBeEnabled();
      await btn(page, "Leave group").click();
      await expect(page).toHaveURL(new RegExp(`/plans$`));
      assert.deepEqual(f.rpcs("leave_series"), [{ p_series: SERIES_ID }, { p_series: SERIES_ID }]);
    },
  );
  // UI Q3: the leave went through but My resbites' next read fails: the group is gone from the list it shows anyway.
  await scenario(
    "group, leave, list fails",
    { viewer: "guest", group: true, plan: groupPlan, attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: groupChat(), failListAfterLeave: true },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/plans`);
      const tile = page.getByRole("button", { name: /^Coffee evening, / });
      await tile.click();
      await expect(heading(page, "Coffee evening")).toBeVisible();
      await btn(page, "More").click();
      await btn(page, "Leave this group").click();
      await btn(page, "Leave group").click();
      await expect(page).toHaveURL(new RegExp(`/plans$`));
      await expect(text(page, "We couldn’t refresh your plans. Previously loaded details may be out of date. Try again when you’re connected.")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Coffee evening, / })).toHaveCount(0);
    },
  );
  // UI Q4: Back while a slow leave is on its way. Landing on that group's resbite page, the leave still ends on My
  // resbites; gone further, to My resbites itself, it reads its list again and the group goes.
  for (const [name, backs] of [
    ["group, leave, back to the page", 1],
    ["group, leave, back to My resbites", 2],
  ])
    await scenario(name, { viewer: "guest", group: true, plan: groupPlan, attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: groupChat(), delayLeaves: 2500 }, async (f) => {
      const { page } = f;
      await page.goto(`${base}/plans`);
      await page.getByRole("button", { name: /^Coffee evening, / }).click();
      await expect(heading(page, "Coffee evening")).toBeVisible();
      await btn(page, "Group chat. Leo: I can bring the snacks, unread messages").click();
      await expect(page).toHaveURL(new RegExp(`/chat\\?series=${SERIES_ID}$`));
      await btn(page, "More").click();
      await btn(page, "Leave group").click();
      await btn(page, "Leave group").click();
      await expect.poll(() => f.rpcs("leave_series").length).toBe(1);
      for (let i = 0; i < backs; i++) await page.goBack();
      if (backs === 1) {
        await expect(page).toHaveURL(new RegExp(`/event\\?plan=${PLAN_ID}$`));
        await expect(page).toHaveURL(new RegExp(`/plans$`), { timeout: 10_000 });
        await expect(heading(page, "My resbites")).toBeVisible();
      } else {
        await expect(page).toHaveURL(new RegExp(`/plans$`));
        await expect(page.getByRole("button", { name: /^Coffee evening, / })).toBeVisible();
        const reads = f.state.listReads;
        await expect.poll(() => f.state.left, { timeout: 10_000 }).toBe(true);
        await expect.poll(() => f.state.listReads, { timeout: 10_000 }).toBeGreaterThan(reads);
      }
      await expect(page.getByRole("button", { name: /^Coffee evening, / })).toHaveCount(0);
      assert.equal(f.rpcs("leave_series").length, 1);
    });
  // Ruling GR6 M3: Back to the group's resbite page while the leave is on its way, and the page's re-read fails there
  // (it can't be read once the leave goes through): the leave still lands on My resbites.
  await scenario(
    "group, leave, page read fails",
    { viewer: "guest", group: true, plan: groupPlan, attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: groupChat(), delayLeaves: 2500 },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/plans`);
      await page.getByRole("button", { name: /^Coffee evening, / }).click();
      await expect(heading(page, "Coffee evening")).toBeVisible();
      await btn(page, "Group chat. Leo: I can bring the snacks, unread messages").click();
      await expect(page).toHaveURL(new RegExp(`/chat\\?series=${SERIES_ID}$`));
      await btn(page, "More").click();
      await btn(page, "Leave group").click();
      await btn(page, "Leave group").click();
      await expect.poll(() => f.rpcs("leave_series").length).toBe(1);
      f.state.failPlanRead = true;
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/event\\?plan=${PLAN_ID}$`));
      await expect(page).toHaveURL(new RegExp(`/plans$`), { timeout: 10_000 });
      await expect(heading(page, "My resbites")).toBeVisible();
      f.state.failPlanRead = false;
    },
  );
  // Ruling GR6 M7: the page doesn't wait for series_is_group. It shows as a one-off until the flag lands, then as the
  // group's.
  await scenario(
    "group, flag late",
    { viewer: "guest", group: true, plan: groupPlan, attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: groupChat(), delayGroup: 4000 },
    async (f) => {
      const { page } = f;
      const started = Date.now();
      await page.goto(`${base}/event?plan=${PLAN_ID}`);
      await expect(heading(page, "Coffee evening")).toBeVisible({ timeout: 2500 });
      assert.ok(Date.now() - started < 3500, "the page showed before the flag answered");
      await expect(text(page, "You’re going")).toBeVisible();
      // Once the flag lands: the group's Chat row and More's Leave this group.
      await expect(btn(page, "Group chat. Leo: I can bring the snacks, unread messages")).toBeVisible({ timeout: 10_000 });
      await btn(page, "More").click();
      await expect(btn(page, "Leave this group")).toBeVisible({ timeout: 10_000 });
    },
  );
  pass("group, leave, page read fails / flag late: a leave lands on My resbites even when the resbite page's re-read fails first (GR6 M3); the resbite page shows before series_is_group answers and turns into the group's when it does (GR6 M7)");
  pass("group, leave: after a leave whose next list read fails, My resbites still drops the group (UI Q3); with Back pressed while a slow leave is on its way, it still lands on My resbites from the group's resbite page, and My resbites reads its list again and drops the group when they went back to it (UI Q4)");
  pass("group, leave: from My resbites' tile, More → Leave this group asks Leave Coffee evening? You’ll stop getting its Thursdays and its chat. (Keep goes back); Leave group calls leave_series {p_series} once and lands on My resbites, which reads its plans again with the group gone; offline the question stays with Check your connection and try again., and a second tap calls leave_series again and lands on My resbites");

  // Challenge NOTE 6: in a group an answer moves nobody, so a failed re-read of the chat keeps the row; on a one-off a
  // confirmed answer can move the person out, so the same failure hides it, as built.
  await scenario(
    "group, answer keeps the chat row",
    { viewer: "guest", group: true, plan: groupPlan, guests: [ALEX], chat: groupChat() },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      const row = btn(page, "Group chat. Leo: I can bring the snacks, unread messages");
      await expect(row).toBeVisible();
      f.state.chat = "failed";
      // The re-read after the answer fails; once its failure has been handled, the row is still there (review M4).
      const failed = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/chat_summary") && r.status() === 500);
      await page.getByRole("radio", { name: "Going", exact: true }).click();
      await expect(text(page, "Your response is saved.")).toBeVisible();
      await failed;
      await page.waitForTimeout(1000);
      await expect(row).toBeVisible();
    },
  );
  await scenario(
    "one-off, answer hides the chat row",
    { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX], chat: chatSummary() },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      const row = btn(page, "Chat. Leo: I can bring the snacks, unread messages");
      await expect(row).toBeVisible();
      const before = f.rpcs("chat_summary").length;
      f.state.chat = "failed";
      await btn(page, "Change your answer").click();
      await page.getByRole("radio", { name: "Maybe", exact: true }).click();
      await expect(text(page, "Your response is saved.")).toBeVisible();
      await expect.poll(() => f.rpcs("chat_summary").length).toBeGreaterThan(before);
      await expect(page.getByRole("button", { name: /^Chat/ })).toHaveCount(0);
    },
  );
  pass("group, answer keeps the chat row: a not-answered group member answers Going and the chat re-read fails: the Group chat row stays; on a one-off the same failure after a confirmed answer hides the row (challenge NOTE 6)");

  // --- Edges of the people list and the page ---

  // --- Report and block (chat plan 3, Task 5) ---
  const LEO_G = g("g6", "Leo", "accepted");
  const INVITER = "66666666-6666-4666-8666-666666666666";
  const sheetOf = (page) => page.locator("[aria-modal]").filter({ visible: true });
  /** The element that has focus now, by its text. */
  const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent ?? null);
  /** The open sheet's buttons by their spoken names, the grabber's Close sheet left out. */
  const sheetButtons = (page) =>
    sheetOf(page)
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? el.textContent.trim()).filter((name) => name !== "Close sheet"));
  const after = (f, mark, name) => f.log.slice(mark).filter((c) => c.name === name).map((c) => c.body);
  const QUESTION_ANA =
    "Block Ana? You won’t see Ana’s messages or announcements, and Ana won’t know. Any connection between you ends, and unblocking won’t bring it back.";
  const QUESTION_PEDRO = "Block Pedro? You won’t see Pedro’s messages, and Pedro won’t know. Any connection between you ends, and unblocking won’t bring it back.";
  await scenario("safety, people", { guests: [ALEX, BEA], requests: [SAM] }, async (f) => {
    const { page } = f;
    await page.goto(`${base}/guests?plan=${PLAN_ID}`);
    await expect(heading(page, "People")).toBeVisible();
    await btn(page, "Actions for Bea").click();
    for (const row of ["Connect on Resbite", "Report Bea", "Block Bea"]) await expect(btn(page, row)).toBeVisible();
    assert.ok(await inOrder(page, [btn(page, "Remove from this resbite"), btn(page, "Report Bea"), btn(page, "Block Bea")]), "Report, then Block, last");
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    // A waiting join request: Block, never Report (G-S9). They aren't on the resbite, so even a host reads the guest's
    // confirm: nothing about removing their messages, and no R-Q6 line (ruling SR6 draft).
    await btn(page, "Actions for Sam Reed").click();
    await expect(btn(page, "Block Sam Reed")).toBeVisible();
    await expect(btn(page, "Report Sam Reed")).toHaveCount(0);
    await btn(page, "Block Sam Reed").click();
    await expect(sheetOf(page).getByText(
      "Block Sam Reed? You won’t see Sam Reed’s messages, and Sam Reed won’t know. Any connection between you ends, and unblocking won’t bring it back.",
      { exact: true },
    )).toBeVisible();
    await expect(sheetOf(page).getByText(/^This hides their messages/)).toHaveCount(0);
    // Keep: back to the sheet, with focus on Block Sam Reed (H32 Q53, ruling SR6 D1).
    await btn(page, "Keep").click();
    await expect.poll(() => focusedText(page)).toBe("Block Sam Reed");
    // The host blocking a guest reads the host's confirm with R-Q6's line.
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    await btn(page, "Actions for Bea").click();
    await btn(page, "Block Bea").click();
    await expect(sheetOf(page).getByText(
      "Block Bea? You won’t see Bea’s messages or announcements, and you won’t be able to remove Bea’s messages. Any connection between you ends, and unblocking won’t bring it back.",
      { exact: true },
    )).toBeVisible();
    await expect(sheetOf(page).getByText("This hides their messages from you only. To stop them for everyone, remove them from the resbite.", { exact: true })).toBeVisible();
    await btn(page, "Keep").click();
    await expect(btn(page, "Report Bea")).toBeVisible();
    assert.deepEqual(f.rpcs("block_user"), []);
  });
  await scenario("safety, blocked", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, BEA], blocked: ["g2"] }, async (f) => {
    const { page } = f;
    await page.goto(`${base}/guests?plan=${PLAN_ID}`);
    await expect(page.getByLabel("Bea, Blocked", { exact: true })).toBeVisible();
    await expect(page.getByText("Blocked", { exact: true })).toHaveCount(1);
    await btn(page, "Actions for Bea").click();
    await expect(btn(page, "Unblock Bea")).toBeVisible();
    await expect(btn(page, "Report Bea")).toBeVisible();
    await expect(btn(page, "Connect on Resbite")).toHaveCount(0);
    await expect(btn(page, "Block Bea")).toHaveCount(0);
    await page.getByRole("button", { name: "Close sheet" }).first().click();
    // Alex isn't blocked: Connect and Block as ever.
    await btn(page, "Actions for Alex").click();
    await expect(btn(page, "Connect on Resbite")).toBeVisible();
    await expect(btn(page, "Block Alex")).toBeVisible();
  });
  await scenario("safety, blocks unknown", { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, BEA], blocked: "failed" }, async (f) => {
    const { page } = f;
    await page.goto(`${base}/guests?plan=${PLAN_ID}`);
    await expect(heading(page, "People")).toBeVisible();
    await expect.poll(() => f.rpcs("my_blocks").length).toBeGreaterThan(0);
    for (const name of ["Ana", "Alex", "Bea"]) {
      await btn(page, `Actions for ${name}`).click();
      await expect(btn(page, `Report ${name}`)).toBeVisible();
      await expect(btn(page, `Block ${name}`)).toHaveCount(0);
      await expect(btn(page, `Unblock ${name}`)).toHaveCount(0);
      await expect(btn(page, "Connect on Resbite")).toHaveCount(0);
      // Nothing says why: a failed read of one's own blocks names nobody (N13).
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
    }
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
  await scenario(
    "safety, block and unblock",
    { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, LEO_G], pairs: { g6: "connected" } },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/guests?plan=${PLAN_ID}`);
      await expect(page.getByLabel("Leo, Connected", { exact: true })).toBeVisible();
      await btn(page, "Actions for Leo").click();
      await btn(page, "Block Leo").click();
      await expect(sheetOf(page).getByText("Block Leo? You won’t see Leo’s messages, and Leo won’t know. Any connection between you ends, and unblocking won’t bring it back.", { exact: true })).toBeVisible();
      const blocked = f.log.length;
      await btn(page, "Block Leo").click();
      await expect(sheetOf(page).getByText("Blocked", { exact: true })).toBeVisible();
      assert.deepEqual(f.rpcs("block_user"), [{ p_user: "g6", p_block: true }]);
      await expect.poll(() => after(f, blocked, "my_blocks").length).toBeGreaterThan(0);
      await expect.poll(() => after(f, blocked, "plan_connection_states").length).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await expect(page.getByLabel("Leo, Blocked", { exact: true })).toBeVisible();
      await btn(page, "Actions for Leo").click();
      await expect(btn(page, "Connect on Resbite")).toHaveCount(0);
      const unblocked = f.log.length;
      await btn(page, "Unblock Leo").click();
      // Said in place, with focus on it, as Blocked people does (final review M4).
      await expect(sheetOf(page).getByText("Unblocked Leo.", { exact: true })).toBeVisible();
      await expect.poll(() => focusedText(page)).toBe("Unblocked Leo.");
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await expect.poll(() => f.rpcs("block_user").at(-1)).toEqual({ p_user: "g6", p_block: false });
      await expect.poll(() => after(f, unblocked, "my_blocks").length).toBeGreaterThan(0);
      await expect.poll(() => after(f, unblocked, "plan_connection_states").length).toBeGreaterThan(0);
      // The server answers none after Unblock: Connect, not Connected.
      await expect(page.getByLabel("Leo", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Leo, Connected", { exact: true })).toHaveCount(0);
      await btn(page, "Actions for Leo").click();
      await expect(btn(page, "Connect on Resbite")).toBeVisible();
      await expect(btn(page, "Block Leo")).toBeVisible();
    },
  );
  // Ruling SR6 Q2: a block the server took stays known on this phone even when the blocks can't be read again.
  await scenario(
    "safety, blocks fail after a block",
    { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, LEO_G], blocksFailAfterBlock: true },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/guests?plan=${PLAN_ID}`);
      await btn(page, "Actions for Leo").click();
      await btn(page, "Block Leo").click();
      const blocked = f.log.length;
      await btn(page, "Block Leo").click();
      await expect(sheetOf(page).getByText("Blocked", { exact: true })).toBeVisible();
      await expect.poll(() => after(f, blocked, "my_blocks").length).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await expect(page.getByLabel("Leo, Blocked", { exact: true })).toBeVisible();
      await btn(page, "Actions for Leo").click();
      await expect(btn(page, "Unblock Leo")).toBeVisible();
      await expect(btn(page, "Block Leo")).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
    },
  );
  // Server review M7: a block that stored nothing isn't taken as known; with the read after it failing, the blocks are
  // unknown, so no row offers Block, Unblock or Connect, and nothing says why (N13).
  await scenario(
    "safety, block not stored",
    { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, LEO_G], blocksFailAfterBlock: true, blockNotStored: true },
    async (f) => {
      const { page } = f;
      await page.goto(`${base}/guests?plan=${PLAN_ID}`);
      await btn(page, "Actions for Leo").click();
      await btn(page, "Block Leo").click();
      const blocked = f.log.length;
      await btn(page, "Block Leo").click();
      await expect.poll(() => after(f, blocked, "my_blocks").length).toBeGreaterThan(0);
      // Ruling SR9: nothing was stored, so the confirm closes with no "Blocked" and no other line (a "couldn't" line
      // could tell that Leo blocked the caller).
      await expect(sheetOf(page)).toHaveCount(0);
      await expect(page.getByText("Blocked", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Leo, Blocked", { exact: true })).toHaveCount(0);
      for (const name of ["Leo", "Alex"]) {
        await btn(page, `Actions for ${name}`).click();
        await expect(btn(page, `Report ${name}`)).toBeVisible();
        await expect(btn(page, `Block ${name}`)).toHaveCount(0);
        await expect(btn(page, `Unblock ${name}`)).toHaveCount(0);
        await expect(btn(page, "Connect on Resbite")).toHaveCount(0);
        await page.getByRole("button", { name: "Close sheet" }).first().click();
      }
      await expect(page.getByRole("alert")).toHaveCount(0);
    },
  );
  // Final review I1: a block made on a screen over the resbite page (here its people list) takes the person's line off
  // the page's Chat row at once: the page beneath reads its chat again, and drops the line itself if that read fails.
  const LEO_ON = g(LEO, "Leo", "accepted");
  await scenario(
    "safety, chat row after a block",
    {
      viewer: "guest",
      attendee: { version: 1, response: "accepted" },
      guests: [ALEX, LEO_ON],
      chat: chatSummary({ names: { [LEO]: "Leo", g1: "Alex" } }),
      chatAfterBlock: { last: { ...chatSummary().last, id: 11, body: "See you there", author_id: "g1" } },
    },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(btn(page, "Chat. Leo: I can bring the snacks, unread messages")).toBeVisible();
      await page.getByRole("button", { name: /^Going \d/ }).click();
      await expect(heading(page, "People")).toBeVisible();
      await btn(page, "Actions for Leo").click();
      await btn(page, "Block Leo").click();
      const blocked = f.log.length;
      await btn(page, "Block Leo").click();
      await expect(sheetOf(page).getByText("Blocked", { exact: true })).toBeVisible();
      // The page beneath read its chat again, before Back.
      await expect.poll(() => after(f, blocked, "chat_summary").length).toBeGreaterThan(0);
      // Its own read on return then fails, so the row shows what that read before Back brought.
      f.state.chat = "failed";
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, "Back").click();
      await expect(heading(page, "Coffee evening")).toBeVisible();
      await expect(btn(page, "Chat. Alex: See you there, unread messages")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Chat\. Leo/ })).toHaveCount(0);
    },
  );
  await scenario(
    "safety, chat row after a block, its read failing",
    { viewer: "guest", attendee: { version: 1, response: "accepted" }, guests: [ALEX, LEO_ON], chat: chatSummary(), chatFailsAfterBlock: true },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(btn(page, "Chat. Leo: I can bring the snacks, unread messages")).toBeVisible();
      await page.getByRole("button", { name: /^Going \d/ }).click();
      await btn(page, "Actions for Leo").click();
      await btn(page, "Block Leo").click();
      await btn(page, "Block Leo").click();
      await expect(sheetOf(page).getByText("Blocked", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await btn(page, "Back").click();
      // The block went through, so Leo's line is gone even though no read could say what came before it.
      await expect(btn(page, "Chat, unread messages")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Chat\. Leo/ })).toHaveCount(0);
    },
  );
  pass("safety, chat row after a block: blocking Leo from the people list over the resbite page reads the page's chat again before Back, so its Chat row reads Alex's line; with that read failing, Leo's line is dropped all the same");
  pass("safety, people: the people sheet offers Report and Block (last, Report first); a waiting join request Block only; a host's confirm adds R-Q6's line; a blocked person's row reads Blocked with Unblock and no Connect; with my_blocks failing no row offers Block, Unblock or Connect and no alert shows (N13); Block Leo (connected) reads my_blocks and plan_connection_states again and the row reads Blocked; Unblock reads both again and the row offers Connect, not Connected (NOTE 2)");

  // B1: the announcement line's Report or block, on Ana's resbite.
  await scenario(
    "safety, invitation announcement",
    {
      viewer: "guest",
      guests: [ALEX, BEA],
      overview: { chats: {}, announcements: { [PLAN_ID]: { id: 41, author_id: HOST.id, body: "Doors open at 19:30" } }, names: { [HOST.id]: "Ana" } },
    },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(text(page, "Hosted by Ana")).toBeVisible();
      await expect(text(page, "Announcement from Ana · Doors open at 19:30")).toBeVisible();
      const action = btn(page, "Report or block");
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      assert.ok(box.height >= 44, `Report or block is at least 44 pt (${box.height})`);
      assert.ok(await inOrder(page, [text(page, "Announcement from Ana · Doors open at 19:30"), action]), "beside the line, after it");
      await action.click();
      await expect.poll(() => sheetButtons(page)).toEqual(["Report message", "Report Ana", "Block Ana"]);
      await btn(page, "Report message").click();
      await page.getByRole("radio", { name: "Spam", exact: true }).click();
      await btn(page, "Send report").click();
      await expect(text(page, "Thanks. The Resbite team will look at it.")).toBeVisible();
      assert.deepEqual(f.rpcs("report_message"), [{ p_id: 41, p_reason: "spam", p_details: null }]);
      await btn(page, "Done").click();
      await btn(page, "Report or block").click();
      await btn(page, "Block Ana").click();
      await expect(sheetOf(page).getByText(QUESTION_ANA, { exact: true })).toBeVisible();
      const overviews = f.rpcs("my_chat_overview").length;
      await btn(page, "Block Ana").click();
      await expect(sheetOf(page).getByText("Blocked", { exact: true })).toBeVisible();
      assert.deepEqual(f.rpcs("block_user"), [{ p_user: HOST.id, p_block: true }]);
      await expect.poll(() => f.rpcs("my_chat_overview").length).toBeGreaterThan(overviews);
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await expect(text(page, "Announcement from Ana · Doors open at 19:30")).toHaveCount(0);
    },
  );
  // B4, R-Q1, I-2: no announcement; Pedro invited them, on Ana's resbite.
  await scenario(
    "safety, invitation inviter",
    { viewer: "guest", guests: [ALEX, BEA], overview: { chats: {}, announcements: {}, names: { [INVITER]: "Pedro" }, inviters: { [PLAN_ID]: INVITER } } },
    async (f) => {
      const { page } = f;
      await goto(f, `/event?plan=${PLAN_ID}`);
      await expect(btn(page, "Report or block")).toHaveCount(0);
      const more = bar(f).getByRole("button", { name: "More", exact: true });
      await more.click();
      await btn(page, "Report or block").click();
      await expect.poll(() => sheetButtons(page)).toEqual(["Report Pedro", "Block Pedro", "Report Ana", "Block Ana"]);
      await btn(page, "Report Pedro").click();
      await page.getByRole("radio", { name: "Spam", exact: true }).click();
      await btn(page, "Send report").click();
      await expect(text(page, "Thanks. The Resbite team will look at it.")).toBeVisible();
      assert.deepEqual(f.rpcs("report_user"), [{ p_user: INVITER, p_series: SERIES_ID, p_reason: "spam", p_details: null }]);
      await btn(page, "Done").click();
      await more.click();
      await btn(page, "Report or block").click();
      await btn(page, "Block Ana").click();
      await expect(sheetOf(page).getByText(QUESTION_ANA, { exact: true })).toBeVisible();
      await btn(page, "Keep").click();
      // Back on the list, focus on Block Ana (H32 Q53, ruling SR6 D1).
      await expect.poll(() => focusedText(page)).toBe("Block Ana");
      await btn(page, "Block Pedro").click();
      await expect(sheetOf(page).getByText(QUESTION_PEDRO, { exact: true })).toBeVisible();
      await btn(page, "Block Pedro").click();
      await expect(sheetOf(page).getByText("Blocked", { exact: true })).toBeVisible();
      assert.deepEqual(f.rpcs("block_user"), [{ p_user: INVITER, p_block: true }]);
      // The overview read again leaves Pedro out: Ana alone.
      await page.getByRole("button", { name: "Close sheet" }).first().click();
      await more.click();
      await btn(page, "Report or block").click();
      await expect.poll(() => sheetButtons(page)).toEqual(["Report Ana", "Block Ana"]);
    },
  );
  // I-2: the overview failing still leaves the owner to offer.
  await scenario("safety, invitation without the overview", { viewer: "guest", guests: [ALEX, BEA], overview: "failed" }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect.poll(() => f.rpcs("my_chat_overview").length).toBeGreaterThan(0);
    await bar(f).getByRole("button", { name: "More", exact: true }).click();
    await btn(page, "Report or block").click();
    await expect.poll(() => sheetButtons(page)).toEqual(["Report Ana", "Block Ana"]);
  });
  // Nobody to name (the host's name blank, no overview entry): no Report or block row, so no More either.
  await scenario("safety, invitation with nobody", { viewer: "guest", guests: [ALEX, BEA], hostName: "  " }, async (f) => {
    const { page } = f;
    await goto(f, `/event?plan=${PLAN_ID}`);
    await expect(page.getByRole("radiogroup", { name: "Your answer" })).toBeVisible();
    await expect.poll(() => f.rpcs("my_chat_overview").length).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await expect(btn(page, "More")).toHaveCount(0);
    await expect(btn(page, "Report or block")).toHaveCount(0);
  });
  pass("safety, invitation: on Ana's resbite, Announcement from Ana · Doors open at 19:30 has a Report or block button after it (44 pt) offering Report message, Report Ana and Block Ana (Ana once); Report message → Spam → report_message { p_id: 41 }; Block Ana's confirm (Ana hosts) → block_user, my_chat_overview again, and the line goes; with Pedro the inviter and no announcement, More → Report or block lists Report Pedro, Block Pedro, Report Ana, Block Ana; Report Pedro → report_user { p_series }; Block Pedro's guest confirm → block_user, and Pedro goes; a failing overview leaves Report Ana and Block Ana; with nobody to name, no row and no More");

  await scenario("edges", { guests: going2, failPlanRead: true }, async (f) => {
    const { page } = f;
    // No plan: not available, no spinner.
    for (const path of ["/guests", "/event"]) {
      await page.goto(`${base}${path}`);
      await expect(text(page, "This resbite isn’t available.")).toBeVisible();
      await expect(page.getByLabel("Loading this resbite")).toHaveCount(0);
      await expect(text(page, "Opening your resbite…")).toHaveCount(0);
    }
    // A failed read says so and offers Try again, which reads again.
    await page.goto(`${base}/guests?plan=${PLAN_ID}`);
    await expect(heading(page, "People")).toBeVisible();
    await expect(btn(page, "Try again")).toBeVisible();
    await expect(page.getByText(/^This invitation is unavailable, or its details could not be refreshed\./)).toBeVisible();
    f.state.failPlanRead = false;
    await btn(page, "Try again").click();
    // Going counts the owner's Hosting row as well as Alex and Bea.
    await expect(heading(page, "Going · 3")).toBeVisible();
    // Opened on its own (no history), Back goes to the resbite.
    await btn(page, "Back").click();
    await expect(page).toHaveURL(new RegExp(`/event\\?plan=${PLAN_ID}`));
    await expect(heading(page, "Coffee evening")).toBeVisible();
  });
  pass("edges: /guests and /event without a plan say This resbite isn’t available. (no spinner); a failed read of the list shows why with Try again, which loads it; Back with no history opens the resbite");

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
