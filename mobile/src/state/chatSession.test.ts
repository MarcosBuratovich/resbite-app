import test from "node:test";
import assert from "node:assert/strict";
import { createChatSession, listenWith, type ChatState, type ChatTimers } from "./chatSession";
import { createChatQueue, type QueuedMessage } from "../services/chatQueue";
import type { ChatGateway, ChatMessage, ChatSummary } from "../services/chat";
import { CHAT_COPY } from "../domain/chatCopy";
import { closingLine } from "../domain/chatRules";
import { INVITE_COPY } from "../domain/inviteCopy";

const SERIES = "0b000000-0000-4000-8000-000000000001";
const OTHER_SERIES = "0b000000-0000-4000-8000-000000000002";
const ME = "0a000000-0000-4000-8000-0000000000e1";
const LEO = "0a000000-0000-4000-8000-0000000000b2";
const START = Date.parse("2026-11-11T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const NOT_IN_CHAT = { code: "42501", message: "Not in this chat" };
const CHAT_CLOSED = { code: "22023", message: "Chat closed" };
const OFFLINE = Error("Network request failed");

const flush = () => new Promise<void>((r) => setImmediate(r));
async function settle() {
  for (let i = 0; i < 40; i++) await flush();
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Timers the test moves by hand; promises settle between timers. */
function fakeClock(start: number) {
  let now = start,
    seq = 0;
  const timers = new Map<number, { at: number; every: number; fn: () => void }>();
  const clock: ChatTimers & { advance(ms: number): Promise<void>; sets(): number; pending(): number } = {
    now: () => now,
    sets: () => seq,
    pending: () => timers.size,
    setTimeout: (fn, ms) => {
      timers.set(++seq, { at: now + Math.max(0, ms), every: 0, fn });
      return seq;
    },
    clearTimeout: (id) => void timers.delete(id as number),
    setInterval: (fn, ms) => {
      timers.set(++seq, { at: now + ms, every: ms, fn });
      return seq;
    },
    clearInterval: (id) => void timers.delete(id as number),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        let next: [number, { at: number; every: number; fn: () => void }] | null = null;
        for (const entry of timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.fn();
        await settle();
      }
      now = end;
      await settle();
    },
  };
  return clock;
}

const message = (id: number, at: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: `message ${id}`,
  state: "sent",
  authorId: LEO,
  createdAt: iso(at),
  updatedAt: iso(at),
  clientId: null,
  ...over,
});

const baseSummary = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  seriesId: SERIES,
  planId: "0c000000-0000-4000-8000-000000000001",
  title: "Picnic in the park",
  startsAt: "2026-11-14T12:00:00.000Z",
  endsAt: "2026-11-14T15:00:00.000Z",
  timeZone: "Europe/London",
  status: "active",
  repeatWeeks: null,
  isGroup: false,
  stopped: false,
  closesAt: "2026-11-16T15:00:00.000Z",
  open: true,
  host: false,
  accepted: 2,
  members: 3,
  going: 2,
  everyone: 4,
  pinned: null,
  last: null,
  names: { [LEO]: "Leo" },
  mutedChat: false,
  mutedResbite: false,
  lastReadId: null,
  unread: false,
  messageCount: 0,
  ...over,
});

type Method = keyof ChatGateway;

/** The server's side, as Tasks 1–2 define the reads: newest pages, `since` capped at 200, sends by client id. */
function fakeServer(clock: { now(): number }) {
  let rows: ChatMessage[] = [];
  let nextId = 100;
  let summary = baseSummary();
  /** The server's clock minus the phone's. */
  let skew = 0;
  const calls: Array<[Method, ...unknown[]]> = [];
  const fail: Partial<Record<Method, unknown>> = {};
  const once: Partial<Record<Method, unknown[]>> = {};
  const gates: Partial<Record<Method, Promise<void>>> = {};
  /** An answer taken when the call is made and delivered on release (a slow network, not a slow server). */
  const holds: Partial<Record<Method, Array<ReturnType<typeof deferred>>>> = {};
  const asOf = () => iso(clock.now() + skew);
  const sorted = () => [...rows].sort((a, b) => a.id - b.id);
  async function step(name: Method, args: unknown[]) {
    calls.push([name, ...args]);
    const gate = gates[name];
    if (gate) await gate;
    const thrown = once[name]?.shift();
    if (thrown) throw thrown;
    if (fail[name]) throw fail[name];
  }
  async function late<T>(name: Method, value: T): Promise<T> {
    const hold = holds[name]?.shift();
    if (hold) await hold.promise;
    return value;
  }
  const add = (over: Partial<ChatMessage> = {}): ChatMessage => {
    const id = over.id ?? ++nextId;
    nextId = Math.max(nextId, id);
    const row = message(id, clock.now(), over);
    rows.push(row);
    return row;
  };
  const change = (id: number, over: Partial<ChatMessage>) => {
    rows = rows.map((r) => (r.id === id ? { ...r, ...over, updatedAt: asOf() } : r));
  };
  const gateway: ChatGateway = {
    summary: async (series) => {
      await step("summary", [series]);
      return late("summary", summary);
    },
    messages: async (series, before = null, limit = 50) => {
      await step("messages", [series, before, limit]);
      const list = sorted().filter((r) => before === null || r.id < before);
      return late("messages", { rows: list.slice(-limit), names: { [LEO]: "Leo" }, asOf: asOf() });
    },
    since: async (series, after, changedAfter) => {
      await step("since", [series, after, changedAfter]);
      const list = sorted().filter(
        (r) =>
          r.id > (after ?? 0) || (changedAfter !== null && Date.parse(r.updatedAt) > Date.parse(changedAfter)),
      );
      return late("since", { rows: list.slice(0, 200), names: { [LEO]: "Leo" }, asOf: asOf() });
    },
    send: async (series, body, clientId) => {
      await step("send", [series, body, clientId]);
      return late("send", rows.find((r) => r.clientId === clientId) ?? add({ body, clientId, authorId: ME }));
    },
    announce: async (series, body, audience, clientId) => {
      await step("announce", [series, body, audience, clientId]);
      const row = rows.find((r) => r.clientId === clientId) ?? add({ kind: "announcement", audience, body, clientId, authorId: ME });
      summary = { ...summary, pinned: row };
      return row;
    },
    remove: async (id) => {
      await step("remove", [id]);
      change(id, { state: "removed", body: null });
    },
    deleteOwn: async (id) => {
      await step("deleteOwn", [id]);
      change(id, { state: "deleted", body: null });
    },
    markRead: async (series, lastId) => {
      await step("markRead", [series, lastId]);
    },
    setMute: async (series, muted) => {
      await step("setMute", [series, muted]);
    },
    overview: async () => {
      throw Error("not used by the chat");
    },
  };
  return {
    gateway,
    calls: (name: Method) => calls.filter((c) => c[0] === name).map((c) => c.slice(1)),
    callCount: () => calls.length,
    fail,
    failOnce(name: Method, e: unknown) {
      (once[name] ??= []).push(e);
    },
    hold(name: Method) {
      const d = deferred();
      (holds[name] ??= []).push(d);
      return d;
    },
    skewBy(ms: number) {
      skew = ms;
    },
    gates,
    add,
    change,
    seed(n: number) {
      for (let i = 0; i < n; i++) add();
    },
    setSummary(next: Partial<ChatSummary>) {
      summary = { ...summary, ...next };
    },
  };
}

type FakeChannel = {
  series: string;
  on: { signal(payload: unknown): void; status(status: string): void };
  removed: boolean;
  remove(): void;
};

function memoryDisk() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => void data.set(k, v),
    removeItem: async (k: string) => void data.delete(k),
  };
}

