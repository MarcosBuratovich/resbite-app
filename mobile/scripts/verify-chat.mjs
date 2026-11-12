// The chat screen (CH-02 to CH-08) in headless Chrome. Every request is intercepted: the app's own bundle from the dev
// server, every *.supabase.co request answered by the fixture below (an unknown one fails the run), anything else
// refused and failing the run. The Realtime socket is stubbed with page.routeWebSocket, speaking Phoenix vsn 2.0.0 (array
// frames): an ok phx_reply to the join of realtime:chat:<series>, heartbeats answered, and on demand a `broadcast` frame
// {event: "chat", payload: {id, kind, state}}. Time is page.clock's, and the fixture's server clock follows it.
//
// Run Expo web on 8087 (never 8081) with a fake https EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// then: RESBITE_QA_URL=http://localhost:8087 EXPO_PUBLIC_SUPABASE_URL=<the same URL> node scripts/verify-chat.mjs
// RESBITE_QA_SHOTS=<folder> saves screenshots at 390 px and at 320 px under Larger Text.
//
//   a0  links: https://example.com/x is a link that asks "Open example.com?" (Open, Cancel) before the browser; a phone
//       number, ftp:// and a host with a Cyrillic letter stay text (K-N14)
//   a   a Going guest: the header "Fri 30 Oct · 2 going", the pinned card, day separators hidden from the screen reader,
//       "Resbite: Mia joined" from `names`, the field's line; the channel joins privately with the access token
//   b   Send: send_message { p_series, p_body, p_client_id: a UUID }, the bubble on the right, read as "You, …"
//   c   a broadcast reads chat_messages_since { p_after: the newest id, p_changed_after: the last as_of − 2 min }
//   c2  a removal broadcast: the next answer carries the row removed; "Message removed by an admin", no text (K-B1)
//   c3  a late commit below the newest id takes its place (K-B1)
//   c4  an announcement broadcast reads chat_summary again, and the pinned card changes (K-S12)
//   d3  subscribed: 60 s of page.clock make no chat_messages_since (K-N6)
//   d   the socket refused: 20 s of page.clock read chat_messages_since and the message appears
//   d2  the socket refused: a removal arrives within one 20 s poll (K-B1)
//   e   a send that fails offline: "Not sent. Tap to retry."; a tap resends with the same p_client_id; Delete unsent
//       message takes a failed one off the phone without a call (K-S7)
//   e2  a message queued 11 s before the screen opened, not failed, is resent with its own p_client_id (K-S7)
//   f   the host: Announce opens the sheet on "Going · 4" with "Everyone invited · 5"; Everyone invited sends
//       send_announcement { p_audience: "everyone" } and the card reads "ANNOUNCEMENT · TO EVERYONE INVITED", pinned
//       (K-N7); Delete (own) and Remove (someone's) ask in place; the menu's People in this chat and Mute chat
//   g   after the end: "Ended · Sat 15 Nov · 7 going" and the closing line at 31 hours (K-N4)
//   h3  "Picnic in the park ended" between the messages before and after the end (K-S16)
//   g3  "in 59 minutes" with 59 minutes left, "in 1 minute" with 30 seconds left (K-N4)
//   g2  page.clock passes closesAt: chat_summary is read again and the closed card replaces the field (K-S10)
//   h   closed: no field, "This chat closed on Mon 17 Nov.", why, and Do this again for the host only
//   h2  closed: the host's long-press still offers Remove message, which calls remove_message (K-S17)
//   i   42501 'Not in this chat' on a refresh shows notInChat, the socket gets a phx_leave, and nothing more is read (K-N1)
//   j   Larger Text at 320 px: the composer, the pinned card and the closed card fit with no clipped text; each bubble
//       carries its accessibility actions (K-S14)
//   k   /chat?series=not-a-uuid shows notInChat and calls nothing (K-N14)
//   k2  no session to read with (the preview): /chat?series=<a valid id> shows notInChat, not an endless spinner, and
//       calls nothing (H41 m5)
//   l   a leave answered with an error (7.5b): no channel is left behind, so each return joins anew and is live, with
//       no poll
//   m   the pinned card loads back to an unloaded message and scrolls to it (K-S12)
//   n   the host's empty state: Nobody's going yet, Invite people (H12); a guest's: No messages yet
//   z2  a lone surrogate in the composer or the announcement field reads as U+FFFD and a NUL goes, as typed and as sent
//       (H41 m2)
//   ask Task 8 (CH-P17, K-N15): the first open of a chat, with the phone's permission never asked for, brings "Get
//       notified?" once; Not now closes it, and the next open doesn't bring it again; nobody outside the chat is asked
// A group (chat plan 2, Task 4): Board game night, every Thursday at 19:00 London. 20 and 27 Nov 2025 are Thursdays.
//   gr1 a member who said Can't go still reads and writes, sees "Sol can’t make it this week", and the field's line
//       is the group's
//   gr2 "Next one: Thu 20 Nov · Ana's flat" is a button with the hint "Opens the resbite" that opens the summary's
//       current occurrence; an older one, whose payload names an occurrence the reader has no row on, opens the same;
//       with no plan_id in the summary a tap re-reads the chat and stays on it (Decision 14, I5)
//   gr3 Leave group asks in place and calls leave_series { p_series }, then lands on My resbites; the phone's reminders
//       for the group go (review I2)
//   gr4 Leave group answered offline: the confirm stays with the error line, and a second tap calls leave_series again
//   gr4b a leave whose answer was lost, then 'Not in this group' on the next tap: done, it lands on My resbites (GR4 M-2)
//   gr4c two taps before a redraw send one leave; a refusal that lands after the menu closed isn't shown again (M3)
//   gr4d a leave whose answer was lost, then the chat's refused read: done, it lands on My resbites (GR6 M5)
//   gr5 the header "Every Thursday · 9 in the group"; stopped, "Last one · Thu 27 Nov · 9 in the group", which wraps
//       whole at 320 px under Larger Text (G-N7); after the last one, the closing line and the computed ended line
//   gr6 the host's Announce on a group: "Everyone in the group · 9" first and checked, then "Going this Thursday · 6",
//       "Write an update for the group"; the card is read as "Announcement to everyone in the group"
//   gr7 a stopped group after its close: "This group’s chat closed on Thu 27 Nov." and no field
//   gr8 after "Cancel just this one": "Ana cancelled this Thursday", no ended line, and the field stays
//   gr9 a can't-go line taken back (state deleted) leaves the open screen by the signal; "Sol joined" stays (Decision 6)
// Report, block and the chat rules (chat plan 3, Task 5). Every scenario's chat reads its people through the resbite's
// own reads (useEvent: the plan, its guests, the connection states and my_blocks, here [] unless a scenario blocks).
//   s1  a long-press on Leo's message → Report message: four radios, Send report disabled with the hint "Pick a reason
//       to send the report."; Spam → report_message { p_id, p_reason: "spam", p_details: null }, then the thanks
//   s2  the same answered offline: the sheet stays, the typed details stay, and the error line shows
//   s3  no Report message on one's own message, nor on a system line
//   s4  the menu → Report or block → Leo → Block Leo: the confirm's words; block_user { p_user, p_block: true }, then
//       chat_summary and chat_messages once each (the replace), and no bubble by Leo (G-S8, G-S14)
//   s4b People in this chat → /guests → Block Leo: the chat under it replaces its list before Back (B3)
//   s4c with Leo blocked, Blocked people pushed over the chat → Unblock Leo: the chat reads again before Back, and Leo's
//       bubbles are back (B3); /guests' Unblock stands in while /blocked-people (Task 6) isn't in this build
//   s5  a host blocking a guest reads the host's confirm, with owner question R-Q6's line
//   s6  a tap on an author's name → Block → confirm: focus lands on "Blocked" (G-N7)
//   s7  rules_accepted false: Send opens Chat rules; Cancel sends nothing and keeps the words; I agree calls
//       accept_chat_rules, then send_message once
//   s7b send_message refused 'Rules not accepted': "Not sent. Tap to retry.", Chat rules with the held line, no
//       connection line; I agree sends it once with the same p_client_id
//   s7c I agree answered offline: the sheet stays with its line and nothing is sent; a second I agree sends (I6)
//   s7d the host's announcement refused 'Rules not accepted': the Announce sheet closes into Chat rules; I agree sends
//       send_announcement with the same p_client_id, p_body and p_audience (I6)
//   s8  a send refused 'Not allowed' reads "That message can’t be sent."
//   s9  alone in the chat, the menu has no Report or block
//   s10 a row removed by Resbite reads "Message removed by Resbite"; a host's removal "Message removed by an admin"
// Fix round 1 (ruling SR6): focus moves into each new view of the menu's Report or block and back to Block after Keep
// (H32 Q53, in s4); "Blocked" is said once on a blocked person's row (s4);
//   s2b a message removed while its report is open keeps the sheet and the typed text, and says it can't be reported
//   s6b ruling SR9: a block the server answered false (nothing stored) closes the confirm with no "Blocked" and no other
//       line; the list then shows what my_blocks says
//   s7e Send announcement before the rules are agreed: the rules first; Cancel brings the words and audience back; I
//       agree sends it
//   s7f Cancel on an announcement held for the rules: the form again with its words and audience; it goes later with
//       the same p_client_id
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { button, heading, inOrder, visible } from "./qa-helpers.mjs";

const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8087";
const SUPABASE = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL || "https://chatfixture.supabase.co");
const STORAGE_KEY = `sb-${SUPABASE.hostname.split(".")[0]}-auth-token`;
const SHOTS = process.env.RESBITE_QA_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const ANA = "11111111-1111-4111-8111-111111111111";
const PEDRO = "22222222-2222-4222-8222-222222222222";
const MIA = "33333333-3333-4333-8333-333333333333";
const LEO = "44444444-4444-4444-8444-444444444444";
const SOL = "55555555-5555-4555-8555-555555555555";
const NAMES = { [ANA]: "Ana", [PEDRO]: "Pedro", [MIA]: "Mia", [LEO]: "Leo", [SOL]: "Sol" };
const SERIES = "5e000000-0000-4000-8000-000000000001";
const PLAN = "9a000000-0000-4000-8000-000000000001";
const TOPIC = `realtime:chat:${SERIES}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const iso = (ms) => new Date(ms).toISOString();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A label that starts with these words, whatever time follows. */
const starts = (words) => new RegExp(`^${escape(words)}`);

// One-off times. October: before the start (Fri 30 Oct 2026, GMT). November: the mockup's picnic, which ended Sat 15
// Nov 2025 at 18:00 London and closes Mon 17 Nov at 18:00.
const OCT = { now: "2026-10-28T10:00:00Z", startsAt: "2026-10-30T12:00:00Z", endsAt: "2026-10-30T15:00:00Z", closesAt: "2026-11-01T15:00:00Z" };
const NOV = { startsAt: "2025-11-15T14:00:00Z", endsAt: "2025-11-15T18:00:00Z", closesAt: "2025-11-17T18:00:00Z" };

/** A row as `chat_row` returns it. */
const row = (id, { kind = "message", author = null, body = null, state = "sent", at, event = null, payload = null, audience = null, clientId = null, hidden = false, plan = undefined } = {}) => ({
  id,
  // Chat plan 2's chat_row names the occurrence a row belongs to; chat core's rows have none.
  ...(plan ? { plan_id: plan } : {}),
  kind,
  audience,
  event,
  payload,
  body,
  state,
  author_id: author,
  created_at: at,
  updated_at: at,
  client_id: clientId,
  hidden,
});
const say = (id, author, body, at) => row(id, { author, body, at });
const CYRILLIC_HOST = "https://exаmple.com/z";
const octRows = () => [
  row(101, { kind: "system", event: "joined", payload: { actor: MIA, user: MIA }, at: "2026-10-27T18:00:00Z" }),
  row(102, { kind: "announcement", audience: "going", author: ANA, body: "Doors open at 11:30. Bring a blanket!", at: "2026-10-27T18:05:00Z" }),
  say(103, LEO, "Count me in", "2026-10-27T18:10:00Z"),
  say(104, MIA, `Map: https://example.com/x. Call 07700 900123, or see ftp://example.com/y and ${CYRILLIC_HOST}`, "2026-10-28T09:00:00Z"),
  row(105, { kind: "system", event: "changed", payload: { actor: ANA, what: "place", place_label: "Fixture park, north gate" }, at: "2026-10-28T09:30:00Z" }),
];
const novRows = () => [
  say(201, ANA, "Setting up by the oak tree", "2025-11-15T17:00:00Z"),
  say(202, ANA, "Thanks for coming everyone!", "2025-11-15T19:00:00Z"),
  say(203, LEO, "Best afternoon in ages", "2025-11-15T19:30:00Z"),
  say(204, PEDRO, "Same again next month?", "2025-11-15T20:00:00Z"),
  say(205, ANA, "Yes! I'll set it up with Do this again", "2025-11-16T09:00:00Z"),
];

// A group (chat plan 2): Board game night, every Thursday at 19:00 London; Thu 20 Nov 2025 is the current occurrence,
// and Thu 13 Nov last week's. Sol joined last week, the roll ended it and wrote the Next one line, and Sol can't go
// this week.
const GROUP_PLAN = "9a000000-0000-4000-8000-000000000020";
const OLD_PLAN = "9a000000-0000-4000-8000-000000000013";
const THU = { now: "2025-11-18T10:00:00Z", startsAt: "2025-11-20T19:00:00Z", endsAt: "2025-11-20T22:00:00Z", next: "2025-11-27T19:00:00Z" };
const GROUP = {
  title: "Board game night",
  plan_id: GROUP_PLAN,
  starts_at: THU.startsAt,
  ends_at: THU.endsAt,
  repeat_weeks: 1,
  is_group: true,
  // A running group has no close time and is open.
  closes_at: null,
  open: true,
  accepted: 6,
  members: 9,
  going: 6,
  everyone: 9,
};
const nextLine = (id, plan, startsAt, at) =>
  row(id, { kind: "system", event: "next", payload: { actor: null, plan_id: plan, starts_at: startsAt, time_zone: "Europe/London", place_label: "Ana's flat", place_tbd: false }, at, plan });
const groupRows = () => [
  row(401, { kind: "system", event: "joined", payload: { actor: SOL, user: SOL }, at: "2025-11-10T18:00:00Z", plan: OLD_PLAN }),
  row(402, { kind: "system", event: "ended", payload: { actor: null, title: "Board game night" }, at: "2025-11-13T22:00:00Z", plan: OLD_PLAN }),
  nextLine(403, GROUP_PLAN, THU.startsAt, "2025-11-14T03:00:00Z"),
  row(404, { author: ANA, body: "Who’s bringing Catan?", at: "2025-11-17T09:00:00Z", plan: GROUP_PLAN }),
  row(405, { kind: "system", event: "cant_go", payload: { actor: SOL, user: SOL }, at: "2025-11-17T10:00:00Z", plan: GROUP_PLAN }),
];

