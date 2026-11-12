import test from "node:test";
import assert from "node:assert/strict";
import { chatErrorMessage, createChatGateway, isChatClosed, isHostsOnly, isNotInChat, isNotInGroup, isTooFast, serverTime } from "./chat";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(data: unknown = null, error: unknown = null) {
  const calls: Call[] = [];
  const gw = createChatGateway(async (fn, args) => {
    calls.push({ fn, args });
    return { data, error };
  });
  return { calls, gw };
}

const SERIES = "0b000000-0000-4000-8000-000000000001";
const PLAN = "0c000000-0000-4000-8000-000000000001";
const ANA = "0a000000-0000-4000-8000-000000000001";
const LEO = "0a000000-0000-4000-8000-000000000002";
const CLIENT = "0d000000-0000-4000-8000-000000000001";

const row = (over: Record<string, unknown> = {}) => ({
  id: 41,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: "I can bring the snacks",
  state: "sent",
  author_id: LEO,
  created_at: "2025-11-15T18:02:00+00:00",
  updated_at: "2025-11-15T18:02:00+00:00",
  ...over,
});
const message = (over: Record<string, unknown> = {}) => ({
  id: 41,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: "I can bring the snacks",
  state: "sent",
  authorId: LEO,
  createdAt: "2025-11-15T18:02:00+00:00",
  updatedAt: "2025-11-15T18:02:00+00:00",
  clientId: null,
  ...over,
});

test("summary sends chat_summary with the series and reads the server's answer in camelCase", async () => {
  const pinned = row({ id: 40, kind: "announcement", audience: "everyone", author_id: ANA, body: "Doors open at 19:30" });
  const { calls, gw } = gateway({
    series_id: SERIES,
    plan_id: PLAN,
    title: "Picnic in the park",
    starts_at: "2025-11-15T13:00:00+00:00",
    ends_at: "2025-11-15T17:00:00+00:00",
    time_zone: "Europe/London",
    status: "active",
    repeat_weeks: null,
    is_group: false,
    stopped: false,
    closes_at: "2025-11-17T17:00:00+00:00",
    open: true,
    host: true,
    accepted: 6,
    members: 8,
    going: 8,
    everyone: 9,
    pinned,
    last: row(),
    names: { [ANA]: "Ana", [LEO]: "Leo" },
    muted_chat: true,
    muted_resbite: false,
    last_read_id: 39,
    unread: true,
    message_count: 23,
  });
  assert.deepEqual(await gw.summary(SERIES), {
    seriesId: SERIES,
    planId: PLAN,
    title: "Picnic in the park",
    startsAt: "2025-11-15T13:00:00+00:00",
    endsAt: "2025-11-15T17:00:00+00:00",
    timeZone: "Europe/London",
    status: "active",
    repeatWeeks: null,
    isGroup: false,
    stopped: false,
    closesAt: "2025-11-17T17:00:00+00:00",
    open: true,
    host: true,
    accepted: 6,
    members: 8,
    going: 8,
    everyone: 9,
    pinned: message({ id: 40, kind: "announcement", audience: "everyone", authorId: ANA, body: "Doors open at 19:30" }),
    last: message(),
    names: { [ANA]: "Ana", [LEO]: "Leo" },
    mutedChat: true,
    mutedResbite: false,
    lastReadId: 39,
    unread: true,
    messageCount: 23,
  });
  assert.deepEqual(calls, [{ fn: "chat_summary", args: { p_series: SERIES } }]);
});