function setup(
  opts: {
    queue?: ReturnType<typeof createChatQueue>;
    listen?: (series: string, on: FakeChannel["on"]) => { remove(): void };
    /** The first this many channels can't be made: `listen` throws. */
    listenThrows?: number;
  } = {},
) {
  const clock = fakeClock(START);
  const server = fakeServer(clock);
  const queue = opts.queue ?? createChatQueue(memoryDisk());
  const states: ChatState[] = [];
  const channels: FakeChannel[] = [];
  let uuid = 0;
  let current = true;
  const session = createChatSession({
    series: SERIES,
    scope: ME,
    gateway: server.gateway,
    queue,
    listen: (series, on) => {
      if (opts.listen) return opts.listen(series, on);
      if (opts.listenThrows && opts.listenThrows-- > 0) throw Error("WebSocket not available");
      const channel: FakeChannel = {
        series,
        on,
        removed: false,
        remove() {
          channel.removed = true;
        },
      };
      channels.push(channel);
      return channel;
    },
    newId: () => `client-${++uuid}`,
    timers: clock,
    current: () => current,
    onChange: (next) => void states.push(next),
  });
  const state = (): ChatState => session.state();
  const ids = () => state().messages.map((m) => m.id);
  const latest = () => channels[channels.length - 1];
  const openChannels = () => channels.filter((c) => !c.removed).length;
  /** What a call landing after the session ended must leave as it is (H25). */
  const snapshot = () => ({
    state: state(),
    channels: channels.length,
    open: openChannels(),
    timers: clock.sets(),
    calls: server.callCount(),
  });
  return {
    clock,
    server,
    queue,
    channels,
    session,
    state,
    states,
    ids,
    latest,
    openChannels,
    snapshot,
    endSession: () => (current = false),
    async open() {
      session.focus();
      await settle();
    },
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const queuedItem = (clientId: string, createdAt: number, over: Partial<QueuedMessage> = {}): QueuedMessage => ({
  clientId,
  series: SERIES,
  body: `queued ${clientId}`,
  createdAt: iso(createdAt),
  failed: false,
  ...over,
});

test("focus reads the summary and the newest page of 50, keeps its as_of and marks the newest id read", async () => {
  const t = setup();
  t.server.seed(3);
  assert.equal(t.state().busy, true);
  await t.open();
  assert.deepEqual(t.server.calls("summary"), [[SERIES]]);
  assert.deepEqual(t.server.calls("messages"), [[SERIES, null, 50]]);
  assert.deepEqual(t.ids(), [101, 102, 103]);
  const s = t.state();
  assert.equal(s.summary?.title, "Picnic in the park");
  assert.equal(s.names[LEO], "Leo");
  assert.equal(s.hasEarlier, false);
  assert.equal(s.busy, false);
  assert.equal(s.error, null);
  assert.deepEqual(t.server.calls("markRead"), [[SERIES, 103]]);
  assert.equal(t.channels.length, 1);
  assert.equal(t.channels[0].series, SERIES);
});

test("SUBSCRIBED reads once with since(newest id, as_of − 2 minutes), and each answer's as_of is the next cursor (K-B1, K-N6)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  await t.clock.advance(5_000);
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.deepEqual(t.server.calls("since"), [[SERIES, 103, "2026-11-11T11:58:00.000Z"]]);
  t.server.add({ body: "I can bring the snacks" });
  t.latest().on.signal({ id: 104, kind: "message", state: "sent" });
  await settle();
  assert.deepEqual(t.server.calls("since")[1], [SERIES, 103, "2026-11-11T11:58:05.000Z"]);
  assert.deepEqual(t.ids(), [101, 102, 103, 104]);
  assert.deepEqual(t.server.calls("markRead").at(-1), [SERIES, 104]);
});

test("a burst of signals while a read is in flight makes one more read, never two at once (K-N6)", async () => {
  const t = setup();
  t.server.seed(2);
  await t.open();
  const gate = deferred();
  t.server.gates.since = gate.promise;
  for (let i = 0; i < 5; i++) t.latest().on.signal({ id: 102, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.server.calls("since").length, 1);
  delete t.server.gates.since;
  gate.resolve();
  await settle();
  assert.equal(t.server.calls("since").length, 2);
});

test("an announcement or a state signal reads the summary again; a plain message doesn't (K-S12)", async () => {
  const t = setup();
  t.server.seed(2);
  await t.open();
  t.latest().on.signal({ id: 103, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.server.calls("summary").length, 1);
  const pinned = t.server.add({ kind: "announcement", audience: "going", body: "Bring a blanket" });
  t.server.setSummary({ pinned });
  t.latest().on.signal({ id: pinned.id, kind: "announcement", state: "sent" });
  await settle();
  assert.equal(t.server.calls("summary").length, 2);
  assert.equal(t.state().summary?.pinned?.id, pinned.id);
  t.server.change(pinned.id, { state: "removed", body: null });
  t.server.setSummary({ pinned: null });
  t.latest().on.signal({ id: pinned.id, kind: "announcement", state: "removed" });
  await settle();
  assert.equal(t.server.calls("summary").length, 3);
  assert.equal(t.state().summary?.pinned, null);
});

test("through the signal a removal blanks the open screen and a late commit lands in its place (K-B1)", async () => {
  const t = setup();
  for (const id of [110, 120, 130]) t.server.add({ id });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  await t.clock.advance(30_000);
  t.server.change(120, { state: "removed", body: null });
  t.latest().on.signal({ id: 120, kind: "message", state: "removed" });
  await settle();
  const removed = t.state().messages.find((m) => m.id === 120);
  assert.equal(removed?.state, "removed");
  assert.equal(removed?.body, null);
  // A "joined" line whose transaction committed after 130 was read.
  t.server.add({ id: 125, kind: "system", event: "joined", body: null, authorId: null, payload: { actor: LEO, user: LEO } });
  t.latest().on.signal({ id: 125, kind: "system", state: "sent" });
  await settle();
  assert.deepEqual(t.ids(), [110, 120, 125, 130]);
});

test("in a chat held from its first row, a late commit below the oldest loaded id still lands; with earlier rows unloaded it waits for loadEarlier (K-B1)", async () => {
  const t = setup();
  t.server.add({ id: 120 });
  await t.open();
  assert.equal(t.state().hasEarlier, false);
  // The first line of the chat, whose transaction began before 120's and committed after the read.
  t.server.add({ id: 110, kind: "system", event: "joined", body: null, authorId: null, payload: { actor: LEO, user: LEO } });
  t.latest().on.signal({ id: 110, kind: "system", state: "sent" });
  await settle();
  assert.deepEqual(t.ids(), [110, 120]);

  const u = setup();
  for (let i = 0; i < 60; i++) u.server.add({ id: 200 + i });
  await u.open();
  assert.equal(u.state().hasEarlier, true);
  u.server.add({ id: 150 });
  u.latest().on.signal({ id: 150, kind: "message", state: "sent" });
  await settle();
  assert.equal(u.ids()[0], 210);
});

test("a full 200-row since answer is a gap: the newest page and the summary are read again and replace the list (H22)", async () => {
  const t = setup();
  t.server.seed(60);
  await t.open();
  assert.deepEqual(t.ids(), range(111, 160));
  t.server.seed(250);
  t.latest().on.signal({ id: 410, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.server.calls("since").length, 1);
  assert.deepEqual(t.server.calls("messages"), [
    [SERIES, null, 50],
    [SERIES, null, 50],
  ]);
  assert.equal(t.server.calls("summary").length, 2);
  assert.deepEqual(t.ids(), range(361, 410));
  assert.equal(t.state().hasEarlier, true);
  // The next read starts from the replaced list.
  t.latest().on.signal({ id: 410, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.server.calls("since")[1][1], 410);
});

test("199 rows still merge: only a full answer is a gap", async () => {
  const t = setup();
  t.server.seed(10);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await t.clock.advance(180_000);
  // A read with nothing new moves the cursor past the first rows.
  t.latest().on.signal({ id: 110, kind: "message", state: "sent" });
  await settle();
  t.server.seed(199);
  t.latest().on.signal({ id: 309, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.server.calls("messages").length, 1);
  assert.deepEqual(t.ids(), range(101, 309));
});

test("the poll reads every 20 seconds only while the channel isn't subscribed (K-N6, Decision 12)", async () => {
  const t = setup();
  t.server.seed(2);
  await t.open();
  await t.clock.advance(19_999);
  assert.equal(t.server.calls("since").length, 0);
  await t.clock.advance(1);
  assert.equal(t.server.calls("since").length, 1);
  await t.clock.advance(20_000);
  assert.equal(t.server.calls("since").length, 2);
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.server.calls("since").length, 3);
  await t.clock.advance(60_000);
  assert.equal(t.server.calls("since").length, 3);
  t.latest().on.status("CHANNEL_ERROR");
  await t.clock.advance(20_000);
  assert.equal(t.server.calls("since").length, 4);
});

test("on the poll-only path a removal reaches the screen within one poll, and the pinned card falls back (K-B1, Review Focus 6)", async () => {
  const t = setup();
  t.server.seed(1);
  const first = t.server.add({ kind: "announcement", audience: "going", body: "Meet at the gate" });
  const second = t.server.add({ kind: "announcement", audience: "everyone", body: "Bring a blanket" });
  t.server.setSummary({ pinned: second });
  await t.open();
  assert.equal(t.state().summary?.pinned?.id, second.id);
  t.latest().on.status("CHANNEL_ERROR");
  await t.clock.advance(5_000);
  t.server.change(second.id, { state: "removed", body: null });
  t.server.setSummary({ pinned: first });
  await t.clock.advance(15_000);
  const removed = t.state().messages.find((m) => m.id === second.id);
  assert.equal(removed?.state, "removed");
  assert.equal(removed?.body, null);
  assert.equal(t.state().summary?.pinned?.id, first.id);
  // The overlap returns the removed row again; nothing changed, so the summary isn't read again.
  const summaries = t.server.calls("summary").length;
  await t.clock.advance(20_000);
  assert.equal(t.server.calls("summary").length, summaries);
});

test("channel errors: the hook never resubscribes itself, and three in a row remove the channel until the next focus (K-N6)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  const channel = t.latest();
  channel.on.status("CHANNEL_ERROR");
  channel.on.status("TIMED_OUT");
  assert.equal(channel.removed, false);
  // supabase-js's own backoff rejoins; a rejoin starts the count again.
  channel.on.status("SUBSCRIBED");
  channel.on.status("CHANNEL_ERROR");
  channel.on.status("TIMED_OUT");
  assert.equal(channel.removed, false);
  channel.on.status("CHANNEL_ERROR");
  assert.equal(channel.removed, true);
  assert.equal(t.channels.length, 1);
  await settle();
  // The poll carries on without it.
  const reads = t.server.calls("since").length;
  await t.clock.advance(20_000);
  assert.equal(t.server.calls("since").length, reads + 1);
  t.session.blur();
  await t.open();
  assert.equal(t.channels.length, 2);
  assert.equal(t.latest().removed, false);
});

test("42501 'Not in this chat' from a read removes the channel at once and empties the chat (K-N1)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  t.server.fail.since = NOT_IN_CHAT;
  t.server.add({ body: "after Can't go" });
  t.latest().on.signal({ id: 104, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.latest().removed, true);
  const s = t.state();
  assert.equal(s.summary, null);
  assert.deepEqual(s.messages, []);
  assert.equal(s.error, CHAT_COPY.notInChat);
  // No poll and no more reads.
  const reads = t.server.calls("since").length;
  await t.clock.advance(60_000);
  assert.equal(t.server.calls("since").length, reads);
  assert.equal(t.server.calls("markRead").length, 1);
});

test("42501 'Not in this chat' on focus removes the channel too, and the next focus tries again", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.fail.summary = NOT_IN_CHAT;
  await t.open();
  assert.equal(t.latest().removed, true);
  assert.equal(t.state().summary, null);
  assert.equal(t.state().error, CHAT_COPY.notInChat);
  assert.equal(t.state().busy, false);
  t.session.blur();
  delete t.server.fail.summary;
  await t.open();
  assert.equal(t.state().error, null);
  assert.deepEqual(t.ids(), [101]);
  assert.equal(t.latest().removed, false);
});

test("the summary is read again when now reaches closesAt, by its timer, without a refocus (K-S10)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ closesAt: iso(START + 90_000) });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  await t.clock.advance(89_000);
  assert.equal(t.server.calls("summary").length, 1);
  t.server.setSummary({ open: false });
  await t.clock.advance(1_000);
  assert.equal(t.server.calls("summary").length, 2);
  assert.equal(t.state().summary?.open, false);
  // Closed: the minute tick has nothing to do.
  await t.clock.advance(120_000);
  assert.equal(t.server.calls("summary").length, 2);
});

test("a passed closesAt that still says open is asked again three times a second apart, then by the minute tick (K-S10, H26 Q7)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ closesAt: iso(START - 1_000) });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.server.calls("summary").length, 1);
  await t.clock.advance(3_000);
  assert.equal(t.server.calls("summary").length, 4);
  await t.clock.advance(56_000);
  assert.equal(t.server.calls("summary").length, 4);
  await t.clock.advance(1_000);
  assert.equal(t.server.calls("summary").length, 5);
});

test("a server a moment behind at the close: the closed card comes a second later, not a minute (H26 Q7)", async () => {
  const t = setup();
  t.server.seed(1);
  const close = START + 30 * 60_000;
  t.server.setSummary({ closesAt: iso(close) });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  await t.clock.advance(close - START);
  assert.equal(t.server.calls("summary").length, 2);
  assert.equal(t.state().summary?.open, true);
  t.server.setSummary({ open: false });
  await t.clock.advance(1_000);
  assert.equal(t.state().summary?.open, false);
});

test("send queues the message first, sends it with its client id and takes it off the queue once sent (K-S7)", async () => {
  const t = setup();
  t.server.seed(2);
  await t.open();
  const gate = deferred();
  t.server.gates.send = gate.promise;
  const sent = t.session.send("I can bring the snacks");
  await settle();
  assert.deepEqual(t.server.calls("send"), [[SERIES, "I can bring the snacks", "client-1"]]);
  assert.deepEqual(
    (await t.queue.list(ME, SERIES)).map((q) => [q.clientId, q.body, q.failed]),
    [["client-1", "I can bring the snacks", false]],
  );
  assert.deepEqual(
    t.state().pending.map((q) => [q.clientId, q.failed, q.createdAt]),
    [["client-1", false, iso(START)]],
  );
  delete t.server.gates.send;
  gate.resolve();
  assert.equal(await sent, true);
  // Sent: it stays as pending until a read brings its row, which the send asks for (H26 D2, D3).
  assert.deepEqual(t.state().pending.map((q) => q.clientId), ["client-1"]);
  await settle();
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
  assert.deepEqual(t.state().pending, []);
  const mine = t.state().messages.at(-1);
  assert.equal(mine?.clientId, "client-1");
  assert.equal(mine?.body, "I can bring the snacks");
  // Nothing visible is nothing to send.
  assert.equal(await t.session.send(" \n\t "), false);
  assert.equal(t.server.calls("send").length, 1);
});

test("a send that fails offline shows not sent; retry resends with the same client id, and focus never resends it (K-S7)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  t.server.fail.send = OFFLINE;
  assert.equal(await t.session.send("See you there"), false);
  await settle();
  assert.deepEqual(t.state().pending.map((q) => [q.clientId, q.failed]), [["client-1", true]]);
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.failed), [true]);
  assert.equal(t.state().error, INVITE_COPY.offline);
  t.session.blur();
  await t.clock.advance(30_000);
  await t.open();
  assert.equal(t.server.calls("send").length, 1);
  delete t.server.fail.send;
  assert.equal(await t.session.retry("client-1"), true);
  await settle();
  assert.deepEqual(t.server.calls("send"), [
    [SERIES, "See you there", "client-1"],
    [SERIES, "See you there", "client-1"],
  ]);
  assert.deepEqual(t.state().pending, []);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
  assert.equal(t.state().error, null);
});

