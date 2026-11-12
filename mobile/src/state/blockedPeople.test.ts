import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BLOCKED_PEOPLE_START,
  blockedPeopleStep,
  blockedPeopleView,
  type BlockedPeopleEvent,
  type BlockedPeopleState,
} from "./blockedPeople";
import type { BlockedPerson } from "../services/safety";

const LEO = "0a000000-0000-4000-8000-000000000002";
const ANA = "0a000000-0000-4000-8000-000000000001";
const MIA = "0a000000-0000-4000-8000-000000000003";
const OFFLINE = "Check your connection and try again.";

const leo: BlockedPerson = { userId: LEO, name: "Leo" };
// A name with a right-to-left mark and a zero-width space in it, as a name can arrive.
const ana: BlockedPerson = { userId: ANA, name: "‏Ana​" };
// An account that can't be named.
const nameless: BlockedPerson = { userId: MIA, name: null };

/** Runs the events from the start (or from `from`), never changing a state in place. */
function run(events: BlockedPeopleEvent[], from: BlockedPeopleState = BLOCKED_PEOPLE_START): BlockedPeopleState {
  return events.reduce((state, event) => {
    const frozen = structuredClone(state);
    const next = blockedPeopleStep(state, event);
    assert.deepEqual(state, frozen, `${event.type} leaves the state it was given as it was`);
    return next;
  }, from);
}
const listed = (people: BlockedPerson[]) => run([{ type: "readStarted" }, { type: "readSucceeded", people }]);
const view = (state: BlockedPeopleState, preview = false) => blockedPeopleView(state, { preview });

test("before the first read lands, the screen is loading and names nobody", () => {
  assert.deepEqual(view(BLOCKED_PEOPLE_START), { kind: "loading" });
  assert.deepEqual(view(run([{ type: "readStarted" }])), { kind: "loading" });
});

test("the list reads my_blocks by name, cleaned as the chat cleans a name, with Someone for none, each with Unblock <name>", () => {
  const v = view(listed([leo, ana, nameless]));
  assert.equal(v.kind, "list");
  if (v.kind !== "list") return;
  assert.deepEqual(
    v.rows.map((r) => [r.userId, r.name, r.action]),
    [
      [LEO, "Leo", "Unblock Leo"],
      [ANA, "Ana", "Unblock Ana"],
      [MIA, "Someone", "Unblock Someone"],
    ],
  );
  // In my_blocks' order (newest first), nothing running and nothing wrong.
  assert.ok(v.rows.every((r) => !r.busy && !r.disabled && r.error === null));
});

test("a name left blank by the cleaning reads Someone too", () => {
  const v = view(listed([{ userId: LEO, name: " ​‏ " }]));
  assert.equal(v.kind === "list" && v.rows[0].name, "Someone");
  assert.equal(v.kind === "list" && v.rows[0].action, "Unblock Someone");
});

test("with nobody blocked, the screen says so (noneBlocked)", () => {
  assert.deepEqual(view(listed([])), { kind: "none" });
});

test("a failed first read shows the error line with Try again, never 'nobody blocked', and names nobody", () => {
  const failed = run([{ type: "readStarted" }, { type: "readFailed", message: OFFLINE }]);
  assert.deepEqual(view(failed), { kind: "failed", message: OFFLINE, retrying: false });
});

test("a refresh that fails after a list was shown drops the list: the error names nobody", () => {
  const failed = run([{ type: "readStarted" }, { type: "readFailed", message: OFFLINE }], listed([leo, ana]));
  const v = view(failed);
  assert.deepEqual(v, { kind: "failed", message: OFFLINE, retrying: false });
  assert.equal(JSON.stringify(v).includes("Leo"), false);
  assert.equal(JSON.stringify(v).includes("Ana"), false);
});

test("Try again keeps the error line while it runs, and the list replaces it once a read succeeds", () => {
  const failed = run([{ type: "readStarted" }, { type: "readFailed", message: OFFLINE }]);
  const retrying = run([{ type: "readStarted" }], failed);
  assert.deepEqual(view(retrying), { kind: "failed", message: OFFLINE, retrying: true });
  const v = view(run([{ type: "readSucceeded", people: [leo] }], retrying));
  assert.equal(v.kind, "list");
  assert.deepEqual(v.kind === "list" && v.rows.map((r) => r.name), ["Leo"]);
});

test("Unblock runs one at a time: its row is busy and every row's button waits", () => {
  const v = view(run([{ type: "unblockStarted", userId: LEO }], listed([leo, ana])));
  assert.equal(v.kind, "list");
  if (v.kind !== "list") return;
  assert.deepEqual(
    v.rows.map((r) => [r.name, r.busy, r.disabled]),
    [
      ["Leo", true, true],
      ["Ana", false, true],
    ],
  );
});

