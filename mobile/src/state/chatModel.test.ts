import test from "node:test";
import assert from "node:assert/strict";
import {
  RESEND_LIMIT_MS,
  SEEN_LIMIT,
  changedAfter,
  createCoalescer,
  merge,
  needsSummary,
  newestId,
  oldestId,
  remember,
  replaceOrMerge,
  shownMessages,
  staleUnsent,
  tooOldToResend,
  withEndedLine,
  withPending,
  type PendingMessage,
} from "./chatModel";
import type { ChatMessage, ChatSummary } from "../services/chat";
import type { QueuedMessage } from "../services/chatQueue";

const SERIES = "0b000000-0000-4000-8000-000000000001";
const ANA = "0a000000-0000-4000-8000-0000000000a1";

const row = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: `message ${id}`,
  state: "sent",
  authorId: ANA,
  createdAt: "2026-11-11T12:00:00.000Z",
  updatedAt: "2026-11-11T12:00:00.000Z",
  clientId: null,
  ...over,
});
const ids = (list: Array<{ id?: number; kind?: string }>) => list.map((m) => ("id" in m ? m.id : m.kind));

const queued = (clientId: string, over: Partial<QueuedMessage> = {}): QueuedMessage => ({
  clientId,
  series: SERIES,
  body: `unsent ${clientId}`,
  createdAt: "2026-11-11T12:00:00.000Z",
  failed: false,
  ...over,
});

const summary = (over: Partial<ChatSummary> = {}): ChatSummary => ({
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
  names: {},
  mutedChat: false,
  mutedResbite: false,
  lastReadId: null,
  unread: false,
  messageCount: 0,
  rulesAccepted: true,
  ...over,
});

test("merge keeps the rows by id, ascending, and an incoming row replaces a loaded one when it is not older (K-B1)", () => {
  const loaded = [row(10), row(12), row(14)];
  const edited = row(12, { body: "changed", updatedAt: "2026-11-11T12:01:00.000Z" });
  const merged = merge(loaded, [row(16), edited, row(15)]);
  assert.deepEqual(ids(merged), [10, 12, 14, 15, 16]);
  assert.equal(merged[1].body, "changed");
  // The same time is not older: the incoming copy wins.
  const same = merge(loaded, [row(14, { body: "again" })]);
  assert.equal(same[2].body, "again");
  // An older copy (an answer that left before a newer one) leaves the loaded row.
  const older = merge([edited], [row(12, { body: "stale", updatedAt: "2026-11-11T11:59:00.000Z" })]);
  assert.equal(older[0].body, "changed");
  // The rows given are never changed in place.
  assert.deepEqual(ids(loaded), [10, 12, 14]);
  assert.equal(loaded[1].body, "message 12");
});

test("merge treats deleted and removed as final: a stale sent copy never brings the body back, and a removal blanks it (K-B1)", () => {
  const removedAt = "2026-11-11T12:05:00.000Z";
  const loaded = [row(10), row(11), row(12)];
  const removed = merge(loaded, [row(11, { state: "removed", body: null, updatedAt: removedAt })]);
  assert.equal(removed[1].state, "removed");
  assert.equal(removed[1].body, null);
  // A removal that reached the app with its text still on it shows none.
  const leaky = merge(loaded, [row(12, { state: "removed", body: "abusive", updatedAt: removedAt })]);
  assert.equal(leaky[2].body, null);
  // A sent copy, even one stamped later (a clock or an answer out of order), never replaces a final row.
  for (const terminal of ["deleted", "removed"] as const) {
    const held = [row(11, { state: terminal, body: null, updatedAt: removedAt })];
    for (const updatedAt of ["2026-11-11T12:00:00.000Z", removedAt, "2026-11-11T12:09:00.000Z"]) {
      const after = merge(held, [row(11, { body: "message 11", updatedAt })]);
      assert.equal(after[0].state, terminal);
      assert.equal(after[0].body, null);
    }
  }
  // A final row may still move to the other final state when that copy is newer (a deleted account's removed row).
  const deleted = merge([row(11, { state: "removed", body: null, updatedAt: removedAt })], [
    row(11, { state: "deleted", body: null, authorId: null, updatedAt: "2026-11-11T12:09:00.000Z" }),
  ]);
  assert.equal(deleted[0].state, "deleted");
  assert.equal(deleted[0].authorId, null);
});