test("42501 or 'Chat closed' marks the message failed and nothing resends it; 'Chat closed' reads the summary again (K-S7, K-S10)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  t.server.fail.send = CHAT_CLOSED;
  t.server.setSummary({ open: false });
  const summaries = t.server.calls("summary").length;
  assert.equal(await t.session.send("Thanks all"), false);
  await settle();
  assert.deepEqual(t.state().pending.map((q) => q.failed), [true]);
  assert.equal(t.server.calls("summary").length, summaries + 1);
  assert.equal(t.state().summary?.open, false);
  // Closed while on screen: the failed bubble stays for this visit, so its text can still be read.
  assert.deepEqual(t.state().pending.map((q) => q.body), ["Thanks all"]);
  t.session.blur();
  await t.clock.advance(30_000);
  await t.open();
  assert.equal(t.server.calls("send").length, 1);
  // The next visit reads it closed: nothing is sent again, and the words stay until deleted (H32 29, overruling H26 Q6).
  assert.deepEqual(t.state().pending.map((q) => [q.body, q.failed]), [["Thanks all", true]]);
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.body), ["Thanks all"]);

  const u = setup();
  u.server.seed(1);
  await u.open();
  u.server.fail.send = NOT_IN_CHAT;
  assert.equal(await u.session.send("Still on?"), false);
  await settle();
  assert.equal(u.latest().removed, true);
  assert.equal(u.state().error, CHAT_COPY.notInChat);
  assert.deepEqual((await u.queue.list(ME, SERIES)).map((q) => q.failed), [true]);
});

test("focus, and the return to the app, resend what isn't failed and is older than 10 seconds, with its own client id (K-S7)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.queue.put(ME, queuedItem("old", START - 11_000));
  await t.queue.put(ME, queuedItem("young", START - 9_000));
  await t.queue.put(ME, queuedItem("gave-up", START - 60_000, { failed: true }));
  await t.queue.put(ME, queuedItem("elsewhere", START - 60_000, { series: OTHER_SERIES }));
  await t.open();
  assert.deepEqual(t.server.calls("send"), [[SERIES, "queued old", "old"]]);
  assert.deepEqual(t.state().pending.map((q) => [q.clientId, q.failed]), [["young", false], ["gave-up", true]]);
  // Back from the background two seconds later, the young one is now stale.
  t.session.background();
  await t.clock.advance(2_000);
  t.session.focus();
  await settle();
  assert.deepEqual(t.server.calls("send").map((c) => c[2]), ["old", "young"]);
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.clientId), ["gave-up"]);
  assert.deepEqual((await t.queue.list(ME, OTHER_SERIES)).map((q) => q.clientId), ["elsewhere"]);
});

test("a queued message the server already holds is taken off the queue, not sent again", async () => {
  const t = setup();
  const stored = t.server.add({ body: "queued kept", clientId: "kept", authorId: ME });
  await t.queue.put(ME, queuedItem("kept", START - 60_000, { failed: true }));
  await t.open();
  assert.equal(t.server.calls("send").length, 0);
  assert.deepEqual(t.state().pending, []);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
  assert.equal(t.state().messages[0].id, stored.id);
});

test("a queue write after sign-out ('Session changed') sends nothing; the 101st unsent message is refused and shows as not sent", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  t.queue.suspend(ME);
  assert.equal(await t.session.send("during sign-out"), false);
  await settle();
  assert.equal(t.server.calls("send").length, 0);
  assert.deepEqual(t.state().pending, []);
  t.queue.resume(ME);

  for (let i = 0; i < 100; i++) await t.queue.put(ME, queuedItem(`other-${i}`, START, { series: OTHER_SERIES, failed: true }));
  assert.equal(await t.session.send("one too many"), false);
  await settle();
  assert.equal(t.server.calls("send").length, 0);
  assert.deepEqual(t.state().pending.map((q) => [q.clientId, q.body, q.failed]), [["client-2", "one too many", true]]);
  // Still full: a tap sends it from the screen's copy, as one the queue couldn't keep is sent (H41 m3).
  const held = t.server.hold("send");
  const retried = t.session.retry("client-2");
  await settle();
  assert.deepEqual(t.server.calls("send"), [[SERIES, "one too many", "client-2"]]);
  assert.deepEqual(t.state().pending.map((q) => [q.clientId, q.failed]), [["client-2", false]]);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
  held.resolve();
  assert.equal(await retried, true);
  await settle();
  assert.deepEqual(t.state().pending, []);
  // Room again: the retry saves it first, then sends it.
  assert.equal(await t.session.send("two too many"), false);
  await t.queue.remove(ME, "other-0");
  const again = t.server.hold("send");
  const second = t.session.retry("client-3");
  await settle();
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => [q.clientId, q.failed]), [["client-3", false]]);
  again.resolve();
  assert.equal(await second, true);
  assert.deepEqual(t.server.calls("send").map((c) => c[1]), ["one too many", "two too many"]);
  await settle();
  assert.deepEqual(t.state().pending, []);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
});

test("discard takes a failed message off the queue and the screen", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  t.server.fail.send = OFFLINE;
  await t.session.send("never mind");
  await t.session.discard("client-1");
  assert.deepEqual(t.state().pending, []);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
});

test("loadEarlier reads pages of 100 before the oldest; loadUntil reads until the oldest is at or below the id (K-S12)", async () => {
  const t = setup();
  t.server.seed(300);
  await t.open();
  assert.deepEqual(t.ids(), range(351, 400));
  assert.equal(t.state().hasEarlier, true);
  await t.session.loadEarlier();
  assert.deepEqual(t.ids(), range(251, 400));
  assert.equal(t.state().hasEarlier, true);
  await t.session.loadUntil(120);
  assert.deepEqual(t.server.calls("messages"), [
    [SERIES, null, 50],
    [SERIES, 351, 100],
    [SERIES, 251, 100],
    [SERIES, 151, 100],
  ]);
  assert.deepEqual(t.ids(), range(101, 400));
  assert.equal(t.state().hasEarlier, false);
  await t.session.loadEarlier();
  await t.session.loadUntil(5);
  assert.equal(t.server.calls("messages").length, 4);
});

test("a refocus after a gap replaces the list; one that reaches the cached newest merges and keeps the earlier pages (K-B1)", async () => {
  const t = setup();
  t.server.seed(10);
  await t.open();
  t.session.blur();
  t.server.seed(90);
  await t.open();
  assert.deepEqual(t.ids(), range(151, 200));
  assert.equal(t.state().hasEarlier, true);
  await t.session.loadEarlier();
  assert.deepEqual(t.ids(), range(101, 200));
  t.session.blur();
  t.server.seed(5);
  await t.open();
  assert.deepEqual(t.ids(), range(101, 205));
});