test("an unblock that went through takes the row away at once, without a second read", () => {
  const after = run([{ type: "unblockStarted", userId: LEO }, { type: "unblockSucceeded", userId: LEO }], listed([leo, ana]));
  const v = view(after);
  assert.deepEqual(v.kind === "list" && v.rows.map((r) => [r.name, r.busy, r.disabled]), [["Ana", false, false]]);
  assert.equal(after.reading, false);
});

test("unblocking the last person leaves 'nobody blocked'", () => {
  const after = run([{ type: "unblockStarted", userId: LEO }, { type: "unblockSucceeded", userId: LEO }], listed([leo]));
  assert.deepEqual(view(after), { kind: "none" });
});

test("a failed unblock keeps the row and says why beside that row only", () => {
  const after = run([{ type: "unblockStarted", userId: LEO }, { type: "unblockFailed", userId: LEO, message: OFFLINE }], listed([leo, ana]));
  const v = view(after);
  assert.equal(v.kind, "list");
  if (v.kind !== "list") return;
  assert.deepEqual(
    v.rows.map((r) => [r.name, r.error, r.busy, r.disabled]),
    [
      ["Leo", OFFLINE, false, false],
      ["Ana", null, false, false],
    ],
  );
});

test("the next Unblock takes the old error away", () => {
  const failed = run([{ type: "unblockStarted", userId: LEO }, { type: "unblockFailed", userId: LEO, message: OFFLINE }], listed([leo, ana]));
  for (const userId of [LEO, ANA]) {
    const v = view(run([{ type: "unblockStarted", userId }], failed));
    assert.ok(v.kind === "list" && v.rows.every((r) => r.error === null), `unblocking ${userId} clears it`);
  }
});

test("a fresh list keeps a failed unblock's line while that person is still listed, and drops it once they aren't", () => {
  const failed = run([{ type: "unblockStarted", userId: LEO }, { type: "unblockFailed", userId: LEO, message: OFFLINE }], listed([leo, ana]));
  const still = view(run([{ type: "readStarted" }, { type: "readSucceeded", people: [leo, ana] }], failed));
  assert.deepEqual(still.kind === "list" && still.rows.map((r) => r.error), [OFFLINE, null]);
  const gone = run([{ type: "readStarted" }, { type: "readSucceeded", people: [ana] }], failed);
  assert.equal(gone.unblockError, null);
});

test("an unblock that starts ends a refresh still running, whose answer no longer counts", () => {
  const refreshing = run([{ type: "readStarted" }], listed([leo]));
  assert.equal(refreshing.reading, true);
  const unblocking = run([{ type: "unblockStarted", userId: LEO }], refreshing);
  assert.equal(unblocking.reading, false);
});

test("an unblock answer for someone not listed changes nothing", () => {
  const before = listed([leo]);
  assert.deepEqual(run([{ type: "unblockSucceeded", userId: ANA }], before).people, [leo]);
});

test("another account starts from nothing: no list, no error, nothing running", () => {
  const busy = run([{ type: "unblockStarted", userId: LEO }, { type: "unblockFailed", userId: LEO, message: OFFLINE }, { type: "readStarted" }], listed([leo]));
  assert.deepEqual(run([{ type: "reset" }], busy), BLOCKED_PEOPLE_START);
  assert.deepEqual(view(run([{ type: "reset" }], busy)), { kind: "loading" });
});

test("the preview has no account: nobody is blocked, whatever the state says", () => {
  for (const state of [BLOCKED_PEOPLE_START, listed([leo]), run([{ type: "readFailed", message: OFFLINE }])])
    assert.deepEqual(view(state, true), { kind: "none" });
});

test("the screen and its hook: the gateway's reads and unblock, its error words, and the model's view", () => {
  const hook = readFileSync(new URL("./useBlockedPeople.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../../app/blocked-people.tsx", import.meta.url), "utf8");
  // The gateway's unblock, so the "blocks changed" event reaches a chat open beneath (B3); its own read; its words.
  assert.match(hook, /safetyGateway\.unblock\(/);
  assert.match(hook, /safetyGateway\.myBlocks\(\)/);
  assert.equal(hook.includes("safetyGateway.block("), false, "Blocked people never blocks");
  assert.match(hook, /safetyErrorMessage\(/);
  // The preview reads nothing.
  assert.match(hook, /preview/);
  // The screen draws the model's view, and its words are the rulings'.
  assert.match(screen, /SAFETY_COPY\.noneBlocked/);
  assert.match(screen, /SAFETY_COPY\.blockedPeople/);
  assert.match(screen, /EVENT_COPY\.tryAgain/);
});