test("merge ignores a row older than the oldest loaded id, and a late commit below the newest takes its place (K-B1)", () => {
  const loaded = [row(20), row(30), row(40)];
  // Not on screen: loadEarlier reads it fresh.
  assert.deepEqual(ids(merge(loaded, [row(19), row(5)])), [20, 30, 40]);
  // A line whose transaction committed after a higher id was read.
  assert.deepEqual(ids(merge(loaded, [row(35, { kind: "system", event: "joined", body: null })])), [20, 30, 35, 40]);
  assert.deepEqual(ids(merge(loaded, [row(41), row(25)])), [20, 25, 30, 40, 41]);
  // With nothing loaded, every row is taken.
  assert.deepEqual(ids(merge([], [row(3), row(1), row(2)])), [1, 2, 3]);
  // With nothing earlier to load (the whole chat is held), a late commit below the oldest is kept too.
  assert.deepEqual(ids(merge(loaded, [row(19)], true)), [19, 20, 30, 40]);
});

test("replaceOrMerge replaces the list when the newest page doesn't reach the cached newest id, and merges when it does (K-B1)", () => {
  const cached = [row(10), row(11), row(12, { state: "removed", body: null })];
  // A gap: the page starts above everything held, so what lies between was never read.
  assert.deepEqual(ids(replaceOrMerge(cached, [row(50), row(51)])), [50, 51]);
  // The page reaches the cached newest: no gap, so earlier pages stay and final rows stay final.
  const merged = replaceOrMerge(cached, [row(12), row(13), row(14)]);
  assert.deepEqual(ids(merged), [10, 11, 12, 13, 14]);
  assert.equal(merged[2].state, "removed");
  assert.equal(merged[2].body, null);
  // A page that starts at the cached newest id reaches it.
  assert.deepEqual(ids(replaceOrMerge(cached, [row(12), row(60)])), [10, 11, 12, 60]);
  // The newest page is one stretch, so its rows below the cached oldest are kept.
  assert.deepEqual(ids(replaceOrMerge(cached, [row(8), row(9), row(10), row(13)])), [8, 9, 10, 11, 12, 13]);
  // Nothing cached: the page is the list.
  assert.deepEqual(ids(replaceOrMerge([], [row(2), row(1)])), [1, 2]);
});

test("changedAfter is the read's as_of minus two minutes, as ISO text (K-B1)", () => {
  assert.equal(changedAfter("2026-11-11T12:00:00.000Z"), "2026-11-11T11:58:00.000Z");
  // As the server writes it: microseconds and an offset.
  assert.equal(changedAfter("2026-11-11T12:00:00.123456+00:00"), "2026-11-11T11:58:00.123Z");
  assert.equal(changedAfter("2026-11-11T13:00:00+01:00"), "2026-11-11T11:58:00.000Z");
});