test("the chat is marked read after every fetch while focused and looking, and on blur while looking; never twice for one id (K-S11)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.signal({ id: 103, kind: "message", state: "sent" });
  await settle();
  assert.deepEqual(t.server.calls("markRead"), [[SERIES, 103]]);
  t.server.add();
  t.latest().on.signal({ id: 104, kind: "message", state: "sent" });
  await settle();
  assert.deepEqual(t.server.calls("markRead"), [[SERIES, 103], [SERIES, 104]]);
  // In the background nobody is looking: the fetch lands, and neither it nor a blur then marks it (H26 Q3).
  t.session.background();
  t.server.add();
  t.latest().on.signal({ id: 105, kind: "message", state: "sent" });
  await settle();
  assert.deepEqual(t.ids().at(-1), 105);
  assert.equal(t.server.calls("markRead").length, 2);
  t.session.blur();
  assert.equal(t.server.calls("markRead").length, 2);
  // Seen at the next focus.
  await t.open();
  assert.deepEqual(t.server.calls("markRead").at(-1), [SERIES, 105]);
  // A read that lands after the blur marks nothing.
  const u = setup();
  u.server.seed(1);
  await u.open();
  const gate = deferred();
  u.server.gates.since = gate.promise;
  u.server.add();
  u.latest().on.signal({ id: 102, kind: "message", state: "sent" });
  await settle();
  u.session.blur();
  gate.resolve();
  await settle();
  assert.deepEqual(u.server.calls("markRead"), [[SERIES, 101]]);
});

test("blur, the end of the session and dispose remove the channel; a removed channel is no longer heard", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  const first = t.latest();
  t.session.blur();
  assert.equal(first.removed, true);
  first.on.status("SUBSCRIBED");
  first.on.signal({ id: 101, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.server.calls("since").length, 0);
  await t.clock.advance(60_000);
  assert.equal(t.server.calls("since").length, 0);
  await t.open();
  t.session.dispose();
  assert.equal(t.latest().removed, true);
  // Signed out: nothing more is read or applied.
  const u = setup();
  u.server.seed(1);
  await u.open();
  u.endSession();
  u.server.add();
  u.latest().on.signal({ id: 102, kind: "message", state: "sent" });
  await settle();
  assert.deepEqual(u.ids(), [101]);
});

test("deleteOwn and remove blank the row at once and read again; setMute keeps the summary's switch", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.add({ authorId: ME, body: "oops" });
  await t.open();
  assert.equal(await t.session.deleteOwn(102), true);
  assert.deepEqual(t.server.calls("deleteOwn"), [[102]]);
  const gone = t.state().messages.find((m) => m.id === 102);
  assert.equal(gone?.state, "deleted");
  assert.equal(gone?.body, null);
  await settle();
  assert.equal(t.server.calls("since").length, 1);
  assert.equal(await t.session.remove(101), true);
  assert.equal(t.state().messages[0].state, "removed");
  assert.equal(await t.session.setMute(true), true);
  assert.deepEqual(t.server.calls("setMute"), [[SERIES, true]]);
  assert.equal(t.state().summary?.mutedChat, true);
  t.server.fail.remove = { code: "42501", message: "Hosts only" };
  t.server.add();
  await settle();
  assert.equal(await t.session.remove(103), false);
  assert.equal(t.state().error, CHAT_COPY.hostsOnly);
});

test("announce sends with its audience, pins the card from the summary, and reuses its client id for the same text after a failure", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ host: true });
  await t.open();
  t.server.fail.announce = OFFLINE;
  assert.equal(await t.session.announce("Moved to 3pm", "everyone"), false);
  delete t.server.fail.announce;
  assert.equal(await t.session.announce("Moved to 3pm", "everyone"), true);
  await settle();
  assert.deepEqual(t.server.calls("announce"), [
    [SERIES, "Moved to 3pm", "everyone", "client-1"],
    [SERIES, "Moved to 3pm", "everyone", "client-1"],
  ]);
  assert.equal(t.state().summary?.pinned?.body, "Moved to 3pm");
  assert.equal(t.state().messages.at(-1)?.kind, "announcement");
  assert.equal(await t.session.announce("Moved to 4pm", "going"), true);
  assert.equal(t.server.calls("announce")[2][3], "client-2");
});

test("listenWith opens chat:<series> as a private channel, hears its chat broadcasts and statuses, and removes a channel left behind first", async () => {
  type Handler = (message: { payload?: unknown }) => void;
  const made: Array<{ name: string; opts: unknown; filter?: unknown; type?: string; handler?: Handler; status?: (s: string) => void }> = [];
  const order: string[] = [];
  const left = { topic: `realtime:chat:${SERIES}` };
  let channels: Array<{ topic: string }> = [left, { topic: "realtime:chat:other" }];
  const client = {
    getChannels: () => channels,
    channel(name: string, opts: { config: { private: boolean } }) {
      order.push(`channel ${name}`);
      const entry: (typeof made)[number] = { name, opts };
      made.push(entry);
      const channel = {
        topic: `realtime:${name}`,
        on(type: "broadcast", filter: { event: string }, handler: Handler) {
          entry.type = type;
          entry.filter = filter;
          entry.handler = handler;
          return channel;
        },
        subscribe(status: (s: string) => void) {
          entry.status = status;
          return channel;
        },
      };
      channels = [...channels, channel];
      return channel;
    },
    async removeChannel(channel: { topic: string }) {
      order.push(`remove ${channel.topic}`);
      channels = channels.filter((c) => c !== channel);
      return "ok";
    },
  };
  const heard: unknown[] = [];
  const statuses: string[] = [];
  const handle = listenWith(client)(SERIES, { signal: (p) => heard.push(p), status: (s) => statuses.push(s) });
  await settle();
  assert.deepEqual(order, [`remove realtime:chat:${SERIES}`, `channel chat:${SERIES}`]);
  assert.deepEqual(made[0].opts, { config: { private: true } });
  assert.equal(made[0].type, "broadcast");
  assert.deepEqual(made[0].filter, { event: "chat" });
  made[0].handler?.({ payload: { id: 7, kind: "message", state: "removed" } });
  made[0].status?.("SUBSCRIBED");
  assert.deepEqual(heard, [{ id: 7, kind: "message", state: "removed" }]);
  assert.deepEqual(statuses, ["SUBSCRIBED"]);
  handle.remove();
  await settle();
  assert.equal(order.at(-1), `remove realtime:chat:${SERIES}`);
  assert.deepEqual(channels.map((c) => c.topic), ["realtime:chat:other"]);
  // Removed before the channel was made: none is made.
  const early = listenWith(client)(SERIES, { signal: () => {}, status: () => {} });
  early.remove();
  await settle();
  assert.equal(made.length, 1);
});

// ---- Fix round 1: H24 amended, H25, H26 ----

/** Nothing changed: the same state, no channel opened, no timer set and no call made, a mark included (H25). */
async function untouched(t: ReturnType<typeof setup>, before: ReturnType<ReturnType<typeof setup>["snapshot"]>) {
  await settle();
  await t.clock.advance(60_000);
  assert.equal(t.state(), before.state);
  assert.equal(t.channels.length, before.channels);
  assert.equal(t.openChannels(), before.open);
  assert.equal(t.clock.sets(), before.timers);
  assert.equal(t.server.callCount(), before.calls);
}

test("the session ending while a since is in flight: nothing applied, no channel, no timer, no mark (H25)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  const gate = deferred();
  t.server.gates.since = gate.promise;
  t.server.add({ kind: "announcement", audience: "going", body: "Late news" });
  t.latest().on.signal({ id: 104, kind: "announcement", state: "sent" });
  await settle();
  const before = t.snapshot();
  t.endSession();
  delete t.server.gates.since;
  gate.resolve();
  await untouched(t, before);
});

test("the session ending while a newest page is in flight: nothing applied, no channel, no timer, no mark (H25)", async () => {
  const t = setup();
  t.server.seed(3);
  t.server.fail.summary = NOT_IN_CHAT;
  await t.open();
  delete t.server.fail.summary;
  assert.equal(t.openChannels(), 0);
  const gate = deferred();
  t.server.gates.messages = gate.promise;
  void t.session.refresh();
  await settle();
  const before = t.snapshot();
  t.endSession();
  delete t.server.gates.messages;
  gate.resolve();
  await untouched(t, before);
  assert.equal(t.openChannels(), 0);
});

test("the session ending while a summary read is in flight: nothing applied, no timer, no mark (H25)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  const gate = deferred();
  t.server.gates.summary = gate.promise;
  t.server.setSummary({ closesAt: iso(START + 3_600_000) });
  const pinned = t.server.add({ kind: "announcement", audience: "going", body: "Moved" });
  t.server.setSummary({ pinned });
  t.latest().on.signal({ id: pinned.id, kind: "announcement", state: "sent" });
  await settle();
  assert.equal(t.server.calls("summary").length, 2);
  const before = t.snapshot();
  t.endSession();
  delete t.server.gates.summary;
  gate.resolve();
  await untouched(t, before);
});

test("the session ending while an earlier page is in flight: nothing applied (H25)", async () => {
  const t = setup();
  t.server.seed(120);
  await t.open();
  const gate = deferred();
  t.server.gates.messages = gate.promise;
  const earlier = t.session.loadEarlier();
  await settle();
  const before = t.snapshot();
  t.endSession();
  delete t.server.gates.messages;
  gate.resolve();
  await earlier;
  await untouched(t, before);
});

test("the session ending while a send is in flight: nothing applied and nothing read (H25)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  const gate = deferred();
  t.server.gates.send = gate.promise;
  const sent = t.session.send("signing out");
  await settle();
  const before = t.snapshot();
  t.endSession();
  delete t.server.gates.send;
  gate.resolve();
  await sent;
  await untouched(t, before);
});