const jwt = (sub) =>
  [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    // Far ahead of every page.clock time here, so nothing refreshes.
    Buffer.from(JSON.stringify({ sub, exp: 4102444800, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");
const userOf = (id) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "447700900834",
  phone_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
});
// The plan row the people list reads (scenario l).
const PICNIC = {
  id: PLAN,
  activity_id: null,
  title: "Picnic in the park",
  description: "",
  categories: ["community"],
  owner_id: ANA,
  starts_at: OCT.startsAt,
  ends_at: OCT.endsAt,
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
  series_id: SERIES,
  repeats_from: null,
  has_meeting_details: false,
};

/**
 * A page signed in as `viewer` on a stubbed Supabase and a stubbed Realtime socket, its clock installed at `now`.
 * `rows` is the chat, `summary` the parts of chat_summary that differ from October's picnic; `open` is computed from
 * the server clock against `closes_at` unless the summary says otherwise. `socket: "refuse"` closes every socket.
 * `queue` seeds the phone's unsent messages.
 */
async function fixture({ viewer = PEDRO, now = OCT.now, rows = octRows(), summary = {}, socket = "ok", width = 390, height = 844, queue = null, refusals = [], permission = "denied", reminders = false, guests = [], blocked = [], serverAccepted, refuseSends = [], blockNotStored = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(now) });
  const installed = Date.now();
  let jumped = 0;
  const serverNow = () => Date.parse(now) + (Date.now() - installed) + jumped;
  await page.addInitScript(
    ({ key, session, queueKey, queue, permission }) => {
      // "denied" keeps "Get notified?" away (scenario ask covers it): it schedules nothing and never asks. Each read of
      // the permission is counted (`__permissionReads`), so a scenario can wait for the ask's own read.
      if (!globalThis.__resbiteDevice) {
        let current = permission;
        globalThis.__permissionReads = 0;
        globalThis.__resbiteDevice = {
          reminders: [],
          calendar: [],
          get permission() {
            globalThis.__permissionReads++;
            return current;
          },
          set permission(value) {
            current = value;
          },
        };
      }
      if (!sessionStorage.getItem("fixture-seeded")) {
        if (session) sessionStorage.setItem(key, JSON.stringify(session));
        if (queue) sessionStorage.setItem(queueKey, JSON.stringify(queue));
        sessionStorage.setItem("fixture-seeded", "1");
      }
      // Opening a link is recorded, never done.
      globalThis.__opened = [];
      window.open = (url) => {
        globalThis.__opened.push(String(url));
        return null;
      };
    },
    {
      key: STORAGE_KEY,
      // No viewer: nobody is signed in (scenario k2).
      session: viewer && {
        user: userOf(viewer),
        access_token: jwt(viewer),
        refresh_token: "fixture",
        token_type: "bearer",
        expires_at: 4102444800,
        expires_in: 3600,
      },
      queueKey: `resbite.chat-queue.v1.${viewer}`,
      queue,
      permission,
    },
  );
  const state = {
    rows: rows.map((r) => ({ ...r })),
    member: true,
    summary: {
      series_id: SERIES,
      plan_id: PLAN,
      title: "Picnic in the park",
      starts_at: OCT.startsAt,
      ends_at: OCT.endsAt,
      time_zone: "Europe/London",
      status: "active",
      repeat_weeks: null,
      is_group: false,
      stopped: false,
      closes_at: OCT.closesAt,
      host: viewer === ANA,
      accepted: 2,
      members: 4,
      going: 4,
      everyone: 5,
      muted_chat: false,
      muted_resbite: false,
      last_read_id: null,
      unread: false,
      // Chat plan 3: the reader agreed to the chat rules (a scenario that tests the rules says otherwise).
      rules_accepted: true,
      ...summary,
    },
    // Chat plan 3. The occurrence's guests, as the people list reads them (the viewer's own row among them); the people
    // the viewer blocked (my_blocks), whose rows the chat's reads leave out, as the server does (I1).
    guests: guests.map(({ id, response = "accepted" }) => ({ user_id: id, response, brought_by: null, level: 1, profiles: { display_name: NAMES[id] } })),
    blocked: [...blocked],
    // The server's own record of the rules (accept_chat_rules), which a stale summary can contradict (s7b).
    accepted: serverAccepted ?? (summary.rules_accepted ?? true),
    // The next send_message refusals ({ code, message }), one per send; the next reports and I agrees lost offline.
    refuseSends: [...refuseSends],
    failReports: 0,
    failAccepts: 0,
    // How many of the next sends fail as a lost connection, and how long each send waits before its answer.
    failSends: 0,
    delaySends: 0,
    // The next send_announcement's refusal ({ code, message }), once.
    refuseAnnounce: null,
    // send_message answers 22023 'Chat closed', and the summary then reads closed.
    closeOnSend: false,
    // How many of the next earlier pages (p_before set) fail as a lost connection, and how long each waits first.
    failEarlier: 0,
    delayEarlier: 0,
    // The answers to the next phx_leave frames; "ok" once these run out, or always `leaveDefault`.
    leaves: [],
    leaveDefault: "ok",
    // How many of the next leave_series calls fail as a lost connection (gr4); how many go through on the server and
    // then lose their answer (gr4b); how long each waits before its answer (gr4c).
    failLeaves: 0,
    lostLeaves: 0,
    delayLeaves: 0,
    // The reminder sync reads the group's current occurrence, Going, while the viewer is in it (gr3, review I2).
    reminders,
    socket,
  };
  const log = [],
    errors = [],
    unexpected = [],
    frames = [],
    asOfs = [];
  let lastRequest = Date.now();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // A lost connection and a refused socket are failures under test; a refusal's status (403, 400) only where the
    // scenario expects one (`refusals`).
    const refused = refusals.some((status) => m.text().includes(`status of ${status}`));
    if (m.type() === "error" && !refused && !/ERR_INTERNET_DISCONNECTED|ERR_FAILED|WebSocket/.test(m.text())) errors.push(m.text());
  });

  const visibleRows = () => state.rows.filter((r) => !r.hidden && !state.blocked.includes(r.author_id)).sort((a, b) => a.id - b.id);
  const view = (r) => {
    const { hidden: _hidden, client_id, ...rest } = r;
    return { ...rest, body: r.state === "sent" ? r.body : null, ...(r.author_id === viewer ? { client_id } : {}) };
  };
  const namesOf = (list) => {
    const out = {};
    for (const r of list) for (const id of [r.author_id, r.payload?.actor, r.payload?.user, r.payload?.brought_by]) if (id) out[id] = NAMES[id] ?? null;
    return out;
  };
  const page_ = (list) => {
    const as_of = iso(serverNow());
    asOfs.push(as_of);
    return { rows: list.map(view), names: namesOf(list), as_of };
  };
  const summaryNow = () => {
    const shown = visibleRows();
    const pinned = shown.filter((r) => r.kind === "announcement" && r.state === "sent").at(-1) ?? null;
    const s = state.summary;
    const open = s.open ?? (s.status !== "cancelled" && s.closes_at !== null && serverNow() < Date.parse(s.closes_at));
    return {
      ...s,
      open,
      pinned: pinned && view(pinned),
      last: shown.length ? view(shown.at(-1)) : null,
      names: namesOf(shown),
      message_count: shown.filter((r) => r.kind !== "system" && r.state === "sent").length,
    };
  };
  const nextId = () => Math.max(0, ...state.rows.map((r) => r.id)) + 1;
  const refused = (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "Not in this chat", details: null, hint: null }) });

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === new URL(base).origin) return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) {
      unexpected.push(`${req.method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    lastRequest = Date.now();
    const method = req.method();
    const path = url.pathname;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    log.push({ method, path, body, at: serverNow() });
    const reply = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    const empty = () => route.fulfill({ status: 204, body: "" });
    if (path === "/auth/v1/user") return reply(userOf(viewer));
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: viewer, status: "approved" });
    if (path === "/rest/v1/rpc/note_app_session") return empty();
    // A profile by id: the viewer's own, or the owner's name for the resbite's own read (the chat's people).
    if (path === "/rest/v1/profiles") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? viewer;
      return reply({ id, display_name: NAMES[id] ?? null, avatar_path: null, avatar_revision: 0 });
    }
    // The people list (scenario l): the plan, nobody else on it, and the reads around it.
    if (path === "/rest/v1/plans" && url.searchParams.get("id") === `eq.${PLAN}`) return reply({ ...PICNIC, plan_meeting_details: null, plan_admins: [] });
    // A group's current occurrence, which a Next one line opens (gr2).
    if (path === "/rest/v1/plans" && url.searchParams.get("id") === `eq.${GROUP_PLAN}`)
      return reply({ ...PICNIC, id: GROUP_PLAN, title: "Board game night", starts_at: THU.startsAt, ends_at: THU.endsAt, repeat_weeks: 1, plan_meeting_details: null, plan_admins: [] });
    // The phone's reminder sync (review I2): the group's occurrence, which the viewer is Going to, while they're in it.
    if (state.reminders && path === "/rest/v1/plans" && url.searchParams.get("select") === "id,title,starts_at,status,owner_id,series_id")
      return reply(state.member ? [{ id: GROUP_PLAN, title: "Board game night", starts_at: THU.startsAt, status: "active", owner_id: ANA, series_id: SERIES }] : []);
    if (state.reminders && path === "/rest/v1/attendees" && url.searchParams.get("select") === "plan_id,response")
      return reply(state.member ? [{ plan_id: GROUP_PLAN, response: "accepted" }] : []);
    if (path === "/rest/v1/attendees" && url.searchParams.get("plan_id") === `eq.${PLAN}`)
      return reply(url.searchParams.get("select") === "version,response" ? { version: 1, response: "accepted" } : state.guests);
    if (["/rest/v1/rpc/plan_connection_states", "/rest/v1/rpc/plan_bringers"].includes(path)) return reply({});
    if (["/rest/v1/rpc/plan_phone_invitations", "/rest/v1/rpc/plan_brought_invitations", "/rest/v1/rpc/my_join_requests", "/rest/v1/rpc/plan_join_requests"].includes(path))
      return reply([]);
    if (["/rest/v1/plans", "/rest/v1/attendees", "/rest/v1/plan_mutes", "/rest/v1/activities"].includes(path)) return reply([]);

    const rpc = path.startsWith("/rest/v1/rpc/") ? path.slice("/rest/v1/rpc/".length) : null;
    // Chat plan 3: the viewer's blocks, block and unblock, the reports and the chat rules, as Tasks 1 and 2 define them.
    // Newest first, with each block's time, as the server answers (ad0a3e6).
    if (rpc === "my_blocks") return reply(state.blocked.map((id) => ({ user_id: id, name: NAMES[id] ?? null, at: iso(serverNow()) })));
    if (rpc === "block_user") {
      state.blocked = state.blocked.filter((id) => id !== body.p_user);
      if (body.p_block && !blockNotStored) state.blocked.unshift(body.p_user);
      // `stored` (server review M7): a block row exists afterwards for a block, none for an unblock; `blockNotStored`
      // answers false for a block (the person can't be seen any more, so nothing was stored).
      return reply(body.p_block === true && !blockNotStored);
    }
    if (rpc === "report_message" || rpc === "report_user") {
      if (state.failReports > 0) {
        state.failReports--;
        return route.abort("internetdisconnected");
      }
      return empty();
    }
    if (rpc === "accept_chat_rules") {
      if (state.failAccepts > 0) {
        state.failAccepts--;
        return route.abort("internetdisconnected");
      }
      state.accepted = true;
      state.summary.rules_accepted = true;
      return empty();
    }
    // The resbite page's group flag (chat plan 2's series_is_group), as the summary says.
    if (rpc === "series_is_group") return reply(state.member && state.summary.is_group === true);
    // My resbites, where Leave group lands (gr3): nothing listed, nothing unread.
    if (rpc === "my_chat_overview") return reply({ chats: {}, announcements: {}, names: {} });
    // Leave group (gr3, gr4): the next `failLeaves` are lost as a lost connection would; then the reader is out.
    if (rpc === "leave_series") {
      assert.equal(body?.p_series, SERIES, "leave_series names the series");
      if (state.delayLeaves) await new Promise((r) => setTimeout(r, state.delayLeaves));
      if (state.failLeaves > 0) {
        state.failLeaves--;
        return route.abort("internetdisconnected");
      }
      // Someone no longer in the group is refused, as leave_series refuses them.
      if (!state.member) return reply({ code: "42501", message: "Not in this group", details: null, hint: null }, 403);
      state.member = false;
      if (state.lostLeaves > 0) {
        state.lostLeaves--;
        return route.abort("internetdisconnected");
      }
      return empty();
    }
    if (rpc && (rpc.startsWith("chat_") || ["send_message", "send_announcement", "remove_message", "delete_message", "mark_chat_read", "set_chat_mute"].includes(rpc))) {
      if (body?.p_series !== undefined) assert.equal(body.p_series, SERIES, `${rpc} names the series`);
      if (!state.member) return refused(route);
    }
    if (rpc === "chat_summary") return reply(summaryNow());
    if (rpc === "chat_messages") {
      if (body.p_before !== null) {
        if (state.delayEarlier) await new Promise((r) => setTimeout(r, state.delayEarlier));
        if (state.failEarlier > 0) {
          state.failEarlier--;
          return route.abort("internetdisconnected");
        }
      }
      const limit = Math.min(Math.max(body.p_limit ?? 50, 1), 100);
      const before = visibleRows().filter((r) => body.p_before === null || r.id < body.p_before);
      return reply(page_(before.slice(-limit)));
    }
    if (rpc === "chat_messages_since") {
      const after = body.p_after;
      const changed = body.p_changed_after === null ? null : Date.parse(body.p_changed_after);
      const list = visibleRows().filter((r) => (after !== null && r.id > after) || (changed !== null && Date.parse(r.updated_at) > changed));
      return reply(page_(list.slice(0, 200)));
    }
    if (rpc === "send_announcement" && state.refuseAnnounce) {
      const { code, message, host } = state.refuseAnnounce;
      state.refuseAnnounce = null;
      if (host === false) state.summary.host = false;
      return reply({ code, message, details: null, hint: null }, code === "42501" ? 403 : 400);
    }
    if (rpc === "send_message" && state.refuseSends.length) {
      const { code, message } = state.refuseSends.shift();
      return reply({ code, message, details: null, hint: null }, 400);
    }
    // The server refuses a message from someone who hasn't agreed to the chat rules (G-B4(d)).
    if ((rpc === "send_message" || rpc === "send_announcement") && !state.accepted)
      return reply({ code: "22023", message: "Rules not accepted", details: null, hint: null }, 400);
    if (rpc === "send_message" && state.closeOnSend) {
      state.summary.open = false;
      return reply({ code: "22023", message: "Chat closed", details: null, hint: null }, 400);
    }
    if (rpc === "send_message" || rpc === "send_announcement") {
      if (state.delaySends) await new Promise((r) => setTimeout(r, state.delaySends));
      if (state.failSends > 0) {
        state.failSends--;
        return route.abort("internetdisconnected");
      }
      const held = state.rows.find((r) => r.client_id === body.p_client_id && r.author_id === viewer);
      if (held) return reply(view(held));
      const at = iso(serverNow());
      const made = row(nextId(), {
        kind: rpc === "send_message" ? "message" : "announcement",
        audience: rpc === "send_message" ? null : body.p_audience,
        author: viewer,
        body: body.p_body,
        at,
        clientId: body.p_client_id,
      });
      state.rows.push(made);
      return reply(view(made));
    }
    if (rpc === "remove_message" || rpc === "delete_message") {
      const target = state.rows.find((r) => r.id === body.p_id);
      if (target) Object.assign(target, { state: rpc === "remove_message" ? "removed" : "deleted", body: null, updated_at: iso(serverNow()) });
      return empty();
    }
    if (rpc === "mark_chat_read") return empty();
    if (rpc === "set_chat_mute") {
      state.summary.muted_chat = body.p_muted;
      return empty();
    }
    unexpected.push(`${method} ${path}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });

  // The Realtime socket (Phoenix vsn 2.0.0: [join_ref, ref, topic, event, payload]).
  const joined = new Map();
  let socketsOpened = 0;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    socketsOpened++;
    if (state.socket === "refuse") {
      ws.close();
      return;
    }
    ws.onMessage((raw) => {
      const [join_ref, ref, topic, event, payload] = JSON.parse(String(raw));
      frames.push({ join_ref, ref, topic, event, payload });
      const answer = (status, response = {}) => ws.send(JSON.stringify([join_ref, ref, topic, "phx_reply", { status, response }]));
      if (topic === "phoenix" && event === "heartbeat") return answer("ok");
      if (event === "phx_join") {
        joined.set(topic, { ws, join_ref });
        return answer("ok", { postgres_changes: [] });
      }
      if (event === "phx_leave") {
        const status = state.leaves.length ? state.leaves.shift() : state.leaveDefault;
        if (status === "ok") joined.delete(topic);
        return answer(status, status === "ok" ? {} : { reason: "Fixture refused the leave" });
      }
    });
  });

  const calls = (name) => log.filter((x) => x.method === "POST" && x.path === `/rest/v1/rpc/${name}`).map((x) => x.body);
  return {
    page,
    state,
    frames,
    asOfs,
    calls,
    /** Where the request log stands now, for `callsSince`. */
    mark: () => log.length,
    /** The calls of one RPC made after a `mark`. */
    callsSince: (mark, name) => log.slice(mark).filter((x) => x.method === "POST" && x.path === `/rest/v1/rpc/${name}`).map((x) => x.body),
    serverNow,
    socketsOpened: () => socketsOpened,
    joins: () => frames.filter((f) => f.event === "phx_join" && f.topic === TOPIC),
    leavesSent: () => frames.filter((f) => f.event === "phx_leave" && f.topic === TOPIC),
    /** Pushes `{id, kind, state}` to every socket that joined the chat's topic. */
    signal(payload) {
      const j = joined.get(TOPIC);
      assert.ok(j, "the chat's channel is joined");
      j.ws.send(JSON.stringify([null, null, TOPIC, "broadcast", { type: "broadcast", event: "chat", payload }]));
    },
    /** page.clock forward, in steps short enough for each heartbeat's answer to arrive before its timeout. */
    async advance(ms) {
      for (let left = ms; left > 0; ) {
        const step = Math.min(10_000, left);
        await page.clock.runFor(step);
        jumped += step;
        left -= step;
        await page.waitForTimeout(40);
      }
    },
    /** Waits until no request has been made for `quiet` ms. */
    async settle(quiet = 400) {
      const until = Date.now() + 10_000;
      while (Date.now() < until) {
        if (Date.now() - lastRequest >= quiet) return;
        await page.waitForTimeout(50);
      }
      throw Error("The page kept making requests");
    },
    add(r) {
      state.rows.push(r);
      return r;
    },
    change(id, patch) {
      const r = state.rows.find((x) => x.id === id);
      Object.assign(r, patch, { updated_at: iso(serverNow()) });
      return r;
    },
    async shot(name) {
      if (!SHOTS) return;
      // A sheet's fade in or out has finished.
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(SHOTS, name), fullPage: false });
    },
    async done() {
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors");
      await context.close();
    },
  };
}

const text = (page, words) => visible(page.getByText(words, { exact: true }));
const labelled = (page, label) => visible(page.getByLabel(label, { exact: typeof label === "string" }));
const field = (page) => visible(page.getByRole("textbox", { name: "Message", exact: true }));
const openChat = async (page, query = "") => {
  await page.goto(`${base}/chat?series=${SERIES}${query}`);
  await expect(heading(page, "Picnic in the park")).toBeVisible();
};
/** True when the locator's first match is rendered and intersects the viewport. */
async function inViewport(locator) {
  if ((await locator.count()) === 0) return false;
  const box = await locator.first().boundingBox();
  const size = locator.page().viewportSize();
  return !!box && box.y + box.height > 0 && box.y < size.height && box.x + box.width > 0 && box.x < size.width;
}
/** Scrolls the chat's list: "top" is the oldest end (the list is inverted), a number is a scrollTop. */
const scrollList = (page, to) =>
  page.evaluate((to) => {
    const el = [...document.querySelectorAll("div")]
      .filter((d) => /(auto|scroll)/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 10)
      .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    el.scrollTop = to === "top" ? el.scrollHeight : to;
    return el.scrollTop;
  }, to);