test("needsSummary is true for an announcement, a system line and any state but sent (K-S12, H24 (1))", () => {
  assert.equal(needsSummary({ kind: "announcement", state: "sent" }), true);
  assert.equal(needsSummary({ kind: "message", state: "removed" }), true);
  assert.equal(needsSummary({ kind: "message", state: "deleted" }), true);
  assert.equal(needsSummary({ kind: "message", state: "sent" }), false);
  // A joined, changed or cancelled line moves the going count, the close or the closed card.
  assert.equal(needsSummary({ kind: "system", state: "sent" }), true);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
const flush = () => new Promise<void>((r) => setImmediate(r));

test("the coalescer runs one at a time, with at most one queued; a trigger while one is queued is dropped (K-N6)", async () => {
  const gates: Array<ReturnType<typeof deferred>> = [];
  let running = 0,
    most = 0,
    runs = 0;
  const reads = createCoalescer(async () => {
    runs++;
    running++;
    most = Math.max(most, running);
    const gate = deferred();
    gates.push(gate);
    await gate.promise;
    running--;
  });
  const first = reads.trigger();
  const second = reads.trigger();
  const third = reads.trigger();
  reads.trigger();
  await flush();
  assert.equal(runs, 1);
  gates[0].resolve();
  await first;
  await flush();
  // The queued run started once the first ended; the burst behind it was dropped into it.
  assert.equal(runs, 2);
  let settled = false;
  void third.then(() => (settled = true));
  await flush();
  assert.equal(settled, false);
  gates[1].resolve();
  await Promise.all([second, third]);
  assert.equal(runs, 2);
  assert.equal(most, 1);
  // Once idle, the next trigger runs at once.
  const fourth = reads.trigger();
  await flush();
  assert.equal(runs, 3);
  gates[2].resolve();
  await fourth;
});

test("the coalescer keeps going after a run that throws", async () => {
  let runs = 0;
  const reads = createCoalescer(async () => {
    runs++;
    if (runs === 1) throw Error("offline");
  });
  const first = reads.trigger();
  const second = reads.trigger();
  await Promise.all([first, second]);
  assert.equal(runs, 2);
  await reads.trigger();
  assert.equal(runs, 3);
});

test("staleUnsent takes what isn't failed and is older than 10 seconds: it leaves a 9-second item and takes an 11-second one (K-S7)", () => {
  const now = Date.parse("2026-11-11T12:00:20.000Z");
  const nine = queued("c9", { createdAt: "2026-11-11T12:00:11.000Z" });
  const ten = queued("c10", { createdAt: "2026-11-11T12:00:10.000Z" });
  const eleven = queued("c11", { createdAt: "2026-11-11T12:00:09.000Z" });
  const failed = queued("cf", { createdAt: "2026-11-11T11:00:00.000Z", failed: true });
  assert.deepEqual(staleUnsent([nine, ten, eleven, failed], now), [eleven]);
  // A time that can't be read can't be recent.
  const unreadable = queued("cx", { createdAt: "yesterday" });
  assert.deepEqual(staleUnsent([unreadable], now), [unreadable]);
});

test("withPending shows the queued items last; a confirmed one disappears and a failed one stays with failed: true (K-S7)", () => {
  const messages = [row(10), row(11, { clientId: "c1" })];
  const shown = withPending(messages, [queued("c1"), queued("c2", { failed: true }), queued("c3")]);
  assert.deepEqual(ids(shown), [10, 11, "pending", "pending"]);
  const pending = shown.slice(2) as PendingMessage[];
  assert.deepEqual(pending, [
    { kind: "pending", clientId: "c2", body: "unsent c2", createdAt: "2026-11-11T12:00:00.000Z", failed: true },
    { kind: "pending", clientId: "c3", body: "unsent c3", createdAt: "2026-11-11T12:00:00.000Z", failed: false },
  ]);
  assert.deepEqual(withPending(messages, []), messages);
});

test("withEndedLine sits between the rows before and after a one-off's end (K-S16, Decision 8)", () => {
  const end = "2026-11-14T15:00:00.000Z";
  const now = Date.parse("2026-11-14T18:00:00.000Z");
  const before = row(10, { createdAt: "2026-11-14T14:00:00.000Z" });
  const atEnd = row(11, { createdAt: end });
  const after = row(12, { createdAt: "2026-11-14T16:00:00.000Z" });
  const ended = { kind: "ended", at: end };
  assert.deepEqual(withEndedLine([before, atEnd, after], summary(), false, now), [before, atEnd, ended, after]);
  // A pending item is written now, after the end.
  const unsent: PendingMessage = { kind: "pending", clientId: "c1", body: "x", createdAt: "2026-11-14T13:00:00.000Z", failed: false };
  assert.deepEqual(withEndedLine([before, unsent], summary(), false, now), [before, ended, unsent]);
  // With no end time, the start is the end (planEnd).
  const startOnly = summary({ endsAt: null });
  const early = row(9, { createdAt: "2026-11-14T11:00:00.000Z" });
  assert.deepEqual(withEndedLine([early, before], startOnly, false, now), [
    early,
    { kind: "ended", at: "2026-11-14T12:00:00.000Z" },
    before,
  ]);
  // Every row after the end: the line comes first, when nothing earlier is left to load or the oldest is before it.
  assert.deepEqual(withEndedLine([after], summary(), false, now), [ended, after]);
  assert.deepEqual(withEndedLine([after], summary(), true, now), [after]);
  assert.deepEqual(withEndedLine([before, after], summary(), true, now), [before, ended, after]);
  assert.deepEqual(withEndedLine([], summary(), false, now), [ended]);
});

test("withEndedLine is absent before the end, on a group, and on a cancelled one-off whose end has passed (NOTE 5)", () => {
  const items = [row(10, { createdAt: "2026-11-14T14:00:00.000Z" }), row(11, { createdAt: "2026-11-14T16:00:00.000Z" })];
  const now = Date.parse("2026-11-14T18:00:00.000Z");
  assert.deepEqual(withEndedLine(items, summary(), false, Date.parse("2026-11-14T14:59:59.000Z")), items);
  assert.deepEqual(withEndedLine(items, summary({ isGroup: true, repeatWeeks: 1 }), false, now), items);
  assert.deepEqual(withEndedLine(items, summary({ status: "cancelled", closesAt: null, open: false }), false, now), items);
  assert.deepEqual(withEndedLine(items, null, false, now), items);
  assert.deepEqual(withEndedLine(items, summary({ startsAt: "", endsAt: null }), false, now), items);
});

test("newestId and oldestId read the loaded ids, null when none is loaded", () => {
  assert.equal(newestId([row(3), row(9), row(5)]), 9);
  assert.equal(oldestId([row(3), row(9), row(5)]), 3);
  assert.equal(newestId([]), null);
  assert.equal(oldestId([]), null);
});

test("server times with microseconds are read even by an engine that takes only milliseconds (the cursor and the order, K-B1)", () => {
  const parse = Date.parse;
  // A stricter Date.parse, as a JS engine may be: more than three fractional digits is no time at all.
  Date.parse = (s: string) => (/\.\d{4,}/.test(s) ? NaN : parse(s));
  try {
    assert.equal(changedAfter("2026-11-11T12:00:00.123456+00:00"), "2026-11-11T11:58:00.123Z");
    const held = [row(11, { state: "sent", updatedAt: "2026-11-11T12:05:00.654321+00:00", body: "newer" })];
    const stale = merge(held, [row(11, { updatedAt: "2026-11-11T12:00:00.123456+00:00", body: "older" })]);
    assert.equal(stale[0].body, "newer");
    const end = "2026-11-14T15:00:00.000000+00:00";
    const items = [row(1, { createdAt: "2026-11-14T14:00:00.500000+00:00" }), row(2, { createdAt: "2026-11-14T16:00:00.250000+00:00" })];
    assert.deepEqual(
      ids(withEndedLine(items, summary({ endsAt: end }), false, parse("2026-11-14T18:00:00.000Z"))),
      [1, "ended", 2],
    );
  } finally {
    Date.parse = parse;
  }
});

test("an unknown state is final: no sent copy brings its body back, even one stamped the same instant (H26 Q2)", () => {
  const hidden = row(1, { state: "hidden" as ChatMessage["state"], body: "secret", updatedAt: "2026-11-11T12:00:05.000Z" });
  const held = merge([], [hidden]);
  assert.equal(held[0].body, null);
  for (const updatedAt of ["2026-11-11T12:00:00.000Z", "2026-11-11T12:00:05.000Z", "2026-11-11T12:09:00.000Z"]) {
    const after = merge(held, [row(1, { updatedAt })]);
    assert.equal(after[0].state, "hidden");
    assert.equal(after[0].body, null);
  }
  // It may still become removed or deleted.
  assert.equal(merge(held, [row(1, { state: "removed", body: null, updatedAt: "2026-11-11T12:09:00.000Z" })])[0].state, "removed");
});

test("staleUnsent counts the distance either way, so a clock moved back doesn't hide an item (H26 Q4)", () => {
  const now = Date.parse("2026-11-11T12:00:00.000Z");
  const ahead = queued("ahead", { createdAt: "2026-11-11T12:57:00.000Z" });
  const nearAhead = queued("near", { createdAt: "2026-11-11T12:00:09.000Z" });
  assert.deepEqual(staleUnsent([ahead, nearAhead], now), [ahead]);
});

test("tooOldToResend: over an hour from now either way, or a time that can't be read, waits for a tap (H41 I2b)", () => {
  const now = Date.parse("2026-11-11T12:00:00.000Z");
  assert.equal(RESEND_LIMIT_MS, 3_600_000);
  const at = (createdAt: string) => tooOldToResend(queued("q", { createdAt }), now);
  assert.equal(at("2026-11-11T11:58:00.000Z"), false);
  assert.equal(at("2026-11-11T11:00:00.000Z"), false);
  assert.equal(at("2026-11-11T10:59:59.999Z"), true);
  assert.equal(at("2026-11-05T12:00:00.000Z"), true);
  // A clock moved back: the same hour the other way.
  assert.equal(at("2026-11-11T13:00:00.000Z"), false);
  assert.equal(at("2026-11-11T13:00:00.001Z"), true);
  // A time that can't be read can't be within the hour.
  assert.equal(at("yesterday"), true);
});

test("remember keeps at most SEEN_LIMIT entries, letting the oldest go first (H25)", () => {
  const seen = new Map<number, string>();
  for (let id = 1; id <= SEEN_LIMIT + 5; id++) remember(seen, id, `t${id}`);
  assert.equal(seen.size, SEEN_LIMIT);
  assert.equal(seen.has(5), false);
  assert.equal(seen.get(6), "t6");
  // Seen again, an entry is the newest.
  remember(seen, 6, "t6b");
  remember(seen, SEEN_LIMIT + 6, "x");
  assert.equal(seen.get(6), "t6b");
  assert.equal(seen.has(7), false);
});

// Plan 2 (groups).
test("shownMessages drops a system line whose state is deleted, and nothing else (Decision 6)", () => {
  const joined = row(1, { kind: "system", event: "joined", payload: { actor: ANA, user: ANA }, body: null, authorId: null });
  const cantGo = row(2, { kind: "system", event: "cant_go", payload: { actor: ANA, user: ANA }, body: null, authorId: null, state: "deleted" });
  const said = row(3);
  assert.deepEqual(shownMessages([joined, cantGo, said]), [joined, said]);
  // A person's deleted or removed message stays: it shows "Message deleted" (CH-P13).
  const deleted = row(4, { state: "deleted", body: null });
  const removed = row(5, { state: "removed", body: null });
  assert.deepEqual(shownMessages([deleted, removed]), [deleted, removed]);
  // With nothing to drop, the list itself comes back, so the screen's memo holds.
  const list = [joined, said];
  assert.equal(shownMessages(list), list);
});

test("withEndedLine on a group: only once it has stopped, at its current occurrence's end, never after a cancel (K-S16)", () => {
  const end = "2026-11-14T15:00:00.000Z";
  const now = Date.parse("2026-11-14T18:00:00.000Z");
  const before = row(10, { createdAt: "2026-11-14T14:00:00.000Z" });
  const after = row(12, { createdAt: "2026-11-14T16:00:00.000Z" });
  const ended = { kind: "ended", at: end };
  const stopped = summary({ isGroup: true, stopped: true, repeatWeeks: null });
  assert.deepEqual(withEndedLine([before, after], stopped, false, now), [before, ended, after]);
  // The built placement rules hold: a row before the end must be loaded, or nothing earlier left to load.
  assert.deepEqual(withEndedLine([after], stopped, true, now), [after]);
  assert.deepEqual(withEndedLine([after], stopped, false, now), [ended, after]);
  // Not before its end.
  assert.deepEqual(withEndedLine([before], stopped, false, Date.parse("2026-11-14T14:30:00.000Z")), [before]);
  // A running group: the roll writes its ended line (G-S6), so nothing is computed.
  assert.deepEqual(withEndedLine([before, after], summary({ isGroup: true, repeatWeeks: 1 }), false, now), [before, after]);
  // A stopped group whose last one was cancelled: no ended line (G-S2).
  assert.deepEqual(withEndedLine([before, after], { ...stopped, status: "cancelled" }, false, now), [before, after]);
});