test("the session ending while the resend lists the queue: nothing is sent (H25)", async () => {
  const queue = createChatQueue(memoryDisk());
  await queue.put(ME, queuedItem("left", START - 60_000));
  const slow = deferred();
  const list = queue.list;
  const t = setup({
    queue: {
      ...queue,
      list: async (scope: string, series: string) => {
        const found = await list(scope, series);
        await slow.promise;
        return found;
      },
    },
  });
  t.server.seed(1);
  await t.open();
  const before = t.snapshot();
  t.endSession();
  slow.resolve();
  await untouched(t, before);
  assert.equal(t.server.calls("send").length, 0);
});

test("the resend never sends again what is still being sent (H25)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.queue.put(ME, queuedItem("left", START - 60_000));
  const gate = deferred();
  t.server.gates.send = gate.promise;
  await t.open();
  assert.equal(t.server.calls("send").length, 1);
  // The check 10 seconds after focus, and the return to the app, find it still on its way.
  await t.clock.advance(10_000);
  t.session.background();
  t.session.focus();
  await settle();
  assert.equal(t.server.calls("send").length, 1);
  delete t.server.gates.send;
  gate.resolve();
  await settle();
  assert.equal(t.server.calls("send").length, 1);
  assert.deepEqual(t.state().pending, []);
});

test("a refocus reads the newest page, then a since from the last read's cursor, so older loaded rows change too (H26 D1)", async () => {
  // Back from the background after an hour: a removal outside the newest page.
  const t = setup();
  t.server.seed(50);
  await t.clock.advance(180_000);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  t.session.background();
  await t.clock.advance(10 * 60_000);
  t.server.change(105, { state: "removed", body: null });
  t.server.seed(10);
  await t.clock.advance(50 * 60_000);
  t.session.focus();
  await settle();
  const removed = t.state().messages.find((m) => m.id === 105);
  assert.equal(removed?.state, "removed");
  assert.equal(removed?.body, null);
  assert.deepEqual(t.ids(), range(101, 160));
  assert.equal(t.server.calls("since").at(-1)?.[2], iso(START + 60_000));

  // Back from another screen, with earlier pages loaded.
  const u = setup();
  u.server.seed(200);
  await u.clock.advance(180_000);
  await u.open();
  await u.session.loadEarlier();
  u.latest().on.status("SUBSCRIBED");
  await settle();
  u.session.blur();
  await u.clock.advance(180_000);
  u.server.change(160, { state: "removed", body: null });
  await u.clock.advance(180_000);
  await u.open();
  assert.equal(u.state().messages.find((m) => m.id === 160)?.state, "removed");
  assert.deepEqual(u.ids(), range(151, 300));
});

test("a refocus whose since fails keeps the old cursor, so the next read still looks back far enough (H26 D1)", async () => {
  const t = setup();
  t.server.seed(60);
  await t.clock.advance(180_000);
  await t.open();
  await t.session.loadEarlier();
  assert.deepEqual(t.ids(), range(101, 160));
  t.latest().on.status("SUBSCRIBED");
  await settle();
  t.session.blur();
  await t.clock.advance(60_000);
  t.server.change(105, { state: "removed", body: null });
  // Long enough that the page's own as_of, minus the overlap, would miss it.
  await t.clock.advance(540_000);
  t.server.failOnce("since", OFFLINE);
  await t.open();
  assert.equal(t.state().messages.find((m) => m.id === 105)?.state, "sent");
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.state().messages.find((m) => m.id === 105)?.state, "removed");
});

test("a send landing during a refocus read leaves no hole: the page alone decides, and the row arrives by a read (H26 D2)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.session.blur();
  await t.clock.advance(60_000);
  t.server.seed(60);
  await t.clock.advance(300_000);
  const hold = t.server.hold("messages");
  t.session.focus();
  await settle();
  assert.equal(await t.session.send("on my way"), true);
  hold.resolve();
  await settle();
  const ids = t.ids();
  assert.deepEqual(ids, range(114, 164));
  assert.equal(t.state().hasEarlier, true);
  assert.deepEqual(t.state().pending, []);
});

test("a send landing during a gap reload stays pending until its row is on screen (H26 D3)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  await t.clock.advance(1_000);
  t.server.seed(210);
  const hold = t.server.hold("messages");
  t.latest().on.signal({ id: 313, kind: "message", state: "sent" });
  await settle();
  const from = t.states.length;
  await t.session.send("me too");
  hold.resolve();
  await settle();
  const mine = (s: ChatState) =>
    s.pending.some((p) => p.body === "me too") || s.messages.some((m) => m.body === "me too");
  assert.ok(t.states.slice(from).every(mine));
  assert.ok(t.state().messages.some((m) => m.body === "me too" && m.clientId === "client-1"));
  assert.deepEqual(t.state().pending, []);
});

test("an item left behind under 10 seconds is resent by the check 10 seconds after focus; retry takes it once stale (H26 D4)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.queue.put(ME, queuedItem("left-1", START - 4_000));
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.server.calls("send").length, 0);
  assert.equal(await t.session.retry("left-1"), false);
  await t.clock.advance(10_000);
  assert.deepEqual(t.server.calls("send"), [[SERIES, "queued left-1", "left-1"]]);
  assert.deepEqual(t.state().pending, []);

  const u = setup();
  u.server.seed(1);
  await u.queue.put(ME, queuedItem("left-2", START - 4_000));
  await u.open();
  await u.clock.advance(7_000);
  assert.equal(await u.session.retry("left-2"), true);
  await u.clock.advance(10_000);
  assert.deepEqual(u.server.calls("send").map((c) => c[2]), ["left-2"]);
});

test("an item stamped in the phone's future (a clock moved back) is stale too, and resent (H26 Q4)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.queue.put(ME, queuedItem("ahead", START + 3_600_000));
  await t.open();
  assert.deepEqual(t.server.calls("send").map((c) => c[2]), ["ahead"]);
});

test("a discard while the resend lists the queue is final: the item never comes back and is never sent (H26 D5)", async () => {
  const queue = createChatQueue(memoryDisk());
  let slow: ReturnType<typeof deferred> | null = null;
  const list = queue.list;
  const t = setup({
    queue: {
      ...queue,
      list: async (scope: string, series: string) => {
        const found = await list(scope, series);
        if (slow) await slow.promise;
        return found;
      },
    },
  });
  t.server.seed(1);
  await t.open();
  t.server.fail.send = OFFLINE;
  await t.session.send("typo");
  delete t.server.fail.send;
  slow = deferred();
  t.session.background();
  t.session.focus();
  await settle();
  await t.session.discard("client-1");
  assert.deepEqual(t.state().pending, []);
  slow.resolve();
  await settle();
  assert.deepEqual(t.state().pending, []);
  assert.deepEqual(await list(ME, SERIES), []);

  // A left-behind item, discarded while the 10-second check lists the queue.
  const queue2 = createChatQueue(memoryDisk());
  await queue2.put(ME, queuedItem("left-5", START - 4_000, { body: "never mind" }));
  let slow2: ReturnType<typeof deferred> | null = null;
  const list2 = queue2.list;
  const u = setup({
    queue: {
      ...queue2,
      list: async (scope: string, series: string) => {
        const found = await list2(scope, series);
        if (slow2) await slow2.promise;
        return found;
      },
    },
  });
  u.server.seed(1);
  await u.open();
  slow2 = deferred();
  await u.clock.advance(10_000);
  await u.session.discard("left-5");
  slow2.resolve();
  await settle();
  assert.equal(u.server.calls("send").length, 0);
  assert.deepEqual(u.state().pending, []);
  assert.deepEqual(await list2(ME, SERIES), []);
});

test("a discard of a message waiting behind a slow send takes effect when that send settles (H25)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  t.server.fail.send = OFFLINE;
  await t.session.send("first");
  await t.session.send("second");
  delete t.server.fail.send;
  const gate = deferred();
  t.server.gates.send = gate.promise;
  const first = t.session.retry("client-1");
  const second = t.session.retry("client-2");
  await settle();
  await t.session.discard("client-2");
  assert.deepEqual(t.state().pending.map((p) => p.clientId), ["client-1"]);
  delete t.server.gates.send;
  gate.resolve();
  assert.equal(await first, true);
  assert.equal(await second, false);
  await settle();
  assert.deepEqual(t.server.calls("send").map((c) => c[1]), ["first", "second", "first"]);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
  assert.deepEqual(t.state().pending, []);
});

test("a summary need lasts until a summary read succeeds (H26 D6)", async () => {
  const t = setup();
  const pinned = t.server.add({ kind: "announcement", audience: "everyone", body: "Bring hats" });
  t.server.seed(3);
  t.server.setSummary({ pinned });
  await t.clock.advance(180_000);
  await t.open();
  await t.clock.advance(5_000);
  t.server.change(pinned.id, { state: "removed", body: null });
  t.server.setSummary({ pinned: null });
  t.server.failOnce("summary", OFFLINE);
  await t.clock.advance(15_000);
  assert.equal(t.state().summary?.pinned?.id, pinned.id);
  await t.clock.advance(20_000);
  assert.equal(t.state().summary?.pinned, null);
});

test("after 'Not in this chat' a send that lands changes nothing on screen, and a new send is refused here (H26 D9, Q5)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  const gate = deferred();
  t.server.gates.send = gate.promise;
  const sent = t.session.send("hi");
  await settle();
  t.server.failOnce("since", NOT_IN_CHAT);
  t.latest().on.signal({ id: 104, kind: "message", state: "sent" });
  await settle();
  delete t.server.gates.send;
  gate.resolve();
  await sent;
  await settle();
  assert.deepEqual(t.state().messages, []);
  assert.deepEqual(t.state().pending, []);
  assert.equal(t.state().error, CHAT_COPY.notInChat);
  // The server has it, so it leaves the queue.
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
  assert.equal(await t.session.send("anyone?"), false);
  assert.equal(t.server.calls("send").length, 1);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
});

