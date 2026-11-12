import test from "node:test";
import assert from "node:assert/strict";
import { createGroupLeave, createLeftGroups } from "./groupLeave";

const SERIES = "5e000000-0000-4000-8000-000000000001";
const OTHER = "5e000000-0000-4000-8000-000000000002";
const scope = { userId: "0a000000-0000-4000-8000-000000000001", preview: false };
const notInGroup = { code: "42501", message: "Not in this group" };
const offline = new TypeError("Failed to fetch");

/** A leave wired to fakes: what was called, in order. */
function setup(over: { leave?: (series: string) => Promise<void>; onScreen?: () => string | null } = {}) {
  const calls: string[] = [];
  const left = createLeftGroups();
  const leave = createGroupLeave({
    leave: over.leave ?? (async (series) => void calls.push(`leave ${series}`)),
    sync: async (s) => void calls.push(`sync ${s.userId}`),
    onScreen: over.onScreen ?? (() => SERIES),
    toPlans: () => void calls.push("toPlans"),
    left,
  });
  return { calls, left, leave };
}

test("a leave that goes through re-syncs the phone's reminders, then lands on My resbites from the group's screen (I2, I10)", async () => {
  const { calls, left, leave } = setup();
  assert.deepEqual(await leave(SERIES, scope), { left: true });
  assert.deepEqual(calls, [`leave ${SERIES}`, `sync ${scope.userId}`, "toPlans"]);
  assert.equal(left.hidden(SERIES), true);
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
  assert.equal(left.hidden(SERIES), false);
  assert.deepEqual(await leave(SERIES, scope), { left: true });
  assert.deepEqual(calls, [`sync ${scope.userId}`, "toPlans"]);
  assert.equal(left.hidden(SERIES), true);
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
    assert.equal(left.hidden(SERIES), true);
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
  // Once settled, another attempt is its own.
  const again = leave(SERIES, scope);
  release();
  assert.deepEqual(await again, { left: true });
  assert.equal(calls.length, 2);
});

test("left groups: hidden from My resbites until a list read that started after the leave succeeds (UI Q3)", () => {
  const left = createLeftGroups();
  const heard: string[] = [];
  const stop = left.listen((series) => heard.push(series));
  left.note(SERIES, 1_000);
  assert.deepEqual(heard, [SERIES]);
  assert.equal(left.hidden(SERIES), true);
  assert.equal(left.hidden(OTHER), false);
  // A read that started before the leave can still list the series: it stays hidden.
  left.settle(900);
  assert.equal(left.hidden(SERIES), true);
  // A read that started after the leave is the server's word: an invitation back shows again.
  left.settle(1_001);
  assert.equal(left.hidden(SERIES), false);
  stop();
  left.note(OTHER, 2_000);
  assert.deepEqual(heard, [SERIES], "a stopped listener hears nothing more");
});

test("left groups: a list keeps every plan of other series and drops every occurrence of a left one", () => {
  const left = createLeftGroups();
  const plans = [
    { id: "a", series_id: SERIES },
    { id: "b", series_id: OTHER },
    { id: "c", series_id: SERIES },
  ];
  assert.equal(left.without(plans), plans, "nothing left: the same list");
  left.note(SERIES, 1);
  assert.deepEqual(left.without(plans).map((p) => p.id), ["b"]);
});