/** Opens a screen in place, by expo-router's own router as the development bundle registers it (no reload). */
const pushRoute = (page, to) =>
  page.evaluate((to) => {
    const modules = globalThis.__r.getModules();
    const entries = modules instanceof Map ? [...modules.entries()] : Object.entries(modules);
    const [id] = entries.find(([, m]) => /expo-router\/build\/imperative-api\.js$/.test(m?.verboseName ?? ""));
    globalThis.__r(Number(id)).router.push(to);
  }, to);
/** The element that has focus now, by its text. */
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent ?? null);
/** The chat set: no request of these may leave for a series that isn't one (K-N14, H31). */
const CHAT_SET = ["chat_summary", "chat_messages", "chat_messages_since", "send_message", "send_announcement", "remove_message", "delete_message", "mark_chat_read", "set_chat_mute", "my_chat_overview"];
const many = (n, from = 106, at = "2026-10-28T09:40:00Z") =>
  Array.from({ length: n }, (_, i) => say(from + i, i % 2 ? LEO : MIA, `Message number ${i + 1}`, iso(Date.parse(at) + i * 1_000)));
const top = async (locator) => (await locator.first().boundingBox()).y;
/** Holds the press long enough for a long-press (Pressable's 500 ms default; the bubbles use 400 ms). */
const longPress = (locator) => locator.first().click({ delay: 700 });
/**
 * The props of the component that gives this element its label (the bubble's Pressable), as React holds them now.
 * react-native-web renders no accessibility actions, so the check reads them there. A DOM node's fiber may be the
 * previous render's (its alternate), so each level takes whichever copy carries the label the element shows now.
 */
const pressableProps = (el) => {
  const label = el.getAttribute("aria-label");
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  for (let f = el[key]; f; f = f.return)
    for (const copy of [f, f.alternate])
      if (copy?.memoizedProps && "onAccessibilityAction" in copy.memoizedProps && copy.memoizedProps.accessibilityLabel === label)
        return copy.memoizedProps;
  return null;
};
/**
 * The hint the screen reader reads after an element's label (accessibilityHint), as React holds it: react-native-web
 * renders no hint, so the check reads the props of the component that gives the element its label, as above.
 */
const hintOf = (locator) =>
  locator.first().evaluate((el) => {
    const label = el.getAttribute("aria-label");
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    for (let f = el[key]; f; f = f.return)
      for (const copy of [f, f.alternate])
        if (copy?.memoizedProps && "accessibilityHint" in copy.memoizedProps && copy.memoizedProps.accessibilityLabel === label)
          return copy.memoizedProps.accessibilityHint ?? null;
    return null;
  });
const a11yActions = (locator) =>
  locator.first().evaluate((el, find) => new Function("el", `return (${find})(el)`)(el)?.accessibilityActions ?? [], pressableProps.toString());
const runA11yAction = (locator, actionName) =>
  locator.first().evaluate(
    (el, [find, name]) => {
      const props = new Function("el", `return (${find})(el)`)(el);
      if (!props) throw Error("no accessibility action handler");
      props.onAccessibilityAction({ nativeEvent: { actionName: name } });
    },
    [pressableProps.toString(), actionName],
  );
/** No text clipped: each element's content fits its box, and nothing scrolls sideways. */
async function unclipped(page, locators, width) {
  for (const locator of locators) {
    const fits = await locator.first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
    assert.ok(fits, `not clipped: ${await locator.first().textContent()}`);
    const box = await locator.first().boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `inside ${width} px: ${await locator.first().textContent()}`);
  }
  assert.ok(await page.evaluate((w) => document.documentElement.scrollWidth <= w, width), "no sideways scrolling");
}