test("a chat still refusing at the next focus loses its failed messages; one that lets the person back in keeps them (H26 Q5)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.server.fail.send = NOT_IN_CHAT;
  await t.session.send("hello?");
  await settle();
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.failed), [true]);
  t.session.blur();
  t.server.fail.summary = NOT_IN_CHAT;
  await t.open();
  assert.deepEqual(await t.queue.list(ME, SERIES), []);

  const u = setup();
  u.server.seed(3);
  await u.open();
  u.server.fail.send = NOT_IN_CHAT;
  await u.session.send("hello?");
  await settle();
  delete u.server.fail.send;
  u.session.blur();
  await u.open();
  assert.deepEqual(u.state().pending.map((p) => [p.body, p.failed]), [["hello?", true]]);
});

test("failed messages over 7 days old leave the queue at any chat's focus, so a dead chat can't fill it (H26 Q6)", async () => {
  const t = setup();
  t.server.seed(1);
  for (let i = 0; i < 99; i++)
    await t.queue.put(ME, queuedItem(`old-${i}`, START - 8 * 86_400_000, { series: OTHER_SERIES, failed: true }));
  await t.queue.put(ME, queuedItem("recent", START - 6 * 86_400_000, { series: OTHER_SERIES, failed: true }));
  await t.open();
  assert.deepEqual((await t.queue.list(ME, OTHER_SERIES)).map((q) => q.clientId), ["recent"]);
  assert.equal(await t.session.send("room now"), true);
});

test("a closed chat keeps its unsent messages at focus until deleted or 7 days old, and resends none (H32 29, overruling H26 Q6)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ open: false, closesAt: iso(START - 1_000) });
  await t.queue.put(ME, queuedItem("failed-here", START - 60_000, { failed: true }));
  await t.queue.put(ME, queuedItem("left-here", START - 60_000));
  await t.queue.put(ME, queuedItem("old-here", START - 8 * 86_400_000, { failed: true }));
  await t.queue.put(ME, queuedItem("elsewhere", START - 60_000, { series: OTHER_SERIES, failed: true }));
  await t.open();
  await t.clock.advance(15_000);
  assert.equal(t.server.calls("send").length, 0);
  assert.deepEqual(t.state().pending.map((q) => q.clientId), ["failed-here", "left-here"]);
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.clientId), ["failed-here", "left-here"]);
  assert.deepEqual((await t.queue.list(ME, OTHER_SERIES)).map((q) => q.clientId), ["elsewhere"]);
  // They go only when deleted.
  await t.session.discard("failed-here");
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.clientId), ["left-here"]);
});

test("the close is timed by the server's clock, from each read's as_of: a phone an hour slow closes on time (H26 Q8)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.skewBy(3_600_000);
  // By the server, the close is in 30 minutes; by this phone, in an hour and a half.
  t.server.setSummary({ closesAt: iso(START + 3_600_000 + 1_800_000) });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.ok(Math.abs(t.state().clockOffset - 3_600_000) < 1_000);
  t.server.setSummary({ open: false });
  await t.clock.advance(1_800_000 - 1);
  assert.equal(t.server.calls("summary").length, 1);
  await t.clock.advance(1);
  assert.equal(t.server.calls("summary").length, 2);
  assert.equal(t.state().summary?.open, false);
});

test("a phone a day fast doesn't read the summary every minute: the server says the close is a day away (H26 Q9)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.skewBy(-86_400_000);
  t.server.setSummary({ closesAt: iso(START) });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.ok(Math.abs(t.state().clockOffset + 86_400_000) < 1_000);
  await t.clock.advance(3_600_000);
  assert.equal(t.server.calls("summary").length, 1);
  assert.equal(t.server.calls("since").length, 1);
});

test("the return to the app is a new start for the channel: the error count resets and a closed channel is replaced (H25 Q1)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  for (let i = 0; i < 3; i++) t.latest().on.status("CHANNEL_ERROR");
  assert.equal(t.latest().removed, true);
  t.session.background();
  t.session.focus();
  await settle();
  assert.equal(t.channels.length, 2);
  assert.equal(t.latest().removed, false);
  // The server closed it.
  t.latest().on.status("CLOSED");
  t.session.background();
  t.session.focus();
  await settle();
  assert.equal(t.channels.length, 3);
  assert.equal(t.channels[1].removed, true);
  assert.equal(t.openChannels(), 1);
  // A channel that is fine stays.
  t.latest().on.status("SUBSCRIBED");
  t.session.background();
  t.session.focus();
  await settle();
  assert.equal(t.channels.length, 3);
});

test("a read that fails while subscribed is tried again after 5 seconds, then every 20 (H26 Q11)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  t.server.add();
  t.server.failOnce("since", OFFLINE);
  t.server.failOnce("since", OFFLINE);
  t.latest().on.signal({ id: 104, kind: "message", state: "sent" });
  await settle();
  const reads = t.server.calls("since").length;
  await t.clock.advance(4_999);
  assert.equal(t.server.calls("since").length, reads);
  await t.clock.advance(1);
  assert.equal(t.server.calls("since").length, reads + 1);
  assert.equal(t.ids().includes(104), false);
  await t.clock.advance(19_999);
  assert.equal(t.server.calls("since").length, reads + 1);
  await t.clock.advance(1);
  assert.equal(t.ids().includes(104), true);
  assert.equal(t.state().error, null);
  // Recovered: nothing more.
  await t.clock.advance(120_000);
  assert.equal(t.server.calls("since").length, reads + 2);
});

test("after a gap reload the cursor doesn't look back past it: a 250-row burst with signals every 10 s reloads once (H24 (2))", async () => {
  const t = setup();
  t.server.seed(250);
  await t.clock.advance(180_000);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  await t.clock.advance(1_000);
  for (let id = 101; id <= 330; id++) t.server.change(id, { state: "deleted", body: null });
  const pages = t.server.calls("messages").length;
  for (let i = 0; i < 15; i++) {
    t.server.add();
    t.latest().on.signal({ id: 351 + i, kind: "message", state: "sent" });
    await settle();
    await t.clock.advance(10_000);
  }
  assert.equal(t.server.calls("messages").length - pages, 1);
  assert.deepEqual(t.ids().slice(-15), range(351, 365));
  // Once as_of − 2 minutes is past the reload, the cursor follows as_of again.
  const cursors = t.server.calls("since").slice(-2).map((c) => Date.parse(c[2] as string));
  assert.equal(cursors[1] - cursors[0], 10_000);
});

test("replace reads the newest page and the summary again and replaces the list (H25, for plan 3's block)", async () => {
  const t = setup();
  t.server.seed(120);
  await t.open();
  await t.session.loadEarlier();
  assert.deepEqual(t.ids(), range(101, 220));
  const summaries = t.server.calls("summary").length;
  await t.session.replace();
  assert.deepEqual(t.ids(), range(171, 220));
  assert.equal(t.state().hasEarlier, true);
  assert.equal(t.server.calls("summary").length, summaries + 1);
});

test("listenWith reports a channel that can't be made as an error, and the poll carries the chat (H25)", async () => {
  const statuses: string[] = [];
  const client = {
    getChannels: () => [],
    channel(): never {
      throw Error("WebSocket not available");
    },
    removeChannel: async () => "ok",
  };
  listenWith(client)(SERIES, { signal: () => {}, status: (s) => statuses.push(s) });
  await settle();
  // An error, and closed, so the return to the app makes a new one (H29).
  assert.deepEqual(statuses, ["CHANNEL_ERROR", "CLOSED"]);
});

test("a resent message the server already holds below the loaded rows leaves pending at once, and not after the session ended (H25)", async () => {
  const t = setup();
  t.server.add({ id: 105, clientId: "old-one", authorId: ME, body: "queued old-one" });
  t.server.seed(120);
  await t.queue.put(ME, queuedItem("old-one", START - 60_000));
  await t.open();
  assert.equal(t.state().hasEarlier, true);
  assert.deepEqual(t.server.calls("send").map((c) => c[2]), ["old-one"]);
  assert.deepEqual(t.state().pending, []);
  assert.equal(t.ids().includes(105), false);

  const u = setup();
  u.server.add({ id: 105, clientId: "old-one", authorId: ME, body: "queued old-one" });
  u.server.seed(120);
  await u.queue.put(ME, queuedItem("old-one", START - 60_000));
  const gate = deferred();
  u.server.gates.send = gate.promise;
  await u.open();
  assert.deepEqual(u.state().pending.map((p) => p.clientId), ["old-one"]);
  const before = u.snapshot();
  u.endSession();
  delete u.server.gates.send;
  gate.resolve();
  await untouched(u, before);
});

test("a summary need raised while an older summary read is in flight outlives that read's answer (H26 D6)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ closesAt: iso(START + 30_000) });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  await t.clock.advance(25_000);
  const hold = t.server.hold("summary");
  const pinned = t.server.add({ kind: "announcement", audience: "going", body: "Five minutes" });
  t.server.setSummary({ pinned });
  t.latest().on.signal({ id: pinned.id, kind: "announcement", state: "sent" });
  await settle();
  // The close comes while that read, answered as of before it, is still on its way.
  await t.clock.advance(5_000);
  t.server.setSummary({ open: false });
  hold.resolve();
  await settle();
  assert.equal(t.state().summary?.open, false);
});

// ---- Fix round 2: H29 ----

test("a round trip over 2 s doesn't move the clock estimate, and the page's call is timed on its own (H29)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.skewBy(60_000);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.state().clockOffset, 60_000);
  // A page that takes 14 s, its as_of taken as the call arrives: its midpoint would be 7 s out. The since after it
  // is as slow, so no quick read repairs the estimate.
  const slowPage = t.server.hold("messages");
  const slowSince = t.server.hold("since");
  const first = t.session.refresh();
  await settle();
  await t.clock.advance(14_000);
  slowPage.resolve();
  await settle();
  await t.clock.advance(14_000);
  slowSince.resolve();
  await first;
  await settle();
  assert.equal(t.server.calls("since").length, 2);
  assert.equal(t.state().clockOffset, 60_000);
  // A slow summary beside a quick page: the page's own trip counts.
  t.server.skewBy(30_000);
  const slowSummary = t.server.hold("summary");
  const slowSince2 = t.server.hold("since");
  const second = t.session.refresh();
  await settle();
  await t.clock.advance(14_000);
  slowSummary.resolve();
  await settle();
  await t.clock.advance(14_000);
  slowSince2.resolve();
  await second;
  await settle();
  assert.equal(t.server.calls("since").length, 3);
  assert.equal(t.state().clockOffset, 30_000);
});