test("summary reads a group's repeat, no pin, no last line and no read mark", async () => {
  const { gw } = gateway({
    series_id: SERIES,
    plan_id: PLAN,
    title: "Board game night",
    starts_at: "2025-11-13T19:00:00+00:00",
    ends_at: null,
    time_zone: "Europe/London",
    status: "active",
    repeat_weeks: 1,
    is_group: true,
    stopped: false,
    closes_at: null,
    open: true,
    host: false,
    accepted: 6,
    members: 9,
    going: 6,
    everyone: 9,
    pinned: null,
    last: null,
    names: {},
    muted_chat: false,
    muted_resbite: false,
    last_read_id: null,
    unread: false,
    message_count: 0,
  });
  const s = await gw.summary(SERIES);
  assert.equal(s.repeatWeeks, 1);
  assert.equal(s.isGroup, true);
  assert.equal(s.endsAt, null);
  assert.equal(s.closesAt, null);
  assert.equal(s.pinned, null);
  assert.equal(s.last, null);
  assert.equal(s.lastReadId, null);
});

test("messages sends chat_messages with the series, the page's end and its size, and returns a page", async () => {
  const system = row({
    id: 42,
    kind: "system",
    event: "joined",
    payload: { actor: ANA, user: ANA },
    body: null,
    author_id: null,
  });
  const { calls, gw } = gateway({
    rows: [row({ client_id: CLIENT, author_id: ANA }), system],
    names: { [ANA]: "Ana", [LEO]: null },
    as_of: "2025-11-15T18:05:00.123+00:00",
  });
  assert.deepEqual(await gw.messages(SERIES), {
    rows: [
      message({ clientId: CLIENT, authorId: ANA }),
      message({ id: 42, kind: "system", event: "joined", payload: { actor: ANA, user: ANA }, body: null, authorId: null }),
    ],
    names: { [ANA]: "Ana", [LEO]: null },
    asOf: "2025-11-15T18:05:00.123+00:00",
  });
  await gw.messages(SERIES, 40, 100);
  assert.deepEqual(calls, [
    { fn: "chat_messages", args: { p_series: SERIES, p_before: null, p_limit: 50 } },
    { fn: "chat_messages", args: { p_series: SERIES, p_before: 40, p_limit: 100 } },
  ]);
});

test("since sends chat_messages_since with its three arguments, the cursor as given and null the first time (K-B1)", async () => {
  const { calls, gw } = gateway({ rows: [row({ id: 43, state: "removed", body: null })], names: {}, as_of: "2025-11-15T18:06:00+00:00" });
  assert.deepEqual(await gw.since(SERIES, 42, null), {
    rows: [message({ id: 43, state: "removed", body: null })],
    names: {},
    asOf: "2025-11-15T18:06:00+00:00",
  });
  await gw.since(SERIES, 43, "2025-11-15T18:04:00.000Z");
  await gw.since(SERIES, null, null);
  assert.deepEqual(calls, [
    { fn: "chat_messages_since", args: { p_series: SERIES, p_after: 42, p_changed_after: null } },
    { fn: "chat_messages_since", args: { p_series: SERIES, p_after: 43, p_changed_after: "2025-11-15T18:04:00.000Z" } },
    { fn: "chat_messages_since", args: { p_series: SERIES, p_after: null, p_changed_after: null } },
  ]);
});

test("a page reads missing rows and names as empty", async () => {
  assert.deepEqual(await gateway({ as_of: "2025-11-15T18:06:00+00:00" }).gw.since(SERIES, 1, null), {
    rows: [],
    names: {},
    asOf: "2025-11-15T18:06:00+00:00",
  });
});

test("send and announce send their functions with the client id and return the stored row", async () => {
  const sent = gateway(row({ author_id: ANA, client_id: CLIENT }));
  assert.deepEqual(await sent.gw.send(SERIES, "I can bring the snacks", CLIENT), message({ authorId: ANA, clientId: CLIENT }));
  assert.deepEqual(sent.calls, [
    { fn: "send_message", args: { p_series: SERIES, p_body: "I can bring the snacks", p_client_id: CLIENT } },
  ]);
  const announced = gateway(row({ kind: "announcement", audience: "everyone", author_id: ANA, client_id: CLIENT }));
  assert.deepEqual(
    await announced.gw.announce(SERIES, "Doors open at 19:30", "everyone", CLIENT),
    message({ kind: "announcement", audience: "everyone", authorId: ANA, clientId: CLIENT }),
  );
  assert.deepEqual(announced.calls, [
    {
      fn: "send_announcement",
      args: { p_series: SERIES, p_body: "Doors open at 19:30", p_audience: "everyone", p_client_id: CLIENT },
    },
  ]);
});

