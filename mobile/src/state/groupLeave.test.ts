import test from "node:test";
import assert from "node:assert/strict";
import { createGroupLeave, createLeftGroups } from "./groupLeave";

const SERIES = "5e000000-0000-4000-8000-000000000001";
const OTHER = "5e000000-0000-4000-8000-000000000002";
const ME = "0a000000-0000-4000-8000-000000000001";
const SOMEONE_ELSE = "0a000000-0000-4000-8000-000000000002";
const scope = { userId: ME, preview: false };
const notInGroup = { code: "42501", message: "Not in this group" };
const offline = new TypeError("Failed to fetch");

/** A leave wired to fakes: what was called, in order, and the focused chat as the chat screen would hold it. */
function setup(over: { leave?: (series: string) => Promise<void>; onScreen?: () => string | null; now?: () => number } = {}) {
  const calls: string[] = [];
  const left = createLeftGroups();
  let focused: string | null = SERIES;
  const { leave, finish } = createGroupLeave({
    leave: over.leave ?? (async (series) => void calls.push(`leave ${series}`)),
    sync: async (s) => void calls.push(`sync ${s.userId}`),
    onScreen: over.onScreen ?? (() => SERIES),
    toPlans: () => void calls.push("toPlans"),
    clearFocus: (series) => {
      if (focused === series) focused = null;
    },
    left,
    now: over.now,
  });
  return { calls, left, leave, finish, focused: () => focused };
}

test("a leave that goes through re-syncs the phone's reminders, then lands on My resbites from the group's screen (I2, I10)", async () => {
  const { calls, left, leave } = setup();
  assert.deepEqual(await leave(SERIES, scope), { left: true });
  assert.deepEqual(calls, [`leave ${SERIES}`, `sync ${ME}`, "toPlans"]);
  assert.equal(left.hidden(SERIES, ME), true);
});

test("after a leave the chat no longer counts as the focused one, so its pushes aren't held back (GR6 M10, H36)", async () => {
  const { leave, focused } = setup();
  assert.equal(focused(), SERIES);
  await leave(SERIES, scope);
  assert.equal(focused(), null);
});

test("'Not in this group' after its own attempt is done: the first answer was lost, the leave went through (GR4 M-2)", async () => {
  let attempt = 0;
  const { calls, left, leave } = setup({
    leave: async () => {
      attempt++;
      throw attempt === 1 ? offline : notInGroup;
    },
  });
  const first = await leave(SERIES, scope);
  assert.equal(first?.left, false);
  assert.equal(first && !first.left ? first.error : null, "Check your connection and try again.");
  assert.deepEqual(calls, [], "a failure syncs nothing and stays where it is");
  assert.equal(left.hidden(SERIES, ME), false);
  assert.deepEqual(await leave(SERIES, scope), { left: true });
  assert.deepEqual(calls, [`sync ${ME}`, "toPlans"]);
  assert.equal(left.hidden(SERIES, ME), true);
});

test("after an attempt whose answer was lost, the chat's refusal finishes the leave on the phone (GR6 M5)", async () => {
  const { calls, left, leave, finish } = setup({ leave: async () => Promise.reject(offline) });
  // Nothing attempted for this group: a refusal is just a refusal.
  assert.equal(finish(SERIES, scope), false);
  assert.deepEqual(calls, []);
  await leave(SERIES, scope);
  assert.equal(finish(OTHER, scope), false, "another group's refusal finishes nothing");
  assert.equal(finish(SERIES, scope), true);
  assert.deepEqual(calls, [`sync ${ME}`, "toPlans"]);
  assert.equal(left.hidden(SERIES, ME), true);
  // Once finished, it isn't finished twice.
  assert.equal(finish(SERIES, scope), false);
});

test("a definite refusal isn't an attempt that may have gone through: the chat's refusal finishes nothing (GR6 M5)", async () => {
  const { calls, leave, finish } = setup({ leave: async () => Promise.reject({ code: "42501", message: "Hosts can't leave" }) });
  assert.deepEqual(await leave(SERIES, scope), { left: false, error: "To leave, step down first: change your reply to Can’t go." });
  assert.equal(finish(SERIES, scope), false);
  assert.deepEqual(calls, []);
});

test("a leave that ends after a sign-out or another account's sign-in does nothing on the phone (GR6 M1)", async () => {
  const { calls, left, leave } = setup();
  // The session it started on is gone by the time the server answers.
  const result = await leave(SERIES, scope, () => false);
  assert.deepEqual(result, { left: true }, "the server took it");
  assert.deepEqual(calls, [`leave ${SERIES}`], "no reminder sync, no note, no landing");
  assert.equal(left.hidden(SERIES, ME), false);
  // And a leave still current does all of it.
  assert.deepEqual(await leave(SERIES, scope, () => true), { left: true });
  assert.deepEqual(calls.slice(1), [`leave ${SERIES}`, `sync ${ME}`, "toPlans"]);
});

test("any other refusal is worded and changes nothing", async () => {
  const { calls, leave } = setup({ leave: async () => Promise.reject({ code: "42501", message: "Hosts can't leave" }) });
  assert.deepEqual(await leave(SERIES, scope), { left: false, error: "To leave, step down first: change your reply to Can’t go." });
  assert.deepEqual(calls, []);
});