test("a first read with a 14 s round trip says nothing of the server's clock; a quick one then sets it (H29)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.skewBy(60_000);
  const hold = t.server.hold("messages");
  t.session.focus();
  await settle();
  await t.clock.advance(14_000);
  hold.resolve();
  await settle();
  assert.equal(t.state().clockOffset, 0);
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.state().clockOffset, 60_000);
});

test("the estimate keeps the shortest recent round trip: a faster read improves it, a slower one doesn't replace it (H29)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.skewBy(60_000);
  const hold = t.server.hold("messages");
  t.session.focus();
  await settle();
  await t.clock.advance(1_500);
  hold.resolve();
  await settle();
  // A 1.5 s trip with the as_of taken as the call arrived: 750 ms under the truth.
  assert.equal(t.state().clockOffset, 59_250);
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.state().clockOffset, 60_000);
  const slow = t.server.hold("since");
  t.latest().on.signal({ id: 101, kind: "message", state: "sent" });
  await settle();
  await t.clock.advance(1_800);
  slow.resolve();
  await settle();
  assert.equal(t.server.calls("since").length, 2);
  assert.equal(t.state().clockOffset, 60_000);
});

test("server time never goes backwards when the estimate falls; it waits for this phone's clock to catch up (H29)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.skewBy(60_000);
  // A 1.5 s trip with the as_of taken as the answer left: 750 ms over the truth.
  const gate = deferred();
  t.server.gates.messages = gate.promise;
  t.session.focus();
  await settle();
  await t.clock.advance(1_500);
  delete t.server.gates.messages;
  gate.resolve();
  await settle();
  assert.equal(t.state().clockOffset, 60_750);
  const before = t.session.serverNow();
  assert.equal(before, START + 1_500 + 60_750);
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.state().clockOffset, 60_000);
  assert.equal(t.session.serverNow(), before);
  await t.clock.advance(500);
  assert.equal(t.session.serverNow(), before);
  await t.clock.advance(1_000);
  assert.equal(t.session.serverNow(), START + 3_000 + 60_000);
});

test("the close timer counts by the server's clock: a close 30 s off the minute tick is read at its moment (H29)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.skewBy(3_600_000);
  // By the server, 90 s away; by this phone's own clock, an hour and 90 s.
  t.server.setSummary({ closesAt: iso(START + 3_600_000 + 90_000) });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  t.server.setSummary({ open: false });
  await t.clock.advance(89_999);
  assert.equal(t.server.calls("summary").length, 1);
  await t.clock.advance(1);
  assert.equal(t.server.calls("summary").length, 2);
  assert.equal(t.state().summary?.open, false);
});

test("a send that fails after 'Not in this chat' only marks the queue: the screen stays as the refusal left it (H29, D9)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  const gate = deferred();
  t.server.gates.send = gate.promise;
  t.server.fail.send = OFFLINE;
  const sent = t.session.send("hi");
  await settle();
  t.server.failOnce("since", NOT_IN_CHAT);
  t.latest().on.signal({ id: 104, kind: "message", state: "sent" });
  await settle();
  const refused = t.state();
  assert.equal(refused.error, CHAT_COPY.notInChat);
  delete t.server.gates.send;
  gate.resolve();
  assert.equal(await sent, false);
  await settle();
  assert.equal(t.state(), refused);
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.failed), [true]);
});

test("announce is refused here while the chat refuses this person (H29)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ host: true });
  t.server.fail.summary = NOT_IN_CHAT;
  await t.open();
  assert.equal(await t.session.announce("Moved to 3pm", "everyone"), false);
  assert.equal(t.server.calls("announce").length, 0);
  assert.equal(t.state().error, CHAT_COPY.notInChat);
});

test("a channel that can't be made leaves the chat on the poll, and the return to the app tries again (H29)", async () => {
  const t = setup({ listenThrows: 2 });
  t.server.seed(1);
  await t.open();
  assert.equal(t.channels.length, 0);
  await t.clock.advance(20_000);
  assert.equal(t.server.calls("since").length, 1);
  t.session.background();
  t.session.focus();
  await settle();
  assert.equal(t.channels.length, 1);
  assert.equal(t.latest().removed, false);
});

test("a channel listenWith couldn't make is closed, so the return to the app replaces it (H29)", async () => {
  let made = 0;
  const statuses: string[] = [];
  const client = {
    getChannels: () => [] as Array<{ topic: string }>,
    channel(name: string) {
      made += 1;
      if (made === 1) throw Error("WebSocket not available");
      const channel = {
        topic: `realtime:${name}`,
        on: () => channel,
        subscribe: (status: (s: string) => void) => {
          status("SUBSCRIBED");
          return channel;
        },
      };
      return channel;
    },
    removeChannel: async () => "ok",
  };
  const listen = listenWith(client);
  const t = setup({
    listen: (series, on) =>
      listen(series, {
        signal: on.signal,
        status: (s) => {
          statuses.push(s);
          on.status(s);
        },
      }),
  });
  t.server.seed(1);
  await t.open();
  assert.equal(made, 1);
  t.session.background();
  t.session.focus();
  await settle();
  assert.equal(made, 2);
  assert.deepEqual(statuses, ["CHANNEL_ERROR", "CLOSED", "SUBSCRIBED"]);
  // Subscribed: no poll.
  const reads = t.server.calls("since").length;
  await t.clock.advance(60_000);
  assert.equal(t.server.calls("since").length, reads);
});

test("the retry after a failed read waits while the app is in the background, as the poll does (H29)", async () => {
  const t = setup();
  t.server.seed(3);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  t.server.add();
  t.server.failOnce("since", OFFLINE);
  t.latest().on.signal({ id: 104, kind: "message", state: "sent" });
  await settle();
  const reads = t.server.calls("since").length;
  t.session.background();
  await t.clock.advance(30_000);
  assert.equal(t.server.calls("since").length, reads);
});

const HOSTS_ONLY = { code: "42501", message: "Hosts only" };
const TOO_FAST = { code: "22023", message: "Too fast" };
const SLOW_DOWN = { code: "22023", message: "Slow down" };

test("an action's error clears when a later read succeeds, but not by a read that began before it (H32 28)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  // A read in flight when the send fails doesn't clear the failure it never saw.
  const held = t.server.hold("since");
  t.latest().on.signal({ id: 101, kind: "message", state: "sent" });
  await settle();
  t.server.fail.send = OFFLINE;
  assert.equal(await t.session.send("Sent while offline"), false);
  await settle();
  held.resolve();
  await settle();
  assert.equal(t.state().error, INVITE_COPY.offline);
  delete t.server.fail.send;
  // A read that began afterwards does.
  t.server.add({ authorId: LEO });
  t.latest().on.signal({ id: 102, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.state().error, null);
  // The bubble still says it wasn't sent.
  assert.deepEqual(t.state().pending.map((q) => q.failed), [true]);
});

test("clearError takes an action's error away (Cancel), and leaving the screen does too; a read's error stays (H32 36)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  t.server.failOnce("remove", OFFLINE);
  assert.equal(await t.session.remove(101), false);
  assert.equal(t.state().error, INVITE_COPY.offline);
  t.session.clearError();
  assert.equal(t.state().error, null);
  t.server.failOnce("deleteOwn", OFFLINE);
  assert.equal(await t.session.deleteOwn(101), false);
  t.session.blur();
  assert.equal(t.state().error, null);
  // A read's own error isn't an action's: Cancel leaves it.
  const r = setup();
  r.server.seed(120);
  await r.open();
  r.server.failOnce("messages", OFFLINE);
  await r.session.loadEarlier();
  assert.equal(r.state().error, INVITE_COPY.offline);
  r.session.clearError();
  assert.equal(r.state().error, INVITE_COPY.offline);
});

test("'Hosts only' reads the summary again, so Announce goes; its words stay through that read (H32 36)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ host: true });
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  // Demoted meanwhile.
  t.server.setSummary({ host: false });
  t.server.failOnce("announce", HOSTS_ONLY);
  const reads = t.server.calls("summary").length;
  assert.equal(await t.session.announce("Doors at 7", "going"), false);
  await settle();
  assert.ok(t.server.calls("summary").length > reads, "the summary is read again");
  assert.equal(t.state().summary?.host, false);
  assert.equal(t.state().error, CHAT_COPY.hostsOnly);
  // A later read clears it.
  t.server.add({ authorId: LEO });
  t.latest().on.signal({ id: 102, kind: "message", state: "sent" });
  await settle();
  assert.equal(t.state().error, null);
  // Remove refused the same way reads the summary again too.
  t.server.failOnce("remove", HOSTS_ONLY);
  const again = t.server.calls("summary").length;
  assert.equal(await t.session.remove(102), false);
  await settle();
  assert.ok(t.server.calls("summary").length > again);
  assert.equal(t.state().error, CHAT_COPY.hostsOnly);
});

test("an announcement refused as 'Too fast' says the limit is one a minute; 'Slow down' keeps the messages line (H32 Q35)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ host: true });
  await t.open();
  t.server.failOnce("announce", TOO_FAST);
  assert.equal(await t.session.announce("Doors at 7", "going"), false);
  assert.equal(t.state().error, CHAT_COPY.announceTooFast);
  t.server.failOnce("announce", SLOW_DOWN);
  assert.equal(await t.session.announce("Doors at 7", "going"), false);
  assert.equal(t.state().error, CHAT_COPY.slowDown);
  // A message refused 'Slow down' is unchanged.
  t.server.failOnce("send", SLOW_DOWN);
  assert.equal(await t.session.send("one more"), false);
  await settle();
  assert.equal(t.state().error, CHAT_COPY.slowDown);
});