test("remove, deleteOwn, markRead and setMute each send their own function", async () => {
  const { calls, gw } = gateway();
  await gw.remove(41);
  await gw.deleteOwn(42);
  await gw.markRead(SERIES, 43);
  await gw.setMute(SERIES, true);
  await gw.setMute(SERIES, false);
  assert.deepEqual(calls, [
    { fn: "remove_message", args: { p_id: 41 } },
    { fn: "delete_message", args: { p_id: 42 } },
    { fn: "mark_chat_read", args: { p_series: SERIES, p_last_id: 43 } },
    { fn: "set_chat_mute", args: { p_series: SERIES, p_muted: true } },
    { fn: "set_chat_mute", args: { p_series: SERIES, p_muted: false } },
  ]);
});

test("overview sends my_chat_overview and keeps each announcement's id (SHOULD 7)", async () => {
  const { calls, gw } = gateway({
    chats: {
      [SERIES]: { unread: true, last: row(), open: true, count: 4 },
      other: { unread: false, last: null, open: false, count: 0 },
    },
    announcements: { [PLAN]: { id: 40, author_id: ANA, body: "Doors open at 19:30" } },
    names: { [ANA]: "Ana", [LEO]: "Leo" },
  });
  assert.deepEqual(await gw.overview(), {
    chats: {
      [SERIES]: { unread: true, last: message(), open: true, count: 4 },
      other: { unread: false, last: null, open: false, count: 0 },
    },
    announcements: { [PLAN]: { id: 40, authorId: ANA, body: "Doors open at 19:30" } },
    names: { [ANA]: "Ana", [LEO]: "Leo" },
  });
  assert.deepEqual(calls, [{ fn: "my_chat_overview", args: {} }]);
  assert.deepEqual(await gateway({}).gw.overview(), { chats: {}, announcements: {}, names: {} });
  assert.deepEqual(await gateway(null).gw.overview(), { chats: {}, announcements: {}, names: {} });
});

test("a refusal is thrown as the server sent it", async () => {
  const refusal = { code: "42501", message: "Not in this chat" };
  const { gw } = gateway(null, refusal);
  const calls: Promise<unknown>[] = [
    gw.summary(SERIES),
    gw.messages(SERIES),
    gw.since(SERIES, 1, null),
    gw.send(SERIES, "hi", CLIENT),
    gw.announce(SERIES, "hi", "going", CLIENT),
    gw.remove(1),
    gw.deleteOwn(1),
    gw.markRead(SERIES, 1),
    gw.setMute(SERIES, true),
    gw.overview(),
  ];
  for (const call of calls) await assert.rejects(call, (e) => e === refusal);
});

test("the deadline wraps each of the gateway's ten calls", async () => {
  const wrapped: string[] = [];
  const gw = createChatGateway(
    async (fn) => ({ data: fn === "send_message" || fn === "send_announcement" ? row() : { rows: [], as_of: "x" }, error: null }),
    async (request) => {
      wrapped.push("wrapped");
      return request(new AbortController().signal);
    },
  );
  await gw.summary(SERIES).catch(() => {});
  await gw.messages(SERIES);
  await gw.since(SERIES, 1, null);
  await gw.send(SERIES, "hi", CLIENT);
  await gw.announce(SERIES, "hi", "going", CLIENT);
  await gw.remove(1);
  await gw.deleteOwn(1);
  await gw.markRead(SERIES, 1);
  await gw.setMute(SERIES, true);
  await gw.overview();
  assert.equal(wrapped.length, 10);
});