try {
  // (k) A series that isn't one: notInChat, and nothing is called.
  {
    const f = await fixture();
    const { page } = f;
    await page.goto(`${base}/chat?series=not-a-uuid`);
    await expect(text(page, "You’re not in this chat.")).toBeVisible();
    await page.goto(`${base}/chat?series=${SERIES.toUpperCase()}`);
    await expect(text(page, "You’re not in this chat.")).toBeVisible();
    await page.waitForTimeout(500);
    for (const name of CHAT_SET) assert.equal(f.calls(name).length, 0, `no ${name}`);
    assert.equal(f.joins().length, 0, "no channel");
    await f.done();
  }
  console.log("PASS (k): a malformed series shows notInChat and makes no request of the chat set.");

  // (k2) No session to read with: the preview, reached by URL, gets the notice and no endless spinner (H41 m5).
  {
    const f = await fixture({ viewer: null });
    const { page } = f;
    await page.goto(base);
    await visible(page.getByText("Preview the design", { exact: true })).click();
    await expect(page.getByRole("tab", { name: "My resbites", exact: true })).toBeVisible();
    // A reload would end the preview, so the screen is opened in place, by expo-router's own router as the development
    // bundle registers it.
    await page.evaluate((to) => {
      const modules = globalThis.__r.getModules();
      const entries = modules instanceof Map ? [...modules.entries()] : Object.entries(modules);
      const [id] = entries.find(([, m]) => /expo-router\/build\/imperative-api\.js$/.test(m?.verboseName ?? ""));
      globalThis.__r(Number(id)).router.push(to);
    }, `/chat?series=${SERIES}`);
    await expect(page).toHaveURL(`${base}/chat?series=${SERIES}`);
    await expect(text(page, "You’re not in this chat.")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Chat", exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);
    for (const name of CHAT_SET) assert.equal(f.calls(name).length, 0, `no ${name}`);
    assert.equal(f.joins().length, 0, "no channel");
    await f.done();
  }
  console.log("PASS (k2): with no session to read with, a valid series shows notInChat, no spinner, and makes no request of the chat set.");

  // (a), (a0), (b), (c), (c3), (c2), (c4), (d3) as Pedro, Going.
  {
    const f = await fixture();
    const { page } = f;
    await openChat(page);
    // (a) The header, the pinned card, separators, a system line, the field's line.
    await expect(text(page, "Fri 30 Oct · 2 going")).toBeVisible();
    const pinned = button(page, /^PINNED, /);
    await expect(pinned).toBeVisible();
    await expect(pinned).toHaveAccessibleName("PINNED, Announcement to people going, Ana, Doors open at 11:30. Bring a blanket!, Tue 27 Oct, 18:05");
    await expect(visible(pinned.getByText("Doors open at 11:30. Bring a blanket!", { exact: true }))).toBeVisible();
    for (const day of ["Tue 27 Oct", "Wed 28 Oct"]) {
      await expect(text(page, day)).toBeVisible();
      assert.equal(await text(page, day).evaluate((el) => !!el.closest('[aria-hidden="true"]')), true, `${day} is hidden from the screen reader`);
    }
    await expect(labelled(page, "Resbite: Mia joined")).toBeVisible();
    await expect(labelled(page, "Resbite: Mia joined")).toHaveText("Mia joined");
    await expect(labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10")).toBeVisible();
    // One element for the screen reader, named by its label, and at least 44 pt tall (H32 Q49, H31).
    await expect(visible(page.getByRole("article", { name: "Leo, Count me in, Tue 27 Oct, 18:10", exact: true }))).toBeVisible();
    assert.ok((await labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10").boundingBox()).height >= 44, "a bubble is at least 44 pt");
    await expect(text(page, "To: people going. People who join later can read this too.")).toBeVisible();
    await expect(button(page, "Announce")).toHaveCount(0);
    await expect(page.getByText(/^This chat closes/)).toHaveCount(0);
    // The change chip, someone else's: Tap to see.
    await expect(button(page, "Resbite: Ana changed the place · Fixture park, north gate · Tap to see")).toBeVisible();
    assert.deepEqual(f.calls("chat_summary")[0], { p_series: SERIES });
    assert.deepEqual(f.calls("chat_messages")[0], { p_series: SERIES, p_before: null, p_limit: 50 });
    await expect.poll(() => f.calls("mark_chat_read").at(-1)).toEqual({ p_series: SERIES, p_last_id: 105 });
    // The channel: private, with the access token, and SUBSCRIBED reads once.
    await expect.poll(() => f.joins().length).toBe(1);
    const join_ = f.joins()[0].payload;
    assert.equal(join_.config.private, true, "the channel is private");
    assert.equal(join_.access_token, jwt(PEDRO), "the join carries the access token");
    await expect.poll(() => f.calls("chat_messages_since").length).toBeGreaterThanOrEqual(1);
    assert.equal(f.calls("chat_messages_since")[0].p_after, 105);
    // The bubble's text keeps its own direction (an isolate on the web).
    assert.equal(await labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10").getByText("Count me in").getAttribute("dir"), "auto");
    console.log("PASS (a): the header, the pinned card, hidden day separators, Resbite: Mia joined, the field's line, a private channel.");

    // (a0) Links.
    const mias = labelled(page, starts("Mia, Map: "));
    const links = mias.getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveText("https://example.com/x");
    for (const plain of ["07700 900123", "ftp://example.com/y", CYRILLIC_HOST]) await expect(mias).toContainText(plain);
    await links.first().click();
    await expect(heading(page, "Open example.com?")).toBeVisible();
    assert.deepEqual(await page.evaluate(() => globalThis.__opened), [], "nothing opens before the answer");
    await button(page, "Cancel").click();
    await expect(heading(page, "Open example.com?")).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => globalThis.__opened), []);
    await links.first().click();
    await button(page, "Open").click();
    await expect.poll(() => page.evaluate(() => globalThis.__opened)).toEqual(["https://example.com/x"]);
    await expect(heading(page, "Open example.com?")).toHaveCount(0);
    console.log("PASS (a0): only https://example.com/x is a link, and it asks Open example.com? before the browser.");

    // (b) Send.
    await f.settle();
    await field(page).fill("I can bring the snacks");
    await button(page, "Send").click();
    await expect(field(page)).toHaveValue("");
    await expect.poll(() => f.calls("send_message").length).toBe(1);
    const sent = f.calls("send_message")[0];
    assert.equal(sent.p_series, SERIES);
    assert.equal(sent.p_body, "I can bring the snacks");
    assert.match(sent.p_client_id, UUID);
    const mine = labelled(page, /^You, I can bring the snacks, 10:0\d$/);
    await expect(mine).toBeVisible();
    const box = await mine.first().boundingBox();
    assert.ok(box.x + box.width > 390 - 30 && box.x > 120, `your bubble is on the right (${box.x}, ${box.width})`);
    console.log("PASS (b): send_message { p_series, p_body, p_client_id: a UUID }, and the bubble on the right.");

    // (c) A broadcast reads since with the newest id and the last as_of − 2 minutes; Leo's message appears.
    await f.settle();
    const ownId = Math.max(...f.state.rows.map((r) => r.id));
    const at = f.serverNow();
    const late = f.add(row(ownId + 1, { author: LEO, body: "On my way", at: iso(at - 3000), hidden: true }));
    f.add(say(ownId + 2, LEO, "See you there", iso(at)));
    const before = f.calls("chat_messages_since").length;
    const lastAsOf = f.asOfs.at(-1);
    f.signal({ id: ownId + 2, kind: "message", state: "sent" });
    await expect(labelled(page, starts("Leo, See you there, "))).toBeVisible();
    const since = f.calls("chat_messages_since")[before];
    assert.deepEqual(since, { p_series: SERIES, p_after: ownId, p_changed_after: iso(Date.parse(lastAsOf) - 120_000) });
    console.log("PASS (c): a broadcast reads chat_messages_since { p_after: the newest id, p_changed_after: as_of − 2 min }.");

    // (c3) The late commit, below the newest id, takes its place.
    await f.settle();
    late.hidden = false;
    f.change(late.id, {});
    f.signal({ id: late.id, kind: "message", state: "sent" });
    const onMyWay = labelled(page, starts("Leo, On my way, "));
    await expect(onMyWay).toBeVisible();
    const ys = [await top(mine), await top(onMyWay), await top(labelled(page, starts("Leo, See you there, ")))];
    assert.ok(ys[0] < ys[1] && ys[1] < ys[2], `the late row sits between (${ys})`);
    console.log("PASS (c3): a late commit below the newest id appears in its place.");

    // (c2) A removal: the row comes back removed, with no text.
    await f.settle();
    const summaries = f.calls("chat_summary").length;
    f.change(103, { state: "removed", body: null });
    f.signal({ id: 103, kind: "message", state: "removed" });
    await expect(labelled(page, "Leo, Message removed by an admin, Tue 27 Oct, 18:10")).toBeVisible();
    await expect(page.getByText("Count me in")).toHaveCount(0);
    await expect.poll(() => f.calls("chat_summary").length).toBeGreaterThan(summaries);
    console.log("PASS (c2): a removal broadcast leaves Message removed by an admin and no text.");

    // (c4) An announcement: the summary again, and the pinned card changes.
    await f.settle();
    const reads = f.calls("chat_summary").length;
    const ann = f.add(row(Math.max(...f.state.rows.map((r) => r.id)) + 1, { kind: "announcement", audience: "everyone", author: ANA, body: "Rain plan: we move to the café", at: iso(f.serverNow()) }));
    f.signal({ id: ann.id, kind: "announcement", state: "sent" });
    await expect(visible(pinned.getByText("Rain plan: we move to the café", { exact: true }))).toBeVisible();
    assert.ok(f.calls("chat_summary").length > reads, "the summary is read again");
    await expect(visible(page.getByText("ANNOUNCEMENT · TO EVERYONE INVITED", { exact: true }))).toBeVisible();
    console.log("PASS (c4): an announcement broadcast reads chat_summary again and the pinned card changes.");
    await f.shot("task-7-chat-390.png");

    // (d3) Subscribed: no poll in 60 s.
    await f.settle();
    const polled = f.calls("chat_messages_since").length;
    await f.advance(60_000);
    assert.equal(f.calls("chat_messages_since").length, polled, "no chat_messages_since while subscribed");
    console.log("PASS (d3): with the socket subscribed, 60 s of page.clock call no chat_messages_since.");
    await f.done();
  }

  // (d), (d2) The socket refused: the 20 s poll.
  {
    const f = await fixture({ socket: "refuse" });
    const { page } = f;
    await openChat(page);
    await expect(labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10")).toBeVisible();
    await f.settle();
    assert.ok(f.socketsOpened() >= 1, "the app tried the socket");
    assert.equal(f.joins().length, 0);
    const before = f.calls("chat_messages_since").length;
    f.add(say(106, LEO, "Anyone need a lift?", iso(f.serverNow())));
    await f.advance(20_000);
    await expect(labelled(page, starts("Leo, Anyone need a lift?, "))).toBeVisible();
    assert.ok(f.calls("chat_messages_since").length > before, "the poll read chat_messages_since");
    console.log("PASS (d): with the socket refused, 20 s of page.clock read chat_messages_since and the message appears.");
    f.change(103, { state: "removed", body: null });
    await f.advance(20_000);
    await expect(labelled(page, "Leo, Message removed by an admin, Tue 27 Oct, 18:10")).toBeVisible();
    await expect(page.getByText("Count me in")).toHaveCount(0);
    console.log("PASS (d2): with the socket refused, a removal arrives within one 20 s poll.");
    await f.done();
  }

  // (e2) A message left behind 11 s before the screen opened; (e) a failed send and its retry; Delete unsent message.
  {
    const LEFT = "0e000000-0000-4000-8000-0000000000e2";
    const f = await fixture({
      queue: [{ clientId: LEFT, series: SERIES, body: "Left behind", createdAt: iso(Date.parse(OCT.now) - 11_000), failed: false }],
    });
    const { page } = f;
    await openChat(page);
    await expect.poll(() => f.calls("send_message").map((b) => b.p_client_id)).toEqual([LEFT]);
    assert.equal(f.calls("send_message")[0].p_body, "Left behind");
    await expect(labelled(page, starts("You, Left behind, "))).toBeVisible();
    console.log("PASS (e2): a message queued 11 s before the screen opened is resent with its own p_client_id.");

    await f.settle();
    f.state.failSends = 1;
    await field(page).fill("Is it still on?");
    await button(page, "Send").click();
    const failed = labelled(page, /^You, Is it still on\?, 10:0\d, Not sent\. Tap to retry\.$/);
    await expect(failed).toBeVisible();
    await expect(visible(page.getByText("Not sent. Tap to retry.", { exact: true }))).toBeVisible();
    const first = f.calls("send_message").at(-1).p_client_id;
    await failed.first().click();
    await expect(labelled(page, /^You, Is it still on\?, 10:0\d$/)).toBeVisible();
    const again = f.calls("send_message").at(-1);
    assert.equal(again.p_client_id, first, "the retry sends the same client id");
    assert.equal(f.calls("send_message").filter((b) => b.p_client_id === first).length, 2);
    console.log("PASS (e): a send that fails offline says Not sent. Tap to retry., and a tap resends with the same p_client_id.");

    await f.settle();
    f.state.failSends = 1;
    await field(page).fill("typo here");
    await button(page, "Send").click();
    const typo = labelled(page, starts("You, typo here, "));
    await expect(typo).toHaveAccessibleName(/Not sent\. Tap to retry\.$/);
    assert.deepEqual(await a11yActions(typo), [{ name: "deleteUnsent", label: "Delete unsent message" }]);
    const sends = f.calls("send_message").length;
    await longPress(typo);
    await button(page, "Delete unsent message").click();
    await expect(typo).toHaveCount(0);
    await page.waitForTimeout(300);
    assert.equal(f.calls("send_message").length, sends, "not sent");
    assert.equal(f.calls("delete_message").length, 0, "nothing to delete on the server");
    console.log("PASS: Delete unsent message takes a failed message off the phone, with no call.");
    await f.done();
  }

  // (f) The host: Announce, Delete, Remove, the menu.
  {
    const f = await fixture({ viewer: ANA, rows: [...octRows(), say(106, ANA, "Bring a frisbee", "2026-10-28T09:40:00Z")] });
    const { page } = f;
    await openChat(page);
    await expect(button(page, "Resbite: You changed the place · Fixture park, north gate")).toBeVisible();
    await button(page, "Announce").click();
    await expect(heading(page, "New announcement")).toBeVisible();
    await expect(text(page, "Who gets it")).toBeVisible();
    const going = page.getByRole("radio", { name: "Going · 4", exact: true });
    const everyone = page.getByRole("radio", { name: "Everyone invited · 5", exact: true });
    await expect(going).toHaveAttribute("aria-checked", "true");
    await expect(everyone).toHaveAttribute("aria-checked", "false");
    await everyone.click();
    await expect(everyone).toHaveAttribute("aria-checked", "true");
    await expect(going).toHaveAttribute("aria-checked", "false");
    const update = visible(page.getByRole("textbox", { name: "Write an update for your guests", exact: true }));
    await update.fill("Rain plan: bring umbrellas");
    // (34) Cancel keeps the audience as well as the text.
    await button(page, "Cancel").click();
    await expect(heading(page, "New announcement")).toHaveCount(0);
    await button(page, "Announce").click();
    await expect(everyone).toHaveAttribute("aria-checked", "true");
    await expect(update).toHaveValue("Rain plan: bring umbrellas");
    await f.shot("task-7-announce-390.png");
    await button(page, "Send announcement").click();
    await expect(heading(page, "New announcement")).toHaveCount(0);
    const ann = f.calls("send_announcement");
    assert.equal(ann.length, 1);
    assert.equal(ann[0].p_series, SERIES);
    assert.equal(ann[0].p_body, "Rain plan: bring umbrellas");
    assert.equal(ann[0].p_audience, "everyone");
    assert.match(ann[0].p_client_id, UUID);
    const card = labelled(page, starts("Announcement to everyone invited, You, Rain plan: bring umbrellas, "));
    await expect(card).toBeVisible();
    await expect(visible(card.getByText("ANNOUNCEMENT · TO EVERYONE INVITED", { exact: true }))).toBeVisible();
    await expect(visible(button(page, /^PINNED, /).getByText("Rain plan: bring umbrellas", { exact: true }))).toBeVisible();
    console.log("PASS (f): Announce starts on Going · 4 beside Everyone invited · 5; Cancel keeps the audience and text; send_announcement { p_audience: everyone }; the card is pinned.");

    // Delete (own): asks in place; Keep goes back; Delete message calls delete_message.
    const frisbee = labelled(page, "You, Bring a frisbee, 09:40");
    assert.deepEqual(await a11yActions(frisbee), [{ name: "delete", label: "Delete message" }]);
    await longPress(frisbee);
    await expect(button(page, "Remove message")).toHaveCount(0);
    await button(page, "Delete message").click();
    await expect(heading(page, "Delete this message for everyone?")).toBeVisible();
    // (Q53) The question takes focus; after Keep, the menu's row does.
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe("Delete this message for everyone?");
    await button(page, "Keep").click();
    await expect(heading(page, "Delete this message for everyone?")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Delete message");
    await button(page, "Delete message").click();
    await button(page, "Delete message").click();
    await expect(labelled(page, "You, Message deleted, 09:40")).toBeVisible();
    assert.deepEqual(f.calls("delete_message"), [{ p_id: 106 }]);
    assert.equal(f.calls("remove_message").length, 0);
    // Remove (someone else's), reached as VoiceOver does, by its action: it asks in place.
    const leo = labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10");
    assert.deepEqual(await a11yActions(leo), [
      { name: "remove", label: "Remove message" },
      { name: "report", label: "Report message" },
    ]);
    await runA11yAction(leo, "remove");
    await expect(heading(page, "Remove this message?")).toBeVisible();
    await button(page, "Remove message").click();
    await expect(labelled(page, "Leo, Message removed by an admin, Tue 27 Oct, 18:10")).toBeVisible();
    assert.deepEqual(f.calls("remove_message"), [{ p_id: 103 }]);
    // (H31 Q4) A long-press on a link opens its message's actions.
    await longPress(labelled(page, starts("Mia, Map: ")).getByRole("link"));
    await expect(button(page, "Remove message")).toBeVisible();
    await button(page, "Close sheet").click();
    await expect(button(page, "Remove message")).toHaveCount(0);
    await expect(heading(page, "Open example.com?")).toHaveCount(0);
    console.log("PASS: Delete message and Remove message ask in place, call delete_message and remove_message, and move focus to the question and back to the menu; a long-press on a link opens its message's actions.");

    // The menu: People in this chat, Mute chat.
    await button(page, "More").click();
    await expect(button(page, "People in this chat · 4")).toBeVisible();
    await button(page, "Mute chat").click();
    await expect.poll(() => f.calls("set_chat_mute")).toEqual([{ p_series: SERIES, p_muted: true }]);
    await expect(button(page, "Mute chat")).toHaveCount(0);
    await button(page, "More").click();
    await expect(button(page, "Unmute chat")).toBeVisible();
    await button(page, "People in this chat · 4").click();
    await expect(page).toHaveURL(new RegExp(`/guests\\?plan=${PLAN}$`));
    await f.done();
  }
  console.log("PASS: the menu's People in this chat opens /guests?plan=<the occurrence>, and Mute chat toggles to Unmute chat.");

  // (g), (h3) After the end, open: the header, the closing line at 31 hours, the ended line.
  {
    const f = await fixture({
      now: "2025-11-16T10:59:30Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await openChat(page);
    await expect(text(page, "Ended · Sat 15 Nov · 7 going")).toBeVisible();
    await expect(text(page, "This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?")).toBeVisible();
    const ended = labelled(page, "Resbite: Picnic in the park ended");
    await expect(ended).toHaveText("Picnic in the park ended");
    const ys = [await top(labelled(page, starts("Ana, Setting up by the oak tree, "))), await top(ended), await top(labelled(page, starts("Ana, Thanks for coming everyone!, ")))];
    assert.ok(ys[0] < ys[1] && ys[1] < ys[2], `the ended line sits between the messages before and after the end (${ys})`);
    console.log("PASS (g): Ended · Sat 15 Nov · 7 going, and the closing line at 31 hours.");
    console.log("PASS (h3): Picnic in the park ended sits between the messages before and after the end.");
    await f.done();
  }

  // (g3) 59 minutes, then 30 seconds; (g2) the close at closesAt, with no refocus.
  {
    const f = await fixture({
      now: "2025-11-17T17:00:30Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    await openChat(f.page);
    await expect(text(f.page, "This chat closes Mon 17 Nov at 18:00, in 59 minutes. Any final words?")).toBeVisible();
    await f.done();
  }
  {
    const f = await fixture({
      now: "2025-11-17T17:59:30Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await openChat(page);
    await expect(text(page, "This chat closes Mon 17 Nov at 18:00, in 1 minute. Any final words?")).toBeVisible();
    console.log("PASS (g3): in 59 minutes with 59 minutes left, in 1 minute with 30 seconds left.");
    await f.settle();
    await field(page).fill("One last thing");
    const reads = f.calls("chat_summary").length;
    const navigations = [];
    page.on("framenavigated", (frame) => frame === page.mainFrame() && navigations.push(frame.url()));
    await f.advance(31_000);
    await expect(text(page, "This chat closed on Mon 17 Nov.")).toBeVisible();
    await expect(field(page)).toHaveCount(0);
    // (Q46) The words the field held stay under the card, readable.
    await expect(text(page, "Not sent:")).toBeVisible();
    await expect(text(page, "One last thing")).toBeVisible();
    assert.ok(f.calls("chat_summary").length > reads, "chat_summary is read again at the close");
    assert.deepEqual(navigations, [], "no refocus: the page stayed where it was");
    await expect(page.getByText(/^This chat closes/)).toHaveCount(0);
    await expect(button(page, "Do this again")).toHaveCount(0);
    console.log("PASS (g2): at closesAt the screen reads chat_summary again and the closed card replaces the field, with the draft under it as Not sent:.");
    await f.done();
  }

  // (h), (h2) Closed, as the host: the card, Do this again, Remove still offered.
  {
    const f = await fixture({
      viewer: ANA,
      now: "2025-11-18T10:00:00Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await openChat(page);
    await expect(text(page, "This chat closed on Mon 17 Nov.")).toBeVisible();
    await expect(text(page, "Resbite chats close 48 hours after the resbite, so the plan stays offline. You can still read everything here.")).toBeVisible();
    await expect(field(page)).toHaveCount(0);
    await expect(button(page, "Announce")).toHaveCount(0);
    await expect(button(page, "Do this again")).toBeVisible();
    await f.settle();
    await longPress(labelled(page, starts("Leo, Best afternoon in ages, ")));
    await button(page, "Remove message").click();
    await expect(heading(page, "Remove this message?")).toBeVisible();
    await button(page, "Remove message").click();
    await expect(labelled(page, starts("Leo, Message removed by an admin, "))).toBeVisible();
    assert.deepEqual(f.calls("remove_message"), [{ p_id: 203 }]);
    console.log("PASS (h2): on the closed chat the host's long-press still offers Remove message, which calls remove_message.");
    await button(page, "Do this again").click();
    await expect(page).toHaveURL(new RegExp(`/arrange\\?again=${PLAN}$`));
    await f.done();
  }
  {
    const f = await fixture({ now: "2025-11-18T10:00:00Z", rows: novRows(), summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt } });
    await openChat(f.page);
    await expect(text(f.page, "This chat closed on Mon 17 Nov.")).toBeVisible();
    await expect(button(f.page, "Do this again")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (h): closed, no field, the date and why; Do this again for the host only, opening /arrange?again=<plan>.");

  // (i) 'Not in this chat' on a refresh: notInChat, a phx_leave, and nothing more.
  {
    const f = await fixture({ refusals: [403] });
    const { page } = f;
    await openChat(page);
    await expect.poll(() => f.joins().length).toBe(1);
    await f.settle();
    f.state.member = false;
    f.signal({ id: 106, kind: "message", state: "sent" });
    await expect(text(page, "You’re not in this chat.")).toBeVisible();
    await expect(page.getByText("Count me in")).toHaveCount(0);
    await expect.poll(() => f.leavesSent().length).toBe(1);
    await f.settle();
    const chatCalls = () => ["chat_summary", "chat_messages", "chat_messages_since"].reduce((n, name) => n + f.calls(name).length, 0);
    const calls = chatCalls();
    await f.advance(60_000);
    assert.equal(chatCalls(), calls, "nothing more is read");
    console.log("PASS (i): 42501 Not in this chat shows notInChat, the channel gets a phx_leave, and the poll doesn't start.");
    await f.done();
  }

  // (l) 7.5b: a leave answered with an error. realtime-js 2.116 closes a channel as it sends the leave (a leaving
  // channel can't push, so the leave settles "ok" on the phone at once), so the refusal that comes back changes
  // nothing: the next focus joins a new channel and the chat is live again, with no poll.
  {
    const f = await fixture();
    const { page } = f;
    await openChat(page);
    await expect.poll(() => f.joins().length).toBe(1);
    await f.settle();
    f.state.leaveDefault = "error";
    const away = async (n) => {
      await button(page, "More").click();
      await button(page, "People in this chat · 4").click();
      await expect(page).toHaveURL(/\/guests\?plan=/);
      await expect.poll(() => f.leavesSent().length).toBe(n);
      // The refusal has come back before the person returns.
      await page.waitForTimeout(500);
      await button(page, "Back").click();
      await expect(heading(page, "Picnic in the park")).toBeVisible();
      await expect.poll(() => f.joins().length).toBe(n + 1);
      assert.equal(f.leavesSent().length, n, "the refused channel was already gone: nothing is left twice");
    };
    for (const n of [1, 2]) {
      await away(n);
      await f.settle();
      const polled = f.calls("chat_messages_since").length;
      await f.advance(40_000);
      assert.equal(f.calls("chat_messages_since").length, polled, "subscribed again: no poll");
      const id = Math.max(...f.state.rows.map((r) => r.id)) + 1;
      f.add(say(id, LEO, `Live again ${n}`, iso(f.serverNow())));
      f.signal({ id, kind: "message", state: "sent" });
      await expect(labelled(page, starts(`Leo, Live again ${n}, `))).toBeVisible();
    }
    console.log("PASS (l): a leave answered with an error leaves no channel behind: each return joins anew and the chat is live, with no poll.");
    await f.done();
  }

  // (m) The pinned card loads back to an unloaded message and scrolls to it.
  {
    const many = [row(301, { kind: "announcement", audience: "going", author: ANA, body: "The very first plan", at: "2026-10-26T09:00:00Z" })];
    for (let i = 1; i <= 129; i++) many.push(say(301 + i, i % 2 ? LEO : MIA, `Message number ${i}`, iso(Date.parse("2026-10-27T09:00:00Z") + i * 60_000)));
    const f = await fixture({ rows: many });
    const { page } = f;
    await openChat(page);
    await expect(labelled(page, starts("Mia, Message number 128, "))).toBeVisible();
    await f.settle();
    const pinnedRow = labelled(page, starts("Announcement to people going, Ana, The very first plan, "));
    assert.equal(await inViewport(pinnedRow), false, "the pinned message starts out of sight");
    await button(page, /^PINNED, /).click();
    await expect.poll(() => f.calls("chat_messages").slice(1)).toContainEqual({ p_series: SERIES, p_before: 381, p_limit: 100 });
    await expect.poll(() => inViewport(pinnedRow)).toBe(true);
    console.log("PASS (m): the pinned card loads back to its unloaded message and scrolls to it.");
    await f.done();
  }

  // (n) The empty states.
  {
    const f = await fixture({ viewer: ANA, rows: [], summary: { accepted: 0, members: 1, going: 1, everyone: 1 } });
    const { page } = f;
    await openChat(page);
    await expect(heading(page, "Nobody’s going yet")).toBeVisible();
    await expect(text(page, "Messages here reach everyone going. Invite people to get started.")).toBeVisible();
    await expect(button(page, "Announce")).toBeVisible();
    await button(page, "Invite people").click();
    await expect(page).toHaveURL(new RegExp(`/invitations\\?plan=${PLAN}$`));
    await f.done();
  }
  {
    const f = await fixture({ rows: [] });
    await openChat(f.page);
    await expect(text(f.page, "No messages yet")).toBeVisible();
    await expect(heading(f.page, "Nobody’s going yet")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (n): the host's empty state says Nobody’s going yet with Invite people; a guest's says No messages yet.");

  // (n2) Only Resbite's lines so far: the empty state still shows, under them (H31 Q3).
  {
    const f = await fixture({ viewer: ANA, rows: octRows().filter((r) => r.kind === "system"), summary: { accepted: 0 } });
    const { page } = f;
    await openChat(page);
    await expect(labelled(page, "Resbite: Mia joined")).toBeVisible();
    await expect(heading(page, "Nobody’s going yet")).toBeVisible();
    await expect(button(page, "Invite people")).toBeVisible();
    await f.done();
  }
  console.log("PASS (n2): with only Resbite's lines, the host's empty state still shows under them.");

  // (o) A change chip opens the resbite (H31).
  {
    const f = await fixture();
    const { page } = f;
    await openChat(page);
    await button(page, "Resbite: Ana changed the place · Fixture park, north gate · Tap to see").click();
    await expect(page).toHaveURL(new RegExp(`/event\\?plan=${PLAN}$`));
    await f.done();
  }
  console.log("PASS (o): a change chip opens /event?plan=<the occurrence>.");

  // (p) A failed message from yesterday after today's: its day again, with keys of its own (H31; no React key error).
  {
    const OLD = "0e000000-0000-4000-8000-0000000000aa";
    const f = await fixture({
      queue: [{ clientId: OLD, series: SERIES, body: "Sent yesterday offline", createdAt: "2026-10-27T16:00:00Z", failed: true }],
    });
    const { page } = f;
    await openChat(page);
    await expect(labelled(page, "You, Sent yesterday offline, Tue 27 Oct, 16:00, Not sent. Tap to retry.")).toBeVisible();
    await expect(page.getByText("Tue 27 Oct", { exact: true })).toHaveCount(2);
    // The failed one is a button that sends again (H32 Q49).
    await expect(visible(page.getByRole("button", { name: "You, Sent yesterday offline, Tue 27 Oct, 16:00, Not sent. Tap to retry.", exact: true }))).toBeVisible();
    await f.done();
  }
  console.log("PASS (p): a failed message from yesterday after today's brings its day back, with no duplicate key.");

  // (q) Sending while reading history brings the message into view (H32 20).
  {
    const f = await fixture({ rows: [...octRows(), ...many(60)] });
    const { page } = f;
    await openChat(page);
    await f.settle();
    await scrollList(page, 1500);
    await page.waitForTimeout(300);
    await field(page).fill("Replying while scrolled up");
    await button(page, "Send").click();
    const mine = labelled(page, starts("You, Replying while scrolled up, "));
    await expect.poll(() => inViewport(mine)).toBe(true);
    await f.done();
  }
  console.log("PASS (q): a message sent while scrolled up in the history comes into view.");

  // (r) The pinned card three pages back (H32 22).
  {
    const rows = [row(301, { kind: "announcement", audience: "going", author: ANA, body: "The very first plan", at: "2026-10-26T09:00:00Z" })];
    for (let i = 1; i <= 329; i++) rows.push(say(301 + i, i % 2 ? LEO : MIA, `Message number ${i}`, iso(Date.parse("2026-10-27T09:00:00Z") + i * 60_000)));
    const f = await fixture({ rows });
    const { page } = f;
    await openChat(page);
    await f.settle();
    const pinnedRow = labelled(page, starts("Announcement to people going, Ana, The very first plan, "));
    await button(page, /^PINNED, /).click();
    await expect.poll(() => f.calls("chat_messages").map((b) => b.p_before)).toContain(381);
    await expect.poll(() => inViewport(pinnedRow), { timeout: 20_000 }).toBe(true);
    await f.done();
  }
  console.log("PASS (r): the pinned card loads three earlier pages, then scrolls to its message.");

  // (r2) After a pinned jump lands, nothing pulls the list back to it: not a message that arrives, not a send (H35 I1).
  {
    const rows = [row(301, { kind: "announcement", audience: "going", author: ANA, body: "The very first plan", at: "2026-10-26T09:00:00Z" })];
    for (let i = 1; i <= 129; i++) rows.push(say(301 + i, i % 2 ? LEO : MIA, `Message number ${i}`, iso(Date.parse("2026-10-27T09:00:00Z") + i * 60_000)));
    const f = await fixture({ rows });
    const { page } = f;
    await openChat(page);
    await expect.poll(() => f.joins().length).toBe(1);
    await f.settle();
    const pinnedRow = labelled(page, starts("Announcement to people going, Ana, The very first plan, "));
    await button(page, /^PINNED, /).click();
    await expect.poll(() => inViewport(pinnedRow), { timeout: 20_000 }).toBe(true);
    await f.settle();
    // A message arrives while the announcement is being read: the list stays where it is.
    f.add(say(431, LEO, "A new one meanwhile", iso(f.serverNow())));
    f.signal({ id: 431, kind: "message", state: "sent" });
    await expect.poll(() => f.calls("chat_messages_since").some((b) => b.p_after === 430)).toBe(true);
    await page.waitForTimeout(800);
    assert.equal(await inViewport(pinnedRow), true, "a message arriving doesn't move the list");
    // A send goes to the newest, and stays there.
    await field(page).fill("Sent after the jump");
    await button(page, "Send").click();
    const sent = labelled(page, starts("You, Sent after the jump, "));
    await expect.poll(() => inViewport(sent)).toBe(true);
    await page.waitForTimeout(1500);
    assert.equal(await inViewport(sent), true, "the list stays on the sent message");
    assert.equal(await inViewport(pinnedRow), false);
    await f.done();
  }
  console.log("PASS (r2): after a pinned jump lands, an arriving message doesn't move the list, and a send goes to the newest and stays.");

  // (a1) DEFECT 12: the link confirm shows the whole host, at 390 and 320 px.
  for (const [width, host] of [
    [390, "www.paypal.com.account.verify.session.update.billing.support.attacker.io"],
    [320, `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(60)}.example`],
  ]) {
    const f = await fixture({ width, rows: [...octRows(), say(106, LEO, `Your refund: https://${host}/login`, "2026-10-28T09:45:00Z")] });
    const { page } = f;
    await openChat(page);
    await labelled(page, starts("Leo, Your refund: ")).getByRole("link").click();
    const ask = heading(page, `Open ${host}?`);
    await expect(ask).toBeVisible();
    await unclipped(page, [ask], width);
    // The end of the host, the site that opens, is on screen.
    const end = await ask.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      const last = rects[rects.length - 1];
      return { right: last.right, bottom: last.bottom };
    });
    assert.ok(end.right <= width && end.bottom <= 844, `the host's end is in view (${JSON.stringify(end)})`);
    await f.shot(`task-7-link-confirm-${width}.png`);
    await f.done();
  }
  console.log("PASS (a1): the link confirm wraps the whole host at 390 and 320 px, so the site that opens is in view.");

  // (s) An earlier page that fails: the spinner while it loads, then Try again; a page that loads clears the line (H31, H32 24).
  {
    const f = await fixture({ rows: [...octRows(), ...many(115)] });
    const { page } = f;
    // Armed first: the list may ask for an earlier page as soon as it draws.
    f.state.failEarlier = 1;
    f.state.delayEarlier = 1500;
    await openChat(page);
    await f.settle();
    // The list draws in batches, and asks for the earlier page once its last row is drawn and it reaches the top.
    await expect(async () => {
      await scrollList(page, "top");
      await page.waitForTimeout(150);
      expect(f.calls("chat_messages").some((b) => b.p_before !== null)).toBe(true);
    }).toPass({ timeout: 10_000 });
    await expect(visible(page.getByRole("progressbar", { name: "Loading earlier messages", exact: true }))).toBeVisible();
    await expect(button(page, "Try again")).toBeVisible({ timeout: 10_000 });
    await expect(text(page, "Check your connection and try again.")).toBeVisible();
    f.state.delayEarlier = 0;
    await button(page, "Try again").click();
    await expect(button(page, "Try again")).toHaveCount(0);
    await expect(page.getByText("Check your connection and try again.")).toHaveCount(0);
    await expect(async () => {
      await scrollList(page, "top");
      await expect(labelled(page, "Resbite: Mia joined")).toBeInViewport({ timeout: 300 });
    }).toPass({ timeout: 10_000 });
    await f.done();
  }
  console.log("PASS (s): a failing earlier page shows Loading earlier messages, then Try again; the page that loads clears the line.");

  // (t) Action errors clear: a failed send's line goes when a read succeeds; 'Hosts only' reads the summary again, so
  // Announce goes, and Cancel takes the words away; 'Too fast' names the announcement limit (H32 28, 36, Q35).
  {
    const f = await fixture();
    const { page } = f;
    await openChat(page);
    await expect.poll(() => f.joins().length).toBe(1);
    await f.settle();
    f.state.failSends = 1;
    await field(page).fill("Sent while offline");
    await button(page, "Send").click();
    await expect(text(page, "Check your connection and try again.")).toBeVisible();
    await f.settle();
    f.add(say(106, LEO, "Back online", iso(f.serverNow())));
    f.signal({ id: 106, kind: "message", state: "sent" });
    await expect(labelled(page, starts("Leo, Back online, "))).toBeVisible();
    // (H35) Shown, it stays at least 4 s; the read that succeeded clears it after that.
    await expect(text(page, "Check your connection and try again.")).toBeVisible();
    await expect(page.getByText("Check your connection and try again.")).toHaveCount(0, { timeout: 8_000 });
    await expect(labelled(page, starts("You, Sent while offline, "))).toHaveAccessibleName(/Not sent\. Tap to retry\.$/);
    // (H35) An error that comes while the link sheet (with no place for it) is open isn't lost: the band shows it once
    // the sheet closes.
    await f.settle();
    f.state.failSends = 1;
    f.state.delaySends = 1500;
    await field(page).fill("Sent under a sheet");
    await button(page, "Send").click();
    await labelled(page, starts("Mia, Map: ")).getByRole("link").click();
    await expect(heading(page, "Open example.com?")).toBeVisible();
    await expect(labelled(page, starts("You, Sent under a sheet, "))).toHaveAccessibleName(/Not sent\. Tap to retry\.$/, { timeout: 5_000 });
    await expect(page.getByText("Check your connection and try again.")).toHaveCount(0);
    await button(page, "Cancel").click();
    await expect(text(page, "Check your connection and try again.")).toBeVisible();
    f.state.delaySends = 0;
    await f.done();
  }
  {
    const f = await fixture({ viewer: ANA, refusals: [400, 403] });
    const { page } = f;
    await openChat(page);
    await f.settle();
    f.state.refuseAnnounce = { code: "22023", message: "Too fast" };
    await button(page, "Announce").click();
    await visible(page.getByRole("textbox", { name: "Write an update for your guests", exact: true })).fill("Second one");
    await button(page, "Send announcement").click();
    await expect(text(page, "You can send one announcement a minute.")).toBeVisible();
    f.state.refuseAnnounce = { code: "42501", message: "Hosts only", host: false };
    const reads = f.calls("chat_summary").length;
    await button(page, "Send announcement").click();
    await expect(text(page, "Only hosts can do that.")).toBeVisible();
    await expect.poll(() => f.calls("chat_summary").length).toBeGreaterThan(reads);
    await button(page, "Cancel").click();
    await expect(heading(page, "New announcement")).toHaveCount(0);
    await expect(button(page, "Announce")).toHaveCount(0);
    await expect(page.getByText("Only hosts can do that.")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (t): a failed send's line clears when a read succeeds; Too fast names the announcement limit; Hosts only rereads the summary, Announce goes, and Cancel clears the line.");

  // (u) A send the close overtook stays, says so, and can only be deleted, across a return (H32 29).
  {
    const f = await fixture({
      refusals: [400],
      now: "2025-11-17T17:59:30Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await openChat(page);
    await f.settle();
    f.state.closeOnSend = true;
    await field(page).fill("My last words, typed for a while");
    await button(page, "Send").click();
    const late = labelled(page, /^You, My last words, typed for a while, 17:59, This chat closed before it was sent\.$/);
    await expect(late).toBeVisible();
    await expect(text(page, "This chat closed before it was sent.")).toBeVisible();
    await expect(text(page, "This chat closed on Mon 17 Nov.")).toBeVisible();
    const sends = f.calls("send_message").length;
    await late.first().click();
    await page.waitForTimeout(400);
    assert.equal(f.calls("send_message").length, sends, "a tap doesn't send it again");
    // Leave and come back: still there.
    await button(page, "More").click();
    await button(page, "People in this chat · 4").click();
    await expect(page).toHaveURL(/\/guests\?plan=/);
    await button(page, "Back").click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await expect(late).toBeVisible();
    await f.settle();
    assert.equal(f.calls("send_message").length, sends, "nothing resends it");
    await longPress(late);
    await button(page, "Delete unsent message").click();
    await expect(late).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (u): a send refused as Chat closed stays as This chat closed before it was sent., never resent, until deleted.");

  // (v) Send needs a visible character, by the server's rule (H32 30); (z) the limit counts characters (H32 Q26).
  {
    const f = await fixture();
    const { page } = f;
    await openChat(page);
    for (const blank of ["\u2800\u2800", "\u3164", "\u200b", "   ", "\n\n"]) {
      await field(page).fill(blank);
      await expect(button(page, "Send")).toHaveAttribute("aria-disabled", "true");
    }
    await field(page).fill(" a");
    await expect(button(page, "Send")).not.toHaveAttribute("aria-disabled", "true");
    assert.equal(await field(page).getAttribute("maxlength"), null, "no maxLength: the limit counts code points");
    await field(page).fill("P".repeat(4990) + "THE END!!!");
    await expect(field(page)).toHaveValue("P".repeat(1000));
    await expect(text(page, "Only the first 1,000 characters fit.")).toBeVisible();
    await field(page).fill("🎉".repeat(700));
    await expect(field(page)).toHaveValue("🎉".repeat(700));
    await expect(page.getByText("Only the first 1,000 characters fit.")).toHaveCount(0);
    // (H35) Typing past the limit in the middle is refused; the end of the message is never cut.
    const full = "a".repeat(500) + "b".repeat(500);
    await field(page).fill(full);
    await field(page).evaluate((el) => el.setSelectionRange(500, 500));
    await page.keyboard.type("XY");
    await expect(field(page)).toHaveValue(full);
    await expect(text(page, "Only the first 1,000 characters fit.")).toBeVisible();
    await field(page).fill("");
    assert.equal(f.calls("send_message").length, 0);
    await f.done();
  }
  console.log("PASS (v, z): Send stays off for invisible-only text; a 5000-character paste keeps 1000 with the notice; 700 emoji fit; typing in the middle at the limit is refused.");

  // (z2) A lone surrogate reads as U+FFFD and a NUL goes, in both fields, as typed and as sent (H41 m2). The text is
  // made in the page, so nothing on the way to the browser can mend it, and set as an input event sets it.
  {
    const f = await fixture({ viewer: ANA });
    const { page } = f;
    await openChat(page);
    await f.settle();
    /** Types `head` + a lone high surrogate + NUL + `tail` into the field; answers its value's UTF-16 code units. */
    const typeBroken = (locator, head, tail) =>
      locator.evaluate(
        (el, [head, tail]) => {
          const value = head + String.fromCharCode(0xd83d) + String.fromCharCode(0) + tail;
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return new Promise((done) => requestAnimationFrame(() => done(Array.from(el.value, (c) => c.charCodeAt(0)))));
        },
        [head, tail],
      );
    const units = (s) => Array.from(s, (c) => c.charCodeAt(0));
    assert.deepEqual(await typeBroken(field(page), "on my way ", "soon"), units("on my way \ufffdsoon"));
    await button(page, "Send").click();
    await expect.poll(() => f.calls("send_message").length).toBe(1);
    assert.equal(f.calls("send_message")[0].p_body, "on my way \ufffdsoon");
    await button(page, "Announce").click();
    const announcement = visible(page.getByRole("textbox", { name: "Write an update for your guests", exact: true }));
    assert.deepEqual(await typeBroken(announcement, "Doors ", " at 7"), units("Doors \ufffd at 7"));
    await button(page, "Send announcement").click();
    await expect.poll(() => f.calls("send_announcement").length).toBe(1);
    assert.equal(f.calls("send_announcement")[0].p_body, "Doors \ufffd at 7");
    await f.done();
  }
  console.log("PASS (z2): a lone surrogate reads as U+FFFD and a NUL goes in the composer and the announcement field, and is sent so.");

  // (y) An old chat's dates carry their year (H32 Q50).
  {
    const f = await fixture({
      now: "2026-11-11T12:00:00Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await openChat(page);
    await expect(text(page, "Ended · Sat 15 Nov 2025 · 7 going")).toBeVisible();
    await expect(text(page, "This chat closed on Mon 17 Nov 2025.")).toBeVisible();
    await expect(text(page, "Sat 15 Nov 2025")).toBeVisible();
    await expect(labelled(page, "Ana, Thanks for coming everyone!, Sat 15 Nov 2025, 19:00")).toBeVisible();
    await f.done();
  }
  console.log("PASS (y): an old chat's header, closed card, separators and labels carry the year.");

  // (ask) The chat is the moment for the notification ask (CH-P17, K-N15), with its own line (H37 Q7).
  {
    const f = await fixture({ permission: "undetermined" });
    const { page } = f;
    const reads = () => page.evaluate(() => globalThis.__permissionReads);
    await openChat(page);
    await expect(heading(page, "Get notified?")).toBeVisible();
    await expect(text(page, "Turn on notifications to hear about new messages.")).toBeVisible();
    await expect(page.getByText(/^Resbite can tell you when people answer/)).toHaveCount(0);
    await expect(button(page, "Turn on notifications")).toBeVisible();
    // Every read of the permission this visit made, the ask's included.
    const asking = await reads();
    await button(page, "Not now").click();
    await expect(heading(page, "Get notified?")).toHaveCount(0);
    await expect(field(page)).toBeVisible();
    // Shown counts as asked: the next open of a chat doesn't ask again. The signal: the same reads have been made, the
    // ask's included, and the page has drawn twice since.
    await page.reload();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await expect(text(page, "Count me in")).toBeVisible();
    await expect.poll(reads).toBeGreaterThanOrEqual(asking);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(heading(page, "Get notified?")).toHaveCount(0);
    await f.done();
  }
  // Someone who isn't in the chat isn't asked there: with no summary there is no moment, so nothing reads the permission
  // for the ask once the refusal shows.
  {
    const f = await fixture({ permission: "undetermined", refusals: [403] });
    f.state.member = false;
    const { page } = f;
    await page.goto(`${base}/chat?series=${SERIES}`);
    await expect(text(page, "You’re not in this chat.")).toBeVisible();
    await f.settle();
    await expect(heading(page, "Get notified?")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (ask): the first open of a chat brings Get notified? once, with Turn on notifications to hear about new messages., Turn on notifications and Not now; it doesn't come back on the next open, nor for someone outside the chat.");

  // (g4) The announcement sheet open at the close closes with it (H32 Q45).
  {
    const f = await fixture({
      viewer: ANA,
      now: "2025-11-17T17:59:30Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await openChat(page);
    await f.settle();
    await button(page, "Announce").click();
    await visible(page.getByRole("textbox", { name: "Write an update for your guests", exact: true })).fill("Photos tomorrow");
    await f.advance(31_000);
    await expect(text(page, "This chat closed on Mon 17 Nov.")).toBeVisible();
    await expect(heading(page, "New announcement")).toHaveCount(0);
    assert.equal(f.calls("send_announcement").length, 0);
    // (H35) The announcement's words stay too, under the card.
    await expect(text(page, "Not sent:")).toBeVisible();
    await expect(text(page, "Photos tomorrow")).toBeVisible();
    await f.done();
  }
  console.log("PASS (g4): the announcement sheet closes when the chat closes, and its words stay under the closed card as Not sent:.");

  // (kb) The keyboard up on a small phone under Larger Text: the field stays above it (H32 52; ?keyboard=1 stands in).
  {
    const f = await fixture({
      viewer: ANA,
      width: 320,
      height: 308,
      now: "2025-11-16T10:59:30Z",
      rows: [
        ...novRows(),
        row(206, { kind: "announcement", audience: "going", author: ANA, body: "Photos are going up in the shared album tonight, add yours", at: "2025-11-16T09:30:00Z" }),
      ],
      summary: { title: "Picnic in the park by the river with the whole crew", starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await page.goto(`${base}/chat?series=${SERIES}&largeText=1&keyboard=1`);
    await expect(heading(page, "Picnic in the park by the river with the whole crew")).toBeVisible();
    await expect(field(page)).toBeVisible();
    await expect(page.getByText(/^This chat closes/)).toHaveCount(0);
    const box = await field(page).boundingBox();
    assert.ok(box.y + box.height <= 308, `the field is above the keyboard (bottom ${box.y + box.height} of 308)`);
    const pinnedBox = await button(page, /^PINNED, /).boundingBox();
    assert.ok(pinnedBox.height <= 50, `the pinned card keeps to one line (${pinnedBox.height})`);
    await f.shot("task-7-keyboard-320-large-text.png");
    await f.done();
  }
  console.log("PASS (kb): with the keyboard up at 320×308 under Larger Text, the pinned card keeps to one line, the closing line hides, and the field stays in view.");

  // (j) Larger Text at 320 px: the composer, the pinned card and the closed card fit; the bubbles' actions.
  {
    const f = await fixture({ viewer: ANA, width: 320, rows: [...octRows(), say(106, ANA, "Bring a frisbee", "2026-10-28T09:40:00Z")] });
    const { page } = f;
    await openChat(page, "&largeText=1");
    await expect(field(page)).toBeVisible();
    await unclipped(
      page,
      [
        text(page, "To: people going. People who join later can read this too."),
        button(page, "Announce"),
        button(page, "Send"),
        field(page),
        visible(button(page, /^PINNED, /).getByText("PINNED", { exact: true })),
        visible(button(page, /^PINNED, /).getByText("Doors open at 11:30. Bring a blanket!", { exact: true })),
        text(page, "Fri 30 Oct · 2 going"),
      ],
      320,
    );
    // A long message grows the field, up to its cap; the 1,000 limit counts code points, so no maxlength (H32 Q26, see v).
    assert.equal(await field(page).getAttribute("maxlength"), null);
    const short = (await field(page).boundingBox()).height;
    await field(page).fill("A longer message about who brings what, so it wraps onto a few lines in a narrow field");
    await expect.poll(async () => (await field(page).boundingBox()).height).toBeGreaterThan(short);
    await field(page).fill("");
    assert.deepEqual(await a11yActions(labelled(page, "You, Bring a frisbee, 09:40")), [{ name: "delete", label: "Delete message" }]);
    assert.deepEqual(await a11yActions(labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10")), [
      { name: "remove", label: "Remove message" },
      { name: "report", label: "Report message" },
    ]);
    assert.deepEqual(await a11yActions(labelled(page, starts("Announcement to people going, You, "))), [{ name: "delete", label: "Delete message" }]);
    // Mia's message holds a link: an action opens it too.
    assert.deepEqual(await a11yActions(labelled(page, starts("Mia, Map: "))), [
      { name: "remove", label: "Remove message" },
      { name: "report", label: "Report message" },
      { name: "link:0", label: "Open example.com" },
    ]);
    await runA11yAction(labelled(page, starts("Mia, Map: ")), "link:0");
    await expect(heading(page, "Open example.com?")).toBeVisible();
    await button(page, "Cancel").click();
    await runA11yAction(labelled(page, "You, Bring a frisbee, 09:40"), "delete");
    await expect(heading(page, "Delete this message for everyone?")).toBeVisible();
    await button(page, "Keep").click();
    await expect(heading(page, "Delete this message for everyone?")).toHaveCount(0);
    assert.equal(f.calls("delete_message").length, 0);
    await f.shot("task-7-chat-320-large-text.png");
    await f.done();
  }
  {
    const f = await fixture({
      viewer: ANA,
      width: 320,
      now: "2025-11-18T10:00:00Z",
      rows: novRows(),
      summary: { starts_at: NOV.startsAt, ends_at: NOV.endsAt, closes_at: NOV.closesAt, accepted: 7 },
    });
    const { page } = f;
    await openChat(page, "&largeText=1");
    await unclipped(
      page,
      [
        text(page, "This chat closed on Mon 17 Nov."),
        text(page, "Resbite chats close 48 hours after the resbite, so the plan stays offline. You can still read everything here."),
        button(page, "Do this again"),
        text(page, "Ended · Sat 15 Nov · 7 going"),
      ],
      320,
    );
    await f.shot("task-7-closed-320-large-text.png");
    await f.done();
  }
  console.log("PASS (j): under Larger Text at 320 px the composer, the pinned card and the closed card fit; each bubble carries its actions.");

  // --- A group (chat plan 2, Task 4) ---
  const openGroup = async (page, query = "") => {
    await page.goto(`${base}/chat?series=${SERIES}${query}`);
    await expect(heading(page, "Board game night")).toBeVisible();
  };

  // (gr1) A member who said Can't go this week still reads and writes.
  {
    const f = await fixture({
      now: THU.now,
      rows: [...groupRows(), row(406, { kind: "system", event: "cant_go", payload: { actor: PEDRO, user: PEDRO }, at: "2025-11-17T11:00:00Z", plan: GROUP_PLAN })],
      summary: GROUP,
    });
    const { page } = f;
    await openGroup(page);
    await expect(text(page, "Sol can’t make it this week")).toBeVisible();
    await expect(labelled(page, "Resbite: You can’t make it this week")).toBeVisible();
    await expect(labelled(page, starts("Ana, Who’s bringing Catan?, "))).toBeVisible();
    await expect(text(page, "To: everyone in the group, now and later")).toBeVisible();
    await expect(text(page, "To: people going. People who join later can read this too.")).toHaveCount(0);
    await field(page).fill("Count me in next week");
    await button(page, "Send").click();
    await expect(labelled(page, starts("You, Count me in next week, "))).toBeVisible();
    const sent = f.calls("send_message");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].p_series, SERIES);
    assert.equal(sent[0].p_body, "Count me in next week");
    // The menu: the group's people row, Mute, then Leave group for a member.
    await button(page, "More").click();
    await expect(button(page, "People in this group · 9")).toBeVisible();
    await expect(button(page, "People in this chat · 9")).toHaveCount(0);
    await expect(button(page, "Leave group")).toBeVisible();
    await f.done();
  }
  console.log("PASS (gr1): a group member who said Can’t go reads Sol can’t make it this week and their own line, writes with send_message, and reads the group's field line and People in this group · 9.");

  // (gr2) Next one: a button with a hint, opening the summary's current occurrence, never the line's own plan_id.
  {
    const f = await fixture({ now: THU.now, rows: [nextLine(400, OLD_PLAN, "2025-11-13T19:00:00Z", "2025-11-07T03:00:00Z"), ...groupRows()], summary: GROUP });
    const { page } = f;
    await openGroup(page);
    const latest = button(page, "Resbite: Next one: Thu 20 Nov · Ana's flat");
    const older = button(page, "Resbite: Next one: Thu 13 Nov · Ana's flat");
    await expect(latest).toBeVisible();
    await expect(latest).toHaveText("Next one: Thu 20 Nov · Ana's flat");
    await expect(older).toBeVisible();
    assert.equal(await hintOf(latest), "Opens the resbite");
    assert.equal(await hintOf(older), "Opens the resbite");
    await latest.click();
    await expect(page).toHaveURL(new RegExp(`/event\\?plan=${GROUP_PLAN}$`));
    await page.goBack();
    await expect(heading(page, "Board game night")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/chat\\?series=${SERIES}$`));
    // A late joiner has no row on last week's occurrence: the older line opens this week's too.
    await older.click();
    await expect(page).toHaveURL(new RegExp(`/event\\?plan=${GROUP_PLAN}$`));
    await f.settle();
    await f.done();
  }
  {
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: { ...GROUP, plan_id: "" } });
    const { page } = f;
    await openGroup(page);
    await f.settle();
    const [summaries, pages] = [f.calls("chat_summary").length, f.calls("chat_messages").length];
    const navigations = [];
    page.on("framenavigated", (frame) => frame === page.mainFrame() && navigations.push(frame.url()));
    // Its hint says what it does here: it reads the chat again (ruling GR6's accessibility nit).
    assert.equal(await hintOf(button(page, "Resbite: Next one: Thu 20 Nov · Ana's flat")), "Reloads the chat");
    await button(page, "Resbite: Next one: Thu 20 Nov · Ana's flat").click();
    await expect.poll(() => f.calls("chat_summary").length).toBeGreaterThan(summaries);
    await expect.poll(() => f.calls("chat_messages").length).toBeGreaterThan(pages);
    await f.settle();
    await expect(page).toHaveURL(new RegExp(`/chat\\?series=${SERIES}$`));
    await expect(heading(page, "Board game night")).toBeVisible();
    assert.deepEqual(navigations.filter((u) => u.includes("/event")), [], "no event page opened");
    await f.done();
  }
  console.log("PASS (gr2): Next one: Thu 20 Nov · Ana's flat is a button with the hint Opens the resbite and opens /event?plan=<the current occurrence>; an older Next one opens the same occurrence, never its own plan_id; with no plan_id the tap reads chat_summary and chat_messages again and the chat stays.");

  // (gr3) Leave group: the question in place, leave_series { p_series }, then My resbites; the phone's reminders for the
  // group go with it (review I2).
  {
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: GROUP, permission: "granted", reminders: true });
    const { page } = f;
    const reminders = () => page.evaluate(() => globalThis.__resbiteDevice.reminders.map((r) => r.body));
    await openGroup(page);
    await expect.poll(async () => (await reminders()).some((body) => body.includes("Board game night"))).toBe(true);
    await button(page, "More").click();
    await button(page, "Leave group").click();
    const question = heading(page, "Leave Board game night? You’ll stop getting its Thursdays and its chat.");
    await expect(question).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe("Leave Board game night? You’ll stop getting its Thursdays and its chat.");
    // Keep goes back to the menu, with nothing called.
    await button(page, "Keep").click();
    await expect(question).toHaveCount(0);
    await expect(button(page, "Leave group")).toBeVisible();
    assert.deepEqual(f.calls("leave_series"), []);
    await button(page, "Leave group").click();
    await expect(question).toBeVisible();
    await button(page, "Leave group").click();
    await expect(page).toHaveURL(new RegExp(`/plans$`));
    await expect(heading(page, "My resbites")).toBeVisible();
    assert.deepEqual(f.calls("leave_series"), [{ p_series: SERIES }]);
    await expect.poll(reminders).toEqual([]);
    await f.settle();
    await f.done();
  }
  console.log("PASS (gr3): Leave group asks Leave Board game night? You’ll stop getting its Thursdays and its chat. in place (Keep goes back), calls leave_series { p_series } once, lands on My resbites, and the phone's reminders for the group are gone.");

  // (gr4) Leave group answered offline: the confirm stays with the error, and Leave group can be tapped again.
  {
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: GROUP });
    const { page } = f;
    f.state.failLeaves = 1;
    await openGroup(page);
    await f.settle();
    await button(page, "More").click();
    await button(page, "Leave group").click();
    const question = heading(page, "Leave Board game night? You’ll stop getting its Thursdays and its chat.");
    await button(page, "Leave group").click();
    await expect(text(page, "Check your connection and try again.")).toBeVisible();
    await expect(question).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/chat\\?series=${SERIES}$`));
    assert.equal(f.calls("leave_series").length, 1);
    await expect(button(page, "Leave group")).toBeEnabled();
    await button(page, "Leave group").click();
    await expect(page).toHaveURL(new RegExp(`/plans$`));
    assert.deepEqual(f.calls("leave_series"), [{ p_series: SERIES }, { p_series: SERIES }]);
    await f.settle();
    await f.done();
  }
  console.log("PASS (gr4): Leave group answered offline keeps the question open with Check your connection and try again.; a second tap calls leave_series again and lands on My resbites.");

  // (gr4b) The first leave went through but its answer was lost: the second is refused 'Not in this group', which is
  // done, so it lands on My resbites (ruling GR4 M-2).
  {
    // The refusal's 403 is under test here.
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: GROUP, refusals: [403] });
    const { page } = f;
    f.state.lostLeaves = 1;
    await openGroup(page);
    await f.settle();
    await button(page, "More").click();
    await button(page, "Leave group").click();
    await button(page, "Leave group").click();
    await expect(text(page, "Check your connection and try again.")).toBeVisible();
    await button(page, "Leave group").click();
    await expect(page).toHaveURL(new RegExp(`/plans$`));
    await expect(heading(page, "My resbites")).toBeVisible();
    await expect(text(page, "You’re not in this group.")).toHaveCount(0);
    assert.deepEqual(f.calls("leave_series"), [{ p_series: SERIES }, { p_series: SERIES }]);
    await f.settle();
    await f.done();
  }
  console.log("PASS (gr4b): after a leave whose answer was lost, the next attempt's 'Not in this group' counts as done and lands on My resbites.");

  // (gr4c) Two taps before a redraw send one leave; a refusal that lands after the menu closed isn't shown on the next
  // Leave group (review M3).
  {
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: GROUP });
    const { page } = f;
    await openGroup(page);
    await f.settle();
    f.state.delayLeaves = 1500;
    f.state.failLeaves = 1;
    await button(page, "More").click();
    await button(page, "Leave group").click();
    const question = heading(page, "Leave Board game night? You’ll stop getting its Thursdays and its chat.");
    await expect(question).toBeVisible();
    // Two clicks in one task: nothing redraws between them.
    await button(page, "Leave group").evaluate((el) => {
      el.click();
      el.click();
    });
    await button(page, "Close sheet").click();
    await expect(question).toHaveCount(0);
    await expect.poll(() => f.calls("leave_series").length).toBe(1);
    await page.waitForTimeout(2500);
    assert.equal(f.calls("leave_series").length, 1, "one leave for two taps");
    f.state.delayLeaves = 0;
    await button(page, "More").click();
    await button(page, "Leave group").click();
    await expect(question).toBeVisible();
    await expect(text(page, "Check your connection and try again.")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (gr4c): two taps on Leave group before a redraw send one leave_series; its refusal, landing after the menu closed, isn't shown when Leave group is asked again.");

  // (gr4d) The leave went through but its answer was lost, and the chat's next read is refused 'Not in this chat': that
  // finishes the leave on the phone, as 'Not in this group' does (ruling GR6 M5).
  {
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: GROUP, refusals: [403] });
    const { page } = f;
    f.state.lostLeaves = 1;
    await openGroup(page);
    await expect.poll(() => f.joins().length).toBe(1);
    await f.settle();
    await button(page, "More").click();
    await button(page, "Leave group").click();
    await button(page, "Leave group").click();
    await expect(text(page, "Check your connection and try again.")).toBeVisible();
    await button(page, "Close sheet").click();
    f.signal({ id: 404, kind: "message", state: "sent" });
    await expect(page).toHaveURL(new RegExp(`/plans$`));
    await expect(heading(page, "My resbites")).toBeVisible();
    assert.equal(f.calls("leave_series").length, 1);
    await f.settle();
    await f.done();
  }
  console.log("PASS (gr4d): after a leave whose answer was lost, the chat's refused read finishes it on the phone and lands on My resbites.");

  // (gr5) The group's header, running and stopped; under Larger Text at 320 px it wraps whole (G-N7).
  {
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: GROUP });
    await openGroup(f.page);
    await expect(text(f.page, "Every Thursday · 9 in the group")).toBeVisible();
    await f.done();
  }
  {
    const stopped = { ...GROUP, stopped: true, repeat_weeks: null, starts_at: THU.next, ends_at: "2025-11-27T22:00:00Z", closes_at: "2025-11-29T22:00:00Z", open: undefined };
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: stopped });
    await openGroup(f.page);
    await expect(text(f.page, "Last one · Thu 27 Nov · 9 in the group")).toBeVisible();
    await f.done();
    const g = await fixture({ now: THU.now, width: 320, rows: groupRows(), summary: { ...stopped, members: 12 } });
    await openGroup(g.page, "&largeText=1");
    const line = text(g.page, "Last one · Thu 27 Nov · 12 in the group");
    await expect(line).toBeVisible();
    await unclipped(g.page, [line], 320);
    await g.shot("task-4-group-header-320-large-text.png");
    await g.done();
    // After its last one ended, in its goodbye window: the closing line, and the computed ended line under last week's
    // stored one (withEndedLine).
    const h = await fixture({ now: "2025-11-28T09:59:30Z", rows: groupRows(), summary: stopped });
    await openGroup(h.page);
    await expect(text(h.page, "This chat closes Sat 29 Nov at 22:00, in 36 hours. Any final words?")).toBeVisible();
    await expect(h.page.getByText("Board game night ended", { exact: true })).toHaveCount(2);
    await expect(field(h.page)).toBeVisible();
    await h.done();
  }
  console.log("PASS (gr5): the header reads Every Thursday · 9 in the group, and once stopped Last one · Thu 27 Nov · 9 in the group, whole at 320 px under Larger Text; after its last one the chat says when it closes and shows the computed ended line.");

  // (gr6) The host announces to a group.
  {
    const f = await fixture({ viewer: ANA, now: THU.now, rows: groupRows(), summary: { ...GROUP, host: true } });
    const { page } = f;
    await openGroup(page);
    await button(page, "Announce").click();
    await expect(heading(page, "New announcement")).toBeVisible();
    await expect(visible(page.getByRole("radio"))).toHaveText(["Everyone in the group · 9", "Going this Thursday · 6"]);
    const everyone = page.getByRole("radio", { name: "Everyone in the group · 9", exact: true });
    await expect(everyone).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Going this Thursday · 6", exact: true })).toHaveAttribute("aria-checked", "false");
    const update = visible(page.getByRole("textbox", { name: "Write an update for the group", exact: true }));
    await expect(update).toHaveAttribute("placeholder", "Write an update for the group");
    await update.fill("Bring your own dice");
    await f.shot("task-4-group-announce-390.png");
    await button(page, "Send announcement").click();
    await expect(heading(page, "New announcement")).toHaveCount(0);
    const ann = f.calls("send_announcement");
    assert.equal(ann.length, 1);
    assert.equal(ann[0].p_audience, "everyone");
    const card = labelled(page, starts("Announcement to everyone in the group, You, Bring your own dice, "));
    await expect(card).toBeVisible();
    await expect(visible(card.getByText("ANNOUNCEMENT · TO EVERYONE IN THE GROUP", { exact: true }))).toBeVisible();
    // A host's menu has no Leave group: the owner and the admins can't leave (ruling GR6 M10).
    await button(page, "More").click();
    await expect(button(page, "People in this group · 9")).toBeVisible();
    await expect(button(page, "Leave group")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (gr6): on a group the host's Announce starts on Everyone in the group · 9, then Going this Thursday · 6, with Write an update for the group; the card reads ANNOUNCEMENT · TO EVERYONE IN THE GROUP and is read as Announcement to everyone in the group.");

  // (gr7) A stopped group after its close: Cancel this and stop repeating on Tue 25 Nov closed it on Thu 27 Nov.
  {
    const f = await fixture({
      now: "2025-11-28T10:00:00Z",
      rows: [
        ...groupRows(),
        row(407, { kind: "system", event: "cancelled", payload: { actor: ANA, stop: true, starts_at: THU.next, time_zone: "Europe/London" }, at: "2025-11-25T19:00:00Z", plan: GROUP_PLAN }),
      ],
      summary: { ...GROUP, status: "cancelled", stopped: true, repeat_weeks: null, starts_at: THU.next, ends_at: "2025-11-27T22:00:00Z", closes_at: "2025-11-27T19:00:00Z", open: undefined },
    });
    const { page } = f;
    await openGroup(page);
    await expect(text(page, "This group’s chat closed on Thu 27 Nov.")).toBeVisible();
    await expect(text(page, "Ana cancelled the group")).toBeVisible();
    await expect(field(page)).toHaveCount(0);
    await expect(button(page, "Announce")).toHaveCount(0);
    await button(page, "More").click();
    await expect(button(page, "People in this group · 9")).toBeVisible();
    await expect(button(page, "Leave group")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (gr7): a stopped group after its close shows This group’s chat closed on Thu 27 Nov. with no field and no Leave group.");

  // (gr8) Cancel just this one: the week's line, no ended line, and the chat carries on.
  {
    const f = await fixture({
      now: "2025-11-21T10:00:00Z",
      rows: [
        ...groupRows(),
        row(408, { kind: "system", event: "cancelled", payload: { actor: ANA, stop: false, starts_at: THU.startsAt, time_zone: "Europe/London" }, at: "2025-11-19T08:00:00Z", plan: GROUP_PLAN }),
      ],
      summary: { ...GROUP, status: "cancelled" },
    });
    const { page } = f;
    await openGroup(page);
    await expect(text(page, "Ana cancelled this Thursday")).toBeVisible();
    await expect(text(page, "Every Thursday · 9 in the group")).toBeVisible();
    await expect(page.getByText("Board game night ended", { exact: true })).toHaveCount(1);
    await expect(field(page)).toBeVisible();
    await f.done();
  }
  {
    // The roll then made Thu 27 Nov the current occurrence: the cancelled week's line names its date, and its can't-go
    // line reads in the one-off words, never "this Thursday" above next week's Next one (rulings GR6 I1, GR7).
    const NEXT_PLAN = "9a000000-0000-4000-8000-000000000027";
    const f = await fixture({
      now: "2025-11-24T10:00:00Z",
      rows: [
        ...groupRows(),
        row(408, { kind: "system", event: "cancelled", payload: { actor: ANA, stop: false, starts_at: THU.startsAt, time_zone: "Europe/London" }, at: "2025-11-19T08:00:00Z", plan: GROUP_PLAN }),
        nextLine(409, NEXT_PLAN, THU.next, "2025-11-21T03:00:00Z"),
      ],
      summary: { ...GROUP, plan_id: NEXT_PLAN, starts_at: THU.next, ends_at: "2025-11-27T22:00:00Z" },
    });
    const { page } = f;
    await openGroup(page);
    await expect(button(page, "Resbite: Next one: Thu 27 Nov · Ana's flat")).toBeVisible();
    await expect(labelled(page, "Resbite: Ana cancelled Thu 20 Nov")).toBeVisible();
    await expect(page.getByText("Ana cancelled this Thursday", { exact: true })).toHaveCount(0);
    await expect(text(page, "Sol can’t make it")).toBeVisible();
    await expect(page.getByText("Sol can’t make it this week", { exact: true })).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (gr8): after Cancel just this one the chat reads Ana cancelled this Thursday, adds no ended line of its own (last week's stored one stays), and keeps the field; after the roll, that week's cancelled and can't-go lines read Ana cancelled Thu 20 Nov and Sol can’t make it.");

  // (gr9) A can't-go line taken back within 10 minutes leaves the open screen; the earlier joined line stays.
  {
    const f = await fixture({ now: THU.now, rows: groupRows(), summary: GROUP });
    const { page } = f;
    await openGroup(page);
    await expect(text(page, "Sol can’t make it this week")).toBeVisible();
    await expect.poll(() => f.joins().length).toBe(1);
    await f.settle();
    f.change(405, { state: "deleted" });
    f.signal({ id: 405, kind: "system", state: "deleted" });
    await expect(text(page, "Sol can’t make it this week")).toHaveCount(0);
    await expect(text(page, "Sol joined")).toBeVisible();
    const since = f.calls("chat_messages_since");
    assert.ok(since.length >= 1, "the signal read chat_messages_since");
    await f.done();
  }
  console.log("PASS (gr9): a signal for Sol's can't-go line, now deleted, takes it off the open screen through chat_messages_since; Sol joined stays.");


  // ---- Report, block and the chat rules (chat plan 3, Task 5) ----
  const RULES = { code: "22023", message: "Rules not accepted" };
  const PEOPLE = [{ id: PEDRO }, { id: LEO }, { id: MIA }];
  const leoBubble = (page) => labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10");
  const sheet = (page) => visible(page.locator("[aria-modal]"));
  /** A button in the open sheet: an author's name over a bubble is a button too (s6). */
  const inSheet = (page, name) => sheet(page).getByRole("button", { name, exact: true });
  const BLOCK_LEO = "Block Leo? You won’t see Leo’s messages, and Leo won’t know. Any connection between you ends, and unblocking won’t bring it back.";
  /** The resbite's own reads have landed: the chat's people are known. */
  const peopleRead = (f) => expect.poll(() => f.calls("my_blocks").length).toBeGreaterThan(0);

  // (s1) Report message from a long-press, as a guest: radios, a disabled Send report with its hint, then the thanks.
  {
    const f = await fixture({ guests: PEOPLE });
    const { page } = f;
    await openChat(page);
    await longPress(leoBubble(page));
    const report = button(page, "Report message");
    await expect(report).toBeVisible();
    // Not red, and no bin: the report row is no take-down.
    const ink = await report.first().evaluate((el) => getComputedStyle(el.querySelector('[dir="auto"]') ?? el).color);
    assert.notEqual(ink, "rgb(163, 49, 66)", "Report message isn't drawn in the error colour");
    await report.click();
    await expect(heading(page, "Report message")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "What’s wrong?", exact: true })).toBeVisible();
    await expect(sheet(page).getByRole("radio")).toHaveText(["Harassment", "Spam", "Not appropriate", "Something else"]);
    for (const radio of await sheet(page).getByRole("radio").all()) await expect(radio).not.toBeChecked();
    const send = button(page, "Send report");
    await expect(send).toBeDisabled();
    assert.equal(await hintOf(send), "Pick a reason to send the report.");
    assert.equal(await labelled(page, "Anything else? (optional)").getAttribute("maxlength"), "500");
    await page.getByRole("radio", { name: "Spam", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Spam", exact: true })).toBeChecked();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(text(page, "Thanks. The Resbite team will look at it.")).toBeVisible();
    assert.deepEqual(f.calls("report_message"), [{ p_id: 103, p_reason: "spam", p_details: null }]);
    await expect.poll(() => focusedText(page)).toBe("Thanks. The Resbite team will look at it.");
    await button(page, "Done").click();
    await expect(heading(page, "Report message")).toHaveCount(0);
    // The reporter keeps using the chat.
    await field(page).fill("Back to the plan");
    await button(page, "Send").click();
    await expect.poll(() => f.calls("send_message").length).toBe(1);
    await f.done();
  }
  console.log("PASS (s1): a long-press on Leo's message offers Report message (not red): four radios, Send report disabled with the hint until Spam is picked, then report_message { p_id: 103, p_reason: \"spam\", p_details: null } and the thanks, which takes focus; the chat goes on.");

  // (s2) The same, answered offline: the sheet, the reason and the typed details stay, with the error line.
  {
    const f = await fixture({ guests: PEOPLE });
    const { page } = f;
    await openChat(page);
    f.state.failReports = 1;
    await longPress(leoBubble(page));
    await button(page, "Report message").click();
    await page.getByRole("radio", { name: "Harassment", exact: true }).click();
    await labelled(page, "Anything else? (optional)").fill("He keeps messaging me");
    await button(page, "Send report").click();
    await expect(sheet(page).getByText("Check your connection and try again.", { exact: true })).toBeVisible();
    await expect(heading(page, "Report message")).toBeVisible();
    await expect(labelled(page, "Anything else? (optional)")).toHaveValue("He keeps messaging me");
    await expect(page.getByRole("radio", { name: "Harassment", exact: true })).toBeChecked();
    await expect(text(page, "Thanks. The Resbite team will look at it.")).toHaveCount(0);
    await button(page, "Send report").click();
    await expect(text(page, "Thanks. The Resbite team will look at it.")).toBeVisible();
    assert.deepEqual(f.calls("report_message").at(-1), { p_id: 103, p_reason: "harassment", p_details: "He keeps messaging me" });
    await f.done();
  }
  console.log("PASS (s2): a report answered offline keeps the sheet, the reason and the typed details, with Check your connection and try again.; a second Send report goes through with the details.");

  // (s2b) Ruling SR6 Q1: the message is removed while its report is open: the sheet stays with what was typed and says so.
  {
    const f = await fixture({ guests: PEOPLE });
    const { page } = f;
    await openChat(page);
    await expect.poll(() => f.joins().length).toBe(1);
    await f.settle();
    await longPress(leoBubble(page));
    await button(page, "Report message").click();
    await page.getByRole("radio", { name: "Harassment", exact: true }).click();
    await labelled(page, "Anything else? (optional)").fill("He keeps messaging me");
    const reads = f.calls("chat_messages_since").length;
    f.change(103, { state: "removed", body: null });
    f.signal({ id: 103, kind: "message", state: "removed" });
    await expect.poll(() => f.calls("chat_messages_since").length).toBeGreaterThan(reads);
    await expect(heading(page, "Report message")).toBeVisible();
    await expect(sheet(page).getByText("You can’t report that any more.", { exact: true })).toBeVisible();
    await expect(labelled(page, "Anything else? (optional)")).toHaveValue("He keeps messaging me");
    await expect(button(page, "Send report")).toBeDisabled();
    assert.deepEqual(f.calls("report_message"), []);
    await button(page, "Cancel").click();
    await expect(heading(page, "Report message")).toHaveCount(0);
    await expect(labelled(page, "Leo, Message removed by an admin, Tue 27 Oct, 18:10")).toBeVisible();
    await f.done();
  }
  console.log("PASS (s2b): Leo's message removed while its report is open: the sheet stays with the reason and the typed text, says You can’t report that any more., Send report is disabled, and nothing is sent.");

  // (s3) Nothing to report on one's own message, nor on a system line.
  {
    const f = await fixture({ guests: PEOPLE, rows: [...octRows(), say(106, PEDRO, "See you there", "2026-10-28T09:45:00Z")] });
    const { page } = f;
    await openChat(page);
    const mine = labelled(page, "You, See you there, 09:45");
    assert.deepEqual(await a11yActions(mine), [{ name: "delete", label: "Delete message" }]);
    await longPress(mine);
    await expect(button(page, "Delete message")).toBeVisible();
    await expect(button(page, "Report message")).toHaveCount(0);
    await button(page, "Close sheet").click();
    await longPress(labelled(page, "Resbite: Mia joined"));
    await page.waitForTimeout(300);
    await expect(button(page, "Report message")).toHaveCount(0);
    // Someone else's message and the host's announcement are a guest's to report.
    assert.deepEqual(await a11yActions(leoBubble(page)), [{ name: "report", label: "Report message" }]);
    assert.deepEqual(await a11yActions(labelled(page, starts("Announcement to people going, Ana, "))), [{ name: "report", label: "Report message" }]);
    await f.done();
  }
  console.log("PASS (s3): no Report message on one's own message (Delete only) or on a system line; someone else's message and the host's announcement carry Report message as their action.");

  // (s4) The menu's Report or block, after Mute: Leo → Block Leo → the confirm → the chat replaces its list once.
  {
    const f = await fixture({ guests: PEOPLE });
    const { page } = f;
    await openChat(page);
    await peopleRead(f);
    await f.settle();
    await expect(leoBubble(page)).toBeVisible();
    await button(page, "More").click();
    const entry = button(page, "Report or block");
    await expect(entry).toBeVisible();
    assert.ok(await inOrder(page, [button(page, "Mute chat"), entry]), "Report or block comes after Mute chat");
    await entry.click();
    for (const name of ["Ana", "Leo", "Mia"]) await expect(inSheet(page, name)).toBeVisible();
    await expect(inSheet(page, "Pedro")).toHaveCount(0);
    // Each new view takes focus (H32 Q53, ruling SR6): the list's heading, then the person's.
    await expect.poll(() => focusedText(page)).toBe("Report or block");
    await inSheet(page, "Leo").click();
    await expect(button(page, "Report Leo")).toBeVisible();
    await expect.poll(() => focusedText(page)).toBe("Leo");
    assert.ok(await inOrder(page, [button(page, "Report Leo"), button(page, "Block Leo")]), "Report, then Block");
    await button(page, "Block Leo").click();
    await expect(text(page, BLOCK_LEO)).toBeVisible();
    // Keep goes back to the person's sheet, with focus on Block Leo.
    await button(page, "Keep").click();
    await expect.poll(() => focusedText(page)).toBe("Block Leo");
    await button(page, "Block Leo").click();
    await expect(text(page, BLOCK_LEO)).toBeVisible();
    const before = f.mark();
    await button(page, "Block Leo").click();
    await expect(sheet(page).getByText("Blocked", { exact: true })).toBeVisible();
    assert.deepEqual(f.callsSince(before, "block_user"), [{ p_user: LEO, p_block: true }]);
    await expect.poll(() => f.callsSince(before, "chat_messages").length).toBe(1);
    await f.settle();
    assert.equal(f.callsSince(before, "chat_summary").length, 1, "the replace reads the summary once");
    assert.equal(f.callsSince(before, "chat_messages").length, 1, "and the newest page once");
    await button(page, "Close sheet").click();
    await expect(labelled(page, starts("Leo, "))).toHaveCount(0);
    await expect(text(page, "Count me in")).toHaveCount(0);
    // The menu's list now offers Unblock Leo, and Leo reads Blocked.
    await button(page, "More").click();
    await button(page, "Report or block").click();
    // "Blocked" is said once: in the row's name, not again as its hint (ruling SR6 draft).
    assert.equal(await hintOf(button(page, "Leo, Blocked")), null);
    await button(page, "Leo, Blocked").click();
    await expect(button(page, "Unblock Leo")).toBeVisible();
    await expect(button(page, "Block Leo")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (s4): the menu's Report or block (after Mute chat) lists Ana, Leo and Mia, with focus on its heading; Leo → his sheet, focused on his name: Report Leo then Block Leo → the confirm reads Leo's question; Keep → focus on Block Leo; confirm → block_user { p_user, p_block: true }, then chat_summary and chat_messages once each, and no bubble by Leo; Leo then reads Blocked, said once, with Unblock Leo.");

  // (s4b) Blocked from People in this chat, over the mounted chat: its list is replaced before Back (B3).
  {
    const f = await fixture({ guests: PEOPLE });
    const { page } = f;
    await openChat(page);
    await peopleRead(f);
    await expect(leoBubble(page)).toBeVisible();
    await button(page, "More").click();
    await button(page, "People in this chat · 4").click();
    await expect(page).toHaveURL(new RegExp(`/guests\\?plan=${PLAN}$`));
    await button(page, "Actions for Leo").click();
    await button(page, "Block Leo").click();
    await expect(text(page, BLOCK_LEO)).toBeVisible();
    const before = f.mark();
    await button(page, "Block Leo").click();
    await expect(sheet(page).getByText("Blocked", { exact: true })).toBeVisible();
    assert.deepEqual(f.callsSince(before, "block_user"), [{ p_user: LEO, p_block: true }]);
    await expect.poll(() => f.callsSince(before, "chat_messages").length).toBeGreaterThan(0);
    assert.ok(f.callsSince(before, "chat_summary").length > 0, "the chat under the list read its summary");
    await page.waitForTimeout(300);
    await button(page, "Close sheet").click();
    await button(page, "Back").click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await expect(labelled(page, starts("Leo, "))).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (s4b): Block Leo from People in this chat, pushed over the chat: chat_summary and chat_messages are read by the chat beneath before Back, and back on it no bubble by Leo remains.");

  // (s4c) Unblocked off the chat, over it: Leo's bubbles are back on Back, read before it (B3).
  {
    const f = await fixture({ guests: PEOPLE, blocked: [LEO] });
    const { page } = f;
    await openChat(page);
    await peopleRead(f);
    await f.settle();
    await expect(leoBubble(page)).toHaveCount(0);
    // Task 6's Blocked people when this build has it; until then the people list's Unblock, pushed the same way.
    const blockedPeople = existsSync(new URL("../app/blocked-people.tsx", import.meta.url));
    await pushRoute(page, blockedPeople ? "/blocked-people" : `/guests?plan=${PLAN}`);
    if (!blockedPeople) await button(page, "Actions for Leo").click();
    const before = f.mark();
    await button(page, "Unblock Leo").click();
    await expect.poll(() => f.callsSince(before, "block_user")).toEqual([{ p_user: LEO, p_block: false }]);
    await expect.poll(() => f.callsSince(before, "chat_messages").length).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    // Blocked people's Back is named for Data & privacy, where it usually opens from (Task 6); the people list's is Back.
    await button(page, blockedPeople ? "Privacy" : "Back").click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await expect(leoBubble(page)).toBeVisible();
    await f.done();
    if (!blockedPeople) console.log("NOTE (s4c): /blocked-people is Task 6's screen and isn't in this build; the people list's Unblock stood in.");
  }
  console.log("PASS (s4c): with Leo blocked, an Unblock Leo made on a screen pushed over the chat calls block_user { p_block: false }, the chat reads chat_messages before Back, and Leo's bubbles are back.");

  // (s5) A host blocking a guest: the host's confirm, and R-Q6's line.
  {
    const f = await fixture({ viewer: ANA, guests: PEOPLE });
    const { page } = f;
    await openChat(page);
    await peopleRead(f);
    await button(page, "More").click();
    await button(page, "Report or block").click();
    await expect(inSheet(page, "Ana")).toHaveCount(0);
    await inSheet(page, "Leo").click();
    await button(page, "Block Leo").click();
    await expect(
      text(page, "Block Leo? You won’t see Leo’s messages or announcements, and you won’t be able to remove Leo’s messages. Any connection between you ends, and unblocking won’t bring it back."),
    ).toBeVisible();
    await expect(text(page, "This hides their messages from you only. To stop them for everyone, remove them from the resbite.")).toBeVisible();
    await button(page, "Keep").click();
    await expect(button(page, "Block Leo")).toBeVisible();
    assert.deepEqual(f.calls("block_user"), []);
    await f.done();
  }
  console.log("PASS (s5): a host blocking a guest reads Block Leo? You won’t see Leo’s messages or announcements, and you won’t be able to remove Leo’s messages. …, then This hides their messages from you only. …; Keep goes back and blocks nothing.");

  // (s6) A tap on an author's name opens their sheet; after the block, focus is on "Blocked".
  {
    const f = await fixture({ guests: PEOPLE });
    const { page } = f;
    await openChat(page);
    await peopleRead(f);
    await button(page, "Leo").first().click();
    await expect(button(page, "Report Leo")).toBeVisible();
    await button(page, "Block Leo").click();
    await expect(text(page, BLOCK_LEO)).toBeVisible();
    await button(page, "Block Leo").click();
    await expect(sheet(page).getByText("Blocked", { exact: true })).toBeVisible();
    await expect.poll(() => focusedText(page)).toBe("Blocked");
    assert.deepEqual(f.calls("block_user"), [{ p_user: LEO, p_block: true }]);
    await f.done();
  }
  console.log("PASS (s6): a tap on Leo's name opens his sheet (Report Leo, Block Leo); after the confirm, focus is on Blocked.");

  // (s6b) Ruling SR9: block_user answers false (nothing stored): the confirm closes with nothing said, and Leo's row
  // shows what my_blocks says (not blocked).
  {
    const f = await fixture({ guests: PEOPLE, blockNotStored: true });
    const { page } = f;
    await openChat(page);
    await peopleRead(f);
    await button(page, "Leo").first().click();
    await button(page, "Block Leo").click();
    await expect(text(page, BLOCK_LEO)).toBeVisible();
    const before = f.mark();
    await button(page, "Block Leo").click();
    await expect.poll(() => f.callsSince(before, "my_blocks").length).toBeGreaterThan(0);
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByText("Blocked", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    assert.deepEqual(f.callsSince(before, "block_user"), [{ p_user: LEO, p_block: true }]);
    // The menu's list reads my_blocks as answered: Leo isn't blocked, so Block Leo is offered again.
    await button(page, "More").click();
    await button(page, "Report or block").click();
    await expect(inSheet(page, "Leo")).toBeVisible();
    await expect(button(page, "Leo, Blocked")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (s6b): a block answered false closes its confirm with no Blocked and no other line; the list then shows Leo as my_blocks has him, not blocked.");

  // (s7) Not agreed yet: Send opens the rules first; Cancel keeps the words; I agree, then one send.
  {
    const f = await fixture({ summary: { rules_accepted: false } });
    const { page } = f;
    await openChat(page);
    await field(page).fill("Hi all");
    await button(page, "Send").click();
    await expect(heading(page, "Chat rules")).toBeVisible();
    await expect(text(page, "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account.")).toBeVisible();
    await button(page, "Cancel").click();
    await expect(heading(page, "Chat rules")).toHaveCount(0);
    await expect(field(page)).toHaveValue("Hi all");
    assert.equal(f.calls("send_message").length, 0, "Cancel sends nothing");
    assert.equal(f.calls("accept_chat_rules").length, 0);
    await button(page, "Send").click();
    await button(page, "I agree").click();
    await expect(heading(page, "Chat rules")).toHaveCount(0);
    await expect.poll(() => f.calls("send_message").length).toBe(1);
    assert.deepEqual(f.calls("accept_chat_rules"), [{}]);
    assert.equal(f.calls("send_message")[0].p_body, "Hi all");
    await expect(field(page)).toHaveValue("");
    await f.settle();
    assert.equal(f.calls("send_message").length, 1);
    await f.done();
  }
  console.log("PASS (s7): with rules_accepted false, Send opens Chat rules; Cancel sends nothing and keeps Hi all in the field; I agree calls accept_chat_rules, then send_message once.");

  // (s7b) The summary said agreed, the server refused: the message waits, and the rules sheet says so.
  {
    const f = await fixture({ serverAccepted: false, refusals: [400] });
    const { page } = f;
    await openChat(page);
    await field(page).fill("Hello");
    await button(page, "Send").click();
    await expect(heading(page, "Chat rules")).toBeVisible();
    await expect(text(page, "Your message hasn’t been sent. Agree to the chat rules to send it.")).toBeVisible();
    await expect(page.getByText("Not sent. Tap to retry.", { exact: true })).toBeVisible();
    await expect(page.getByText("Check your connection and try again.", { exact: true })).toHaveCount(0);
    const [first] = f.calls("send_message");
    await button(page, "I agree").click();
    await expect.poll(() => f.calls("send_message").length).toBe(2);
    assert.deepEqual(f.calls("accept_chat_rules"), [{}]);
    assert.equal(f.calls("send_message")[1].p_client_id, first.p_client_id);
    await expect(heading(page, "Chat rules")).toHaveCount(0);
    await expect(labelled(page, starts("You, Hello, "))).toBeVisible();
    await f.settle();
    assert.equal(f.calls("send_message").length, 2);
    await f.done();
  }
  console.log("PASS (s7b): a send refused 'Rules not accepted' reads Not sent. Tap to retry. and opens Chat rules with Your message hasn’t been sent…, no connection line; I agree calls accept_chat_rules, then send_message once with the same p_client_id.");

  // (s7c) I agree answered offline: the sheet stays with its line and nothing is sent; the second goes through.
  {
    const f = await fixture({ summary: { rules_accepted: false } });
    const { page } = f;
    await openChat(page);
    await field(page).fill("Hi all");
    await button(page, "Send").click();
    f.state.failAccepts = 1;
    await button(page, "I agree").click();
    await expect(text(page, "That didn’t go through, so nothing was sent. Try again.")).toBeVisible();
    await expect(heading(page, "Chat rules")).toBeVisible();
    assert.equal(f.calls("send_message").length, 0);
    await button(page, "I agree").click();
    await expect.poll(() => f.calls("send_message").length).toBe(1);
    assert.equal(f.calls("accept_chat_rules").length, 2);
    await f.done();
  }
  console.log("PASS (s7c): I agree answered offline keeps the sheet with That didn’t go through, so nothing was sent. Try again. and sends nothing; a second I agree calls accept_chat_rules again, then send_message once.");

  // (s7d) A host's announcement refused for the rules: the Announce sheet closes into them; I agree sends it as built.
  {
    const f = await fixture({ viewer: ANA, refusals: [400] });
    const { page } = f;
    await openChat(page);
    f.state.refuseAnnounce = RULES;
    await button(page, "Announce").click();
    await expect(heading(page, "New announcement")).toBeVisible();
    await page.getByRole("radio", { name: "Everyone invited · 5", exact: true }).click();
    await labelled(page, "Write an update for your guests").fill("Doors open at 19:30");
    await button(page, "Send announcement").click();
    await expect(heading(page, "Chat rules")).toBeVisible();
    await expect(heading(page, "New announcement")).toHaveCount(0);
    await expect(text(page, "Your announcement hasn’t been sent. Agree to the chat rules to send it.")).toBeVisible();
    await button(page, "I agree").click();
    await expect.poll(() => f.calls("send_announcement").length).toBe(2);
    assert.deepEqual(f.calls("accept_chat_rules"), [{}]);
    const [refused, sent] = f.calls("send_announcement");
    assert.deepEqual(sent, refused);
    assert.deepEqual([sent.p_body, sent.p_audience], ["Doors open at 19:30", "everyone"]);
    await expect(heading(page, "Chat rules")).toHaveCount(0);
    await expect(labelled(page, starts("Announcement to everyone invited, You, Doors open at 19:30"))).toBeVisible();
    // The words went with it: the next Announce starts empty.
    await button(page, "Announce").click();
    await expect(labelled(page, "Write an update for your guests")).toHaveValue("");
    await f.done();
  }
  console.log("PASS (s7d): a host's announcement refused 'Rules not accepted' closes the Announce sheet into Chat rules with Your announcement hasn’t been sent…; I agree calls accept_chat_rules, then send_announcement with the same p_client_id, p_body and p_audience.");

  // (s7e) Ruling SR6 draft (review M3): Send announcement before the rules are agreed: the rules first, in the sheet's
  // place; Cancel brings the words and audience back; I agree sends it.
  {
    const f = await fixture({ viewer: ANA, summary: { rules_accepted: false } });
    const { page } = f;
    await openChat(page);
    await button(page, "Announce").click();
    await page.getByRole("radio", { name: "Everyone invited · 5", exact: true }).click();
    await labelled(page, "Write an update for your guests").fill("Doors open at 19:30");
    await button(page, "Send announcement").click();
    await expect(heading(page, "Chat rules")).toBeVisible();
    await expect(heading(page, "New announcement")).toHaveCount(0);
    assert.equal(f.calls("send_announcement").length, 0, "nothing is called before I agree");
    await button(page, "Cancel").click();
    await expect(heading(page, "New announcement")).toBeVisible();
    await expect(labelled(page, "Write an update for your guests")).toHaveValue("Doors open at 19:30");
    await expect(page.getByRole("radio", { name: "Everyone invited · 5", exact: true })).toBeChecked();
    assert.equal(f.calls("accept_chat_rules").length, 0);
    await button(page, "Send announcement").click();
    await button(page, "I agree").click();
    await expect.poll(() => f.calls("send_announcement").length).toBe(1);
    assert.deepEqual(f.calls("accept_chat_rules"), [{}]);
    const [sent] = f.calls("send_announcement");
    assert.deepEqual([sent.p_body, sent.p_audience], ["Doors open at 19:30", "everyone"]);
    await expect(heading(page, "New announcement")).toHaveCount(0);
    await expect(labelled(page, starts("Announcement to everyone invited, You, Doors open at 19:30"))).toBeVisible();
    await f.done();
  }
  console.log("PASS (s7e): Send announcement with rules_accepted false turns the sheet into Chat rules and calls nothing; Cancel brings back the words and Everyone invited; I agree calls accept_chat_rules, then send_announcement once with them.");

  // (s7f) Ruling SR6 draft (review M3): Cancel on an announcement held for the rules: the form again with its words and
  // audience, and the wait dropped; sent later, it keeps its client id.
  {
    const f = await fixture({ viewer: ANA, refusals: [400] });
    const { page } = f;
    await openChat(page);
    f.state.refuseAnnounce = RULES;
    await button(page, "Announce").click();
    await page.getByRole("radio", { name: "Everyone invited · 5", exact: true }).click();
    await labelled(page, "Write an update for your guests").fill("Doors open at 19:30");
    await button(page, "Send announcement").click();
    await expect(text(page, "Your announcement hasn’t been sent. Agree to the chat rules to send it.")).toBeVisible();
    await button(page, "Cancel").click();
    await expect(heading(page, "New announcement")).toBeVisible();
    await expect(heading(page, "Chat rules")).toHaveCount(0);
    await expect(labelled(page, "Write an update for your guests")).toHaveValue("Doors open at 19:30");
    await expect(page.getByRole("radio", { name: "Everyone invited · 5", exact: true })).toBeChecked();
    assert.equal(f.calls("accept_chat_rules").length, 0);
    assert.equal(f.calls("send_announcement").length, 1, "only the refused one");
    // Sent again (the server now takes it), with the client id kept for the same words and audience.
    await button(page, "Send announcement").click();
    await expect.poll(() => f.calls("send_announcement").length).toBe(2);
    const [refused, sent] = f.calls("send_announcement");
    assert.deepEqual(sent, refused);
    await expect(heading(page, "New announcement")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (s7f): Cancel on an announcement held for the rules brings back the form with its words and Everyone invited, sends nothing more, and the announcement then goes with the same p_client_id.");

  // (s8) A blocked term.
  {
    const f = await fixture({ refuseSends: [{ code: "22023", message: "Not allowed" }], refusals: [400] });
    const { page } = f;
    await openChat(page);
    await field(page).fill("something the list stops");
    await button(page, "Send").click();
    await expect(text(page, "That message can’t be sent.")).toBeVisible();
    await expect(heading(page, "Chat rules")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (s8): a send refused 'Not allowed' reads That message can’t be sent.");

  // (s9) Alone in the chat: nobody to report or block.
  {
    const f = await fixture({ viewer: ANA, guests: [] });
    const { page } = f;
    await openChat(page);
    await peopleRead(f);
    await f.settle();
    await button(page, "More").click();
    await expect(button(page, "Mute chat")).toBeVisible();
    await expect(button(page, "Report or block")).toHaveCount(0);
    await f.done();
  }
  console.log("PASS (s9): alone in the chat, the menu has no Report or block.");

  // (s10) Removed by Resbite, or by a host.
  {
    const f = await fixture({
      rows: [
        ...octRows(),
        row(106, { author: LEO, state: "removed", payload: { by: "resbite" }, at: "2026-10-28T09:40:00Z" }),
        row(107, { author: MIA, state: "removed", at: "2026-10-28T09:45:00Z" }),
      ],
    });
    const { page } = f;
    await openChat(page);
    await expect(labelled(page, "Leo, Message removed by Resbite, 09:40")).toBeVisible();
    await expect(text(page, "Message removed by Resbite")).toBeVisible();
    await expect(labelled(page, "Mia, Message removed by an admin, 09:45")).toBeVisible();
    await f.done();
  }
  console.log("PASS (s10): a row removed with payload {by: \"resbite\"} reads Message removed by Resbite; a host's removal reads Message removed by an admin.");

  console.log("PASS: the chat screen. Every request intercepted; the Realtime socket stubbed.");
} finally {
  await browser.close();
}