test("a failed earlier page says so (earlierFailed) until a page loads, which clears the line too (H32 24)", async () => {
  const t = setup();
  t.server.seed(120);
  await t.open();
  assert.equal(t.state().earlierFailed, false);
  t.server.failOnce("messages", OFFLINE);
  await t.session.loadEarlier();
  assert.equal(t.state().earlierFailed, true);
  assert.equal(t.state().error, INVITE_COPY.offline);
  assert.deepEqual(t.ids(), range(171, 220));
  await t.session.loadEarlier();
  assert.equal(t.state().earlierFailed, false);
  assert.equal(t.state().error, null);
  assert.deepEqual(t.ids(), range(101, 220));
});

test("nothing is sent or announced without a visible character, by the server's rule (H32 30)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ host: true });
  await t.open();
  for (const blank of ["\u2800\u2800", "\u3164", "\u200b", "   ", "\n\n"]) {
    assert.equal(await t.session.send(blank), false, JSON.stringify(blank));
    assert.equal(await t.session.announce(blank, "going"), false, JSON.stringify(blank));
  }
  await settle();
  assert.equal(t.server.calls("send").length, 0);
  assert.equal(t.server.calls("announce").length, 0);
  assert.deepEqual(t.state().pending, []);
});

test("a closed chat's unsent messages, failed or not, expire after 7 days (H35)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ open: false, closesAt: iso(START - 8 * 86_400_000) });
  await t.queue.put(ME, queuedItem("old-left", START - 8 * 86_400_000));
  await t.queue.put(ME, queuedItem("old-failed", START - 8 * 86_400_000, { failed: true }));
  await t.queue.put(ME, queuedItem("new-left", START - 60_000));
  // Another chat's is that chat's to judge when it is opened.
  await t.queue.put(ME, queuedItem("other-left", START - 8 * 86_400_000, { series: OTHER_SERIES }));
  await t.open();
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => q.clientId), ["new-left"]);
  assert.deepEqual(t.state().pending.map((q) => q.clientId), ["new-left"]);
  assert.deepEqual((await t.queue.list(ME, OTHER_SERIES)).map((q) => q.clientId), ["other-left"]);
  assert.equal(t.server.calls("send").length, 0);
});

// The final review's fix wave (H41).
test("a message queued behind another still goes out once the screen is left; nothing more reaches the screen (H41 I1)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  // A slow connection: the first is on its way when the second is written, and Back is pressed.
  const slow = t.server.hold("send");
  const first = t.session.send("On my way");
  const second = t.session.send("Be there at 8");
  await settle();
  assert.deepEqual(t.server.calls("send").map((c) => c[1]), ["On my way"]);
  // useChat's cleanup: blur, then dispose.
  t.session.blur();
  t.session.dispose();
  const left = t.state();
  const reads = t.server.calls("since").length + t.server.calls("messages").length + t.server.calls("summary").length;
  slow.resolve();
  assert.equal(await first, true);
  assert.equal(await second, true);
  await t.clock.advance(60_000);
  assert.deepEqual(t.server.calls("send"), [
    [SERIES, "On my way", "client-1"],
    [SERIES, "Be there at 8", "client-2"],
  ]);
  assert.deepEqual(await t.queue.list(ME, SERIES), []);
  // The screen is gone: nothing is applied, read, listened to or timed.
  assert.equal(t.state(), left);
  assert.equal(t.server.calls("since").length + t.server.calls("messages").length + t.server.calls("summary").length, reads);
  assert.equal(t.openChannels(), 0);
  assert.equal(t.clock.pending(), 0);

  // The account's session ending is different: what hasn't left yet stays (H25).
  const u = setup();
  u.server.seed(1);
  await u.open();
  const held = u.server.hold("send");
  const one = u.session.send("On my way");
  const two = u.session.send("Be there at 8");
  await settle();
  u.endSession();
  held.resolve();
  await one;
  assert.equal(await two, false);
  await u.clock.advance(60_000);
  assert.deepEqual(u.server.calls("send").map((c) => c[1]), ["On my way"]);
});

test("a message not sent because the chat refuses the person is marked failed, as the refused one is; let back in, nothing goes without a tap (H41 I2a)", async () => {
  const t = setup();
  t.server.seed(1);
  await t.open();
  // Removed from the resbite, and two messages typed quickly.
  t.server.fail.send = NOT_IN_CHAT;
  const first = t.session.send("first, typed as I was removed");
  const second = t.session.send("second: on my way, 5 min!");
  assert.equal(await first, false);
  assert.equal(await second, false);
  await settle();
  // The first was refused; nothing more goes to the server while the chat refuses this person (H26 D9).
  assert.equal(t.server.calls("send").length, 1);
  assert.equal(t.state().error, CHAT_COPY.notInChat);
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => [q.body, q.failed]), [
    ["first, typed as I was removed", true],
    ["second: on my way, 5 min!", true],
  ]);
  // Five days later they're invited again, answer Going and open the chat.
  t.session.blur();
  delete t.server.fail.send;
  await t.clock.advance(5 * 86_400_000);
  await t.open();
  await t.clock.advance(15_000);
  assert.equal(t.server.calls("send").length, 1);
  assert.deepEqual(t.state().pending.map((p) => [p.body, p.failed]), [
    ["first, typed as I was removed", true],
    ["second: on my way, 5 min!", true],
  ]);
  // A tap sends it, with its own client id.
  assert.equal(await t.session.retry("client-2"), true);
  assert.deepEqual(t.server.calls("send").at(-1), [SERIES, "second: on my way, 5 min!", "client-2"]);
});

test("nothing is resent by itself over an hour from when it was written, either way: it waits as not sent for a tap (H41 I2b)", async () => {
  const t = setup();
  t.server.seed(1);
  // Left in the queue by an app killed mid-send, never failed; the app is opened again now.
  await t.queue.put(ME, queuedItem("days", START - 6 * 86_400_000, { body: "running late, start without me" }));
  await t.queue.put(ME, queuedItem("minutes", START - 2 * 60_000));
  await t.queue.put(ME, queuedItem("hour", START - 3_600_000));
  await t.queue.put(ME, queuedItem("over", START - 3_600_001));
  // A clock moved back by two hours: as far the other way.
  await t.queue.put(ME, queuedItem("ahead", START + 7_200_000));
  await t.open();
  await t.clock.advance(15_000);
  // Under the hour, K-S7's resend is as it was.
  assert.deepEqual(t.server.calls("send").map((c) => c[2]), ["minutes", "hour"]);
  assert.deepEqual(t.state().pending.map((p) => [p.clientId, p.failed]), [
    ["days", true],
    ["over", true],
    ["ahead", true],
  ]);
  assert.deepEqual((await t.queue.list(ME, SERIES)).map((q) => [q.clientId, q.failed]), [
    ["days", true],
    ["over", true],
    ["ahead", true],
  ]);
  // The return to the app doesn't send them either; a tap does.
  t.session.background();
  t.session.focus();
  await t.clock.advance(15_000);
  assert.equal(t.server.calls("send").length, 2);
  assert.equal(await t.session.retry("days"), true);
  assert.deepEqual(t.server.calls("send").at(-1), [SERIES, "running late, start without me", "days"]);
});

test("a phone 30 minutes fast that asks the time before the first read reads the server's time once a read gives it (H41 I3)", async () => {
  const t = setup();
  t.server.seed(1);
  const FAST = 30 * 60_000;
  t.server.skewBy(-FAST);
  // By the server, the close is an hour away; by this phone's own clock, half an hour.
  t.server.setSummary({ closesAt: iso(START - FAST + 3_600_000) });
  // The screen's first render and its minute tick ask before any read has said what the server's clock reads.
  assert.equal(t.session.serverNow(), START);
  await t.open();
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.session.serverNow(), START - FAST);
  assert.match(closingLine(t.state().summary?.closesAt ?? null, t.session.serverNow(), "Europe/London") ?? "", /, in 1 hour\. /);
  // The close comes at the server's hour, not half an hour early.
  t.server.setSummary({ open: false });
  await t.clock.advance(3_600_000 - 1);
  assert.equal(t.server.calls("summary").length, 1);
  await t.clock.advance(1);
  assert.equal(t.server.calls("summary").length, 2);
  assert.equal(t.state().summary?.open, false);
});

test("a lone surrogate reaches the server as U+FFFD and a NUL not at all, in a message and an announcement (H41 m2)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ host: true });
  await t.open();
  assert.equal(await t.session.send("on my way \ud83d\u0000soon \ude00"), true);
  assert.deepEqual(t.server.calls("send"), [[SERIES, "on my way \ufffdsoon \ufffd", "client-1"]]);
  assert.equal(await t.session.announce("Doors\u0000 at 7 \udbff", "going"), true);
  assert.deepEqual(t.server.calls("announce").map((c) => c[1]), ["Doors at 7 \ufffd"]);
  // Nothing visible once a NUL goes is nothing to send; a pair stays as it is.
  assert.equal(await t.session.send("\u0000\u0000"), false);
  assert.equal(await t.session.send("🎉"), true);
  assert.deepEqual(t.server.calls("send").map((c) => c[1]), ["on my way \ufffdsoon \ufffd", "🎉"]);
});

test("blur and dispose leave no timer behind: the poll, the tick, the close, the stale check and the retry all go (H41 m4)", async () => {
  const t = setup();
  t.server.seed(1);
  t.server.setSummary({ closesAt: iso(START + 3_600_000) });
  await t.open();
  // A read that fails while subscribed arms the retry beside the poll, the tick, the close and the stale check.
  t.server.failOnce("since", OFFLINE);
  t.latest().on.status("SUBSCRIBED");
  await settle();
  assert.equal(t.clock.pending(), 5);
  t.session.blur();
  assert.equal(t.clock.pending(), 0);
  await t.clock.advance(3_600_000);
  assert.equal(t.clock.pending(), 0);
  // Disposed while still focused, as when another account takes the screen.
  await t.open();
  assert.ok(t.clock.pending() > 0);
  t.session.dispose();
  assert.equal(t.clock.pending(), 0);
  await t.clock.advance(3_600_000);
  assert.equal(t.clock.pending(), 0);
});