test("the server's refusals read as plain words; anything else is the connection line", () => {
  assert.equal(chatErrorMessage({ code: "42501", message: "Not in this chat" }), "You’re not in this chat.");
  assert.equal(chatErrorMessage({ code: "42501", message: "Hosts only" }), "Only hosts can do that.");
  assert.equal(chatErrorMessage({ code: "42501", message: "Not your message" }), "You can only delete your own messages.");
  assert.equal(chatErrorMessage({ code: "22023", message: "Chat closed" }), "This chat is closed.");
  assert.equal(chatErrorMessage({ code: "22023", message: "Slow down" }), "You’re sending messages too fast. Wait a moment.");
  assert.equal(chatErrorMessage({ code: "22023", message: "Too fast" }), "You’re sending messages too fast. Wait a moment.");
  assert.equal(chatErrorMessage({ code: "22023", message: "Invalid message" }), "Write something first, up to 1,000 characters.");
  for (const other of [
    new Error("Failed to fetch"),
    { code: "42501", message: "Something new" },
    { code: "22023", message: "Something new" },
    { code: "22023", message: "Not in this chat" },
    { code: "57014" },
    null,
  ])
    assert.equal(chatErrorMessage(other), "Check your connection and try again.");
});

test("isNotInChat and isChatClosed tell the two refusals the hook acts on by code and message (H11)", () => {
  assert.equal(isNotInChat({ code: "42501", message: "Not in this chat" }), true);
  assert.equal(isChatClosed({ code: "22023", message: "Chat closed" }), true);
  for (const other of [
    { code: "42501", message: "Hosts only" },
    { code: "22023", message: "Not in this chat" },
    { code: "42501", message: "Chat closed" },
    { code: "22023", message: "Slow down" },
    { message: "Not in this chat" },
    new Error("Not in this chat"),
    null,
    undefined,
    "Chat closed",
  ]) {
    assert.equal(isNotInChat(other), false);
    assert.equal(isChatClosed(other), false);
  }
});

test("a page drops rows without a numeric id and reads odd fields as empty (D4)", async () => {
  const { gw } = gateway({
    rows: [
      row({ id: "abc" }),
      null,
      "row",
      row({ id: 0 }),
      row({ id: 1.5 }),
      row({ id: "7", payload: "str", audience: "nobody", event: 5, body: 9, author_id: 3, client_id: {} }),
      row({ id: 8, payload: [1], created_at: undefined, updated_at: null }),
    ],
    names: { [LEO]: "Leo" },
    as_of: "x",
  });
  const page = await gw.messages(SERIES);
  assert.deepEqual(
    page.rows.map((r) => r.id),
    [7, 8],
  );
  assert.deepEqual(page.rows[0], message({ id: 7, payload: null, audience: null, event: null, body: null, authorId: null }));
  assert.equal(page.rows[1].payload, null);
  assert.equal(page.rows[1].createdAt, "");
  assert.equal(page.rows[1].updatedAt, "");
});

test("a summary's numbers fall back to 0, its odd last and pinned to null, its missing text to empty (D4)", async () => {
  const s = await gateway({ accepted: "x", members: null, going: "4", everyone: {}, message_count: NaN, last_read_id: "x", pinned: {}, last: "str" }).gw.summary(SERIES);
  assert.equal(s.accepted, 0);
  assert.equal(s.members, 0);
  assert.equal(s.going, 4);
  assert.equal(s.everyone, 0);
  assert.equal(s.messageCount, 0);
  assert.equal(s.lastReadId, null);
  assert.equal(s.pinned, null);
  assert.equal(s.last, null);
  assert.equal(s.startsAt, "");
  assert.equal(s.timeZone, "");
  assert.equal(s.title, "");
  assert.equal(s.seriesId, "");
  assert.equal(s.planId, "");
  assert.equal(s.status, "");
  assert.equal(s.endsAt, null);
  assert.equal(s.closesAt, null);
  assert.deepEqual(s.names, {});
  assert.equal((await gateway({ pinned: row({ id: "abc" }) }).gw.summary(SERIES)).pinned, null);
});

