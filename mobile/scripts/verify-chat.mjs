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
//   l   a leave answered with an error (7.5b): no channel is left behind, so each return joins anew and is live, with
//       no poll
//   m   the pinned card loads back to an unloaded message and scrolls to it (K-S12)
//   n   the host's empty state: Nobody's going yet, Invite people (H12); a guest's: No messages yet
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { button, heading, visible } from "./qa-helpers.mjs";

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
const NAMES = { [ANA]: "Ana", [PEDRO]: "Pedro", [MIA]: "Mia", [LEO]: "Leo" };
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
const row = (id, { kind = "message", author = null, body = null, state = "sent", at, event = null, payload = null, audience = null, clientId = null, hidden = false } = {}) => ({
  id,
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
async function fixture({ viewer = PEDRO, now = OCT.now, rows = octRows(), summary = {}, socket = "ok", width = 390, height = 844, queue = null, refusals = [] } = {}) {
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
    ({ key, session, queueKey, queue }) => {
      globalThis.__resbiteDevice ??= { reminders: [], calendar: [], permission: "denied" };
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(key, JSON.stringify(session));
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
      session: {
        user: userOf(viewer),
        access_token: jwt(viewer),
        refresh_token: "fixture",
        token_type: "bearer",
        expires_at: 4102444800,
        expires_in: 3600,
      },
      queueKey: `resbite.chat-queue.v1.${viewer}`,
      queue,
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
      ...summary,
    },
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

  const visibleRows = () => state.rows.filter((r) => !r.hidden).sort((a, b) => a.id - b.id);
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
    if (path === "/rest/v1/profiles") return reply({ id: viewer, display_name: NAMES[viewer], avatar_path: null, avatar_revision: 0 });
    // The people list (scenario l): the plan, nobody else on it, and the reads around it.
    if (path === "/rest/v1/plans" && url.searchParams.get("id") === `eq.${PLAN}`) return reply({ ...PICNIC, plan_meeting_details: null, plan_admins: [] });
    if (path === "/rest/v1/attendees" && url.searchParams.get("plan_id") === `eq.${PLAN}`)
      return reply(url.searchParams.get("select") === "version,response" ? { version: 1, response: "accepted" } : []);
    if (["/rest/v1/rpc/plan_connection_states", "/rest/v1/rpc/plan_bringers"].includes(path)) return reply({});
    if (["/rest/v1/rpc/plan_phone_invitations", "/rest/v1/rpc/plan_brought_invitations", "/rest/v1/rpc/my_join_requests"].includes(path))
      return reply([]);
    if (["/rest/v1/plans", "/rest/v1/attendees", "/rest/v1/plan_mutes", "/rest/v1/activities"].includes(path)) return reply([]);

    const rpc = path.startsWith("/rest/v1/rpc/") ? path.slice("/rest/v1/rpc/".length) : null;
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
    assert.deepEqual(await a11yActions(leo), [{ name: "remove", label: "Remove message" }]);
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
    assert.deepEqual(await a11yActions(labelled(page, "Leo, Count me in, Tue 27 Oct, 18:10")), [{ name: "remove", label: "Remove message" }]);
    assert.deepEqual(await a11yActions(labelled(page, starts("Announcement to people going, You, "))), [{ name: "delete", label: "Delete message" }]);
    // Mia's message holds a link: an action opens it too.
    assert.deepEqual(await a11yActions(labelled(page, starts("Mia, Map: "))), [
      { name: "remove", label: "Remove message" },
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

  console.log("PASS: the chat screen. Every request intercepted; the Realtime socket stubbed.");
} finally {
  await browser.close();
}