test("a leave that ends after the person went elsewhere lands on My resbites only from that group's chat or page (UI Q4)", async () => {
  for (const [screen, lands] of [
    [SERIES, true],
    [OTHER, false],
    [null, false],
  ] as const) {
    const { calls, left, leave } = setup({ onScreen: () => screen });
    assert.deepEqual(await leave(SERIES, scope), { left: true });
    assert.equal(calls.includes("toPlans"), lands, String(screen));
    // My resbites hears of it either way, so it reads its list again.
    assert.equal(left.hidden(SERIES, ME), true);
  }
});

test("a second tap while a leave is on its way sends nothing (review M3)", async () => {
  let release: () => void = () => {};
  const calls: string[] = [];
  const { leave } = setup({
    leave: (series) =>
      new Promise<void>((resolve) => {
        calls.push(`leave ${series}`);
        release = resolve;
      }),
  });
  const first = leave(SERIES, scope);
  assert.equal(await leave(SERIES, scope), null, "the second tap is no attempt");
  release();
  assert.deepEqual(await first, { left: true });
  assert.deepEqual(calls, [`leave ${SERIES}`]);
  const again = leave(SERIES, scope);
  release();
  assert.deepEqual(await again, { left: true });
  assert.equal(calls.length, 2);
});

test("left groups: hidden from My resbites until a list read that started at or after the leave succeeds (UI Q3, GR6 M2)", () => {
  const left = createLeftGroups();
  const heard: string[] = [];
  const stop = left.listen((series) => heard.push(series));
  left.note(SERIES, 1_000, ME);
  assert.deepEqual(heard, [SERIES]);
  assert.equal(left.hidden(SERIES, ME), true);
  assert.equal(left.hidden(OTHER, ME), false);
  // A read that started before the leave can still list the series: it stays hidden.
  left.settle(999, ME);
  assert.equal(left.hidden(SERIES, ME), true);
  // A read that started in the same millisecond, as the one the leave's own listener starts does, settles it.
  left.settle(1_000, ME);
  assert.equal(left.hidden(SERIES, ME), false);
  stop();
  left.note(OTHER, 2_000, ME);
  assert.deepEqual(heard, [SERIES], "a stopped listener hears nothing more");
});

test("the read a leave's own listener starts settles that leave (GR6 M2, re-review N2)", async () => {
  const { left, leave } = setup({ now: () => 5_000 });
  left.listen(() => left.settle(5_000, ME));
  await leave(SERIES, scope);
  assert.equal(left.hidden(SERIES, ME), false);
});

test("left groups belong to the account that left them (GR6 M1)", () => {
  const left = createLeftGroups();
  const plans = [
    { id: "a", series_id: SERIES },
    { id: "b", series_id: OTHER },
    { id: "c", series_id: SERIES },
  ];
  assert.equal(left.without(plans, ME), plans, "nothing left: the same list");
  left.note(SERIES, 1, ME);
  assert.deepEqual(left.without(plans, ME).map((p) => p.id), ["b"]);
  assert.equal(left.without(plans, SOMEONE_ELSE), plans, "another account's list keeps the group");
  assert.equal(left.hidden(SERIES, SOMEONE_ELSE), false);
  // Another account's read settles nothing of this one's.
  left.settle(10, SOMEONE_ELSE);
  assert.equal(left.hidden(SERIES, ME), true);
  assert.deepEqual(left.without(plans, null).map((p) => p.id), ["a", "b", "c"]);
});

test("a chat refusal that comes while the leave is on its way, then a lost answer, still finishes the leave (GR8 R1)", async () => {
  let fail: (e: unknown) => void = () => {};
  const { calls, left, leave, finish } = setup({ leave: () => new Promise<void>((_, reject) => (fail = reject)) });
  const attempt = leave(SERIES, scope);
  // The server took it, and the chat's next read was refused before the answer came back.
  assert.equal(finish(SERIES, scope), false, "nothing to finish while the attempt is on its way");
  fail(new Error("timed out"));
  assert.deepEqual(await attempt, { left: true });
  assert.deepEqual(calls, [`sync ${ME}`, "toPlans"]);
  assert.equal(left.hidden(SERIES, ME), true);
});

test("a refusal seen while the attempt was on its way doesn't turn a definite refusal into a leave (GR8 R1)", async () => {
  let fail: (e: unknown) => void = () => {};
  const { calls, leave, finish } = setup({ leave: () => new Promise<void>((_, reject) => (fail = reject)) });
  const attempt = leave(SERIES, scope);
  finish(SERIES, scope);
  fail({ code: "42501", message: "Hosts can't leave" });
  assert.deepEqual(await attempt, { left: false, error: "To leave, step down first: change your reply to Can’t go." });
  assert.deepEqual(calls, []);
});

test("an unknown outcome is the account's that tried: another account's refused read finishes nothing (GR8 n1)", async () => {
  const { calls, leave, finish } = setup({ leave: async () => Promise.reject(offline) });
  await leave(SERIES, scope);
  assert.equal(finish(SERIES, { userId: SOMEONE_ELSE, preview: false }), false);
  assert.deepEqual(calls, []);
  assert.equal(finish(SERIES, scope), true);
});