test("an overview keeps every chat when one's last line is odd, and drops an announcement without a numeric id (D4)", async () => {
  const o = await gateway({
    chats: {
      a: { unread: true, last: "str", open: true, count: "x" },
      b: { unread: false, last: row(), open: false, count: 3 },
      c: "junk",
    },
    announcements: { p1: { id: "abc", author_id: ANA, body: "x" }, p2: { id: 40, author_id: ANA, body: "Doors open" }, p3: 5 },
  }).gw.overview();
  assert.deepEqual(o.chats, {
    a: { unread: true, last: null, open: true, count: 0 },
    b: { unread: false, last: message(), open: false, count: 3 },
    c: { unread: false, last: null, open: false, count: 0 },
  });
  assert.deepEqual(o.announcements, { p2: { id: 40, authorId: ANA, body: "Doors open" } });
});

test("a send answered with a row the app can't read is refused", async () => {
  await assert.rejects(gateway(row({ id: "abc" })).gw.send(SERIES, "hi", CLIENT));
  await assert.rejects(gateway(null).gw.announce(SERIES, "hi", "going", CLIENT));
});

test("serverTime cuts a fraction to milliseconds without rounding, and pads a short one (H24 (4), H26 Q1)", () => {
  assert.equal(serverTime("2026-11-11T12:00:00.123456+00:00"), "2026-11-11T12:00:00.123+00:00");
  assert.equal(serverTime("2026-11-11T12:00:00.1239+00:00"), "2026-11-11T12:00:00.123+00:00");
  assert.equal(serverTime("2026-11-11T12:00:00.999999+00:00"), "2026-11-11T12:00:00.999+00:00");
  assert.equal(serverTime("2026-11-11T12:00:00.12+00:00"), "2026-11-11T12:00:00.120+00:00");
  assert.equal(serverTime("2026-11-11T12:00:00.5Z"), "2026-11-11T12:00:00.500Z");
  assert.equal(serverTime("2026-11-11T12:00:00.123+00:00"), "2026-11-11T12:00:00.123+00:00");
  assert.equal(serverTime("2026-11-11T12:00:00+00:00"), "2026-11-11T12:00:00+00:00");
  assert.equal(serverTime(""), "");
  // Not a time: left as it is.
  assert.equal(serverTime("Bring 2.5 litres"), "Bring 2.5 litres");
});

test("every stamp the gateway reads goes through serverTime: rows, as_of, the summary's times and a change line's (H24 (4))", async () => {
  const micro = (s: string) => `2026-11-11T12:00:0${s}+00:00`;
  const r = row({
    created_at: micro("0.123456"),
    updated_at: micro("1.5"),
    event: "changed",
    kind: "system",
    body: null,
    payload: { actor: ANA, what: "time", from_start: micro("2.1239"), to_start: micro("3.12"), place_label: "Hall 2.5" },
  });
  const { gw } = gateway({ rows: [r], names: {}, as_of: micro("4.9876543") });
  const page = await gw.since(SERIES, 40, null);
  assert.equal(page.asOf, "2026-11-11T12:00:04.987+00:00");
  assert.equal(page.rows[0].createdAt, "2026-11-11T12:00:00.123+00:00");
  assert.equal(page.rows[0].updatedAt, "2026-11-11T12:00:01.500+00:00");
  assert.equal(page.rows[0].payload?.from_start, "2026-11-11T12:00:02.123+00:00");
  assert.equal(page.rows[0].payload?.to_start, "2026-11-11T12:00:03.120+00:00");
  assert.equal(page.rows[0].payload?.place_label, "Hall 2.5");
  const s = await gateway({
    starts_at: micro("5.1"),
    ends_at: micro("6.123456"),
    closes_at: micro("7.65"),
    pinned: row({ created_at: micro("8.000001") }),
  }).gw.summary(SERIES);
  assert.equal(s.startsAt, "2026-11-11T12:00:05.100+00:00");
  assert.equal(s.endsAt, "2026-11-11T12:00:06.123+00:00");
  assert.equal(s.closesAt, "2026-11-11T12:00:07.650+00:00");
  assert.equal(s.pinned?.createdAt, "2026-11-11T12:00:08.000+00:00");
  const sent = await gateway(row({ updated_at: micro("9.4444444") })).gw.send(SERIES, "x", CLIENT);
  assert.equal(sent.updatedAt, "2026-11-11T12:00:09.444+00:00");
});

test("isHostsOnly and isTooFast tell 'Hosts only' and the announcement limit by code and message (H32)", () => {
  assert.equal(isHostsOnly({ code: "42501", message: "Hosts only" }), true);
  assert.equal(isTooFast({ code: "22023", message: "Too fast" }), true);
  for (const other of [
    { code: "42501", message: "Not in this chat" },
    { code: "22023", message: "Hosts only" },
    { code: "22023", message: "Slow down" },
    { code: "42501", message: "Too fast" },
    Error("Too fast"),
    null,
  ]) {
    assert.equal(isHostsOnly(other), false);
    assert.equal(isTooFast(other), false);
  }
});

// Plan 2 (groups).
test("leave sends leave_series with the series, through the deadline, and throws a refusal as sent (G-N13)", async () => {
  const { calls, gw } = gateway();
  assert.equal(await gw.leave(SERIES), undefined);
  assert.deepEqual(calls, [{ fn: "leave_series", args: { p_series: SERIES } }]);
  const refusal = { code: "42501", message: "Owner can't leave" };
  await assert.rejects(gateway(null, refusal).gw.leave(SERIES), (e) => e === refusal);
  const wrapped: string[] = [];
  const timed = createChatGateway(
    async (fn) => ({ data: null, error: null, fn }),
    async (request) => {
      wrapped.push("wrapped");
      return request(new AbortController().signal);
    },
  );
  await timed.leave(SERIES);
  assert.deepEqual(wrapped, ["wrapped"]);
});

test("leaving's refusals read as plain words, the server's straight apostrophe matched; anything else is the connection line", () => {
  assert.equal(chatErrorMessage({ code: "42501", message: "Not in this group" }), "You’re not in this group.");
  assert.equal(chatErrorMessage({ code: "42501", message: "Hosts can't leave" }), "To leave, step down first: change your reply to Can’t go.");
  assert.equal(chatErrorMessage({ code: "42501", message: "Owner can't leave" }), "You own this group, so you can’t leave it.");
  for (const other of [
    { code: "42501", message: "Hosts can’t leave" },
    { code: "42501", message: "Owner can’t leave" },
    { code: "22023", message: "Not in this group" },
    { code: "P0001", message: "Hosts can't leave" },
    new Error("Failed to fetch"),
  ])
    assert.equal(chatErrorMessage(other), "Check your connection and try again.");
  // Chat core's refusals are as built.
  assert.equal(chatErrorMessage({ code: "42501", message: "Not in this chat" }), "You’re not in this chat.");
});

// Ruling GR1 (4): a row may say which occurrence it belongs to (Task 2's chat_row adds plan_id).
test("a row keeps its plan id when the server sends one, and has none otherwise", async () => {
  const { gw } = gateway({
    rows: [row({ id: 1, plan_id: PLAN }), row({ id: 2 }), row({ id: 3, plan_id: "" }), row({ id: 4, plan_id: 7 })],
    names: {},
    as_of: "2025-11-15T18:03:00+00:00",
  });
  const page = await gw.messages(SERIES);
  assert.deepEqual(page.rows.map((r) => r.planId), [PLAN, undefined, undefined, undefined]);
  assert.deepEqual(page.rows[0], message({ id: 1, planId: PLAN }));
  assert.equal("planId" in page.rows[1], false);
});

test("isNotInGroup tells leave_series' 'Not in this group' by code and message (ruling GR4 M-2)", () => {
  assert.equal(isNotInGroup({ code: "42501", message: "Not in this group" }), true);
  for (const other of [
    { code: "42501", message: "Not in this chat" },
    { code: "42501", message: "Hosts can't leave" },
    { code: "22023", message: "Not in this group" },
    new Error("Not in this group"),
    null,
  ])
    assert.equal(isNotInGroup(other), false);
});
