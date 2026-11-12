import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BLOCKED_PEOPLE_START,
  blockedPeopleStep,
  blockedPeopleView,
  mayAct,
  type BlockedPeopleEvent,
  type BlockedPeopleState,
} from "./blockedPeople";
import { SAFETY_COPY } from "../domain/safetyCopy";
import { createSafetyGateway, type BlockedPerson } from "../services/safety";

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

test("the list reads my_blocks by name, cleaned as the chat cleans a name, with Someone for none, each with Unblock, spoken Unblock <name>", () => {
  const v = view(listed([leo, ana, nameless]));
  assert.equal(v.kind, "list");
  if (v.kind !== "list") return;
  assert.deepEqual(
    v.rows.map((r) => [r.userId, r.name, r.action, r.label]),
    [
      [LEO, "Leo", "Unblock", "Unblock Leo"],
      [ANA, "Ana", "Unblock", "Unblock Ana"],
      [MIA, "Someone", "Unblock", "Unblock Someone"],
    ],
  );
  // In my_blocks' order (newest first), nothing running and nothing wrong.
  assert.ok(v.rows.every((r) => !r.busy && !r.disabled && r.error === null));
});

test("a name left blank by the cleaning reads Someone too", () => {
  const v = view(listed([{ userId: LEO, name: " ​‏ " }]));
  assert.equal(v.kind === "list" && v.rows[0].name, "Someone");
  assert.equal(v.kind === "list" && v.rows[0].label, "Unblock Someone");
});

test("with nobody blocked, the screen says so (noneBlocked)", () => {
  assert.deepEqual(view(listed([])), { kind: "none", after: null });
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
  assert.deepEqual(view(after), { kind: "none", after: { seq: 1, notice: "Unblocked Leo.", focus: null } });
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
    assert.deepEqual(view(state, true), { kind: "none", after: null });
});

test("the words: Unblock on the row, Unblocked <name>. once it went through, and the line on blocks (ruling SR4)", () => {
  assert.equal(SAFETY_COPY.unblockAction, "Unblock");
  assert.equal(SAFETY_COPY.unblocked("Leo"), "Unblocked Leo.");
  assert.equal(
    SAFETY_COPY.blocksPrivacy,
    "Blocks stay until you undo them. The Resbite team can see who blocked whom for 7 days.",
  );
});

test("after an unblock: Unblocked <name>. and focus on the row that took its place", () => {
  const after = run([{ type: "unblockStarted", userId: LEO }, { type: "unblockSucceeded", userId: LEO }], listed([leo, ana, nameless]));
  const v = view(after);
  assert.equal(v.kind, "list");
  assert.deepEqual(v.kind === "list" && v.after, { seq: 1, notice: "Unblocked Leo.", focus: ANA });
  // From the middle: the row below moves up into its place, and takes focus.
  const middle = view(run([{ type: "unblockStarted", userId: ANA }, { type: "unblockSucceeded", userId: ANA }], listed([leo, ana, nameless])));
  assert.deepEqual(middle.kind === "list" && middle.after, { seq: 1, notice: "Unblocked Ana.", focus: MIA });
});

test("after unblocking the last row of several, focus goes to the row above; after the only one, to the empty line", () => {
  const last = view(run([{ type: "unblockStarted", userId: MIA }, { type: "unblockSucceeded", userId: MIA }], listed([leo, ana, nameless])));
  assert.deepEqual(last.kind === "list" && last.after, { seq: 1, notice: "Unblocked Someone.", focus: ANA });
  const only = blockedPeopleView(run([{ type: "unblockStarted", userId: ANA }, { type: "unblockSucceeded", userId: ANA }], listed([ana])), { preview: false });
  assert.deepEqual(only, { kind: "none", after: { seq: 1, notice: "Unblocked Ana.", focus: null } });
});

test("each unblock that goes through counts on, so focus moves again; a new unblock or a failure clears the line", () => {
  const twice = run(
    [
      { type: "unblockStarted", userId: LEO },
      { type: "unblockSucceeded", userId: LEO },
      { type: "unblockStarted", userId: ANA },
    ],
    listed([leo, ana, nameless]),
  );
  assert.equal(twice.after, null, "the line goes while the next one runs");
  const done = run([{ type: "unblockSucceeded", userId: ANA }], twice);
  assert.deepEqual(done.after, { seq: 2, notice: "Unblocked Ana.", focus: MIA });
  const failed = run([{ type: "unblockStarted", userId: MIA }, { type: "unblockFailed", userId: MIA, message: OFFLINE }], done);
  assert.equal(failed.after, null);
  // A failed read drops the list, and the line with it; a fresh list keeps it, without moving focus again.
  assert.equal(run([{ type: "readStarted" }, { type: "readFailed", message: OFFLINE }], done).after, null);
  assert.deepEqual(run([{ type: "readStarted" }, { type: "readSucceeded", people: [nameless] }], done).after, done.after);
});

test("nothing is read or sent without an account, in the preview, while signing out, or while an unblock runs", () => {
  const ready = { userId: ANA, preview: false, signingOut: false, working: false };
  assert.equal(mayAct(ready), true);
  assert.equal(mayAct({ ...ready, userId: undefined }), false);
  assert.equal(mayAct({ ...ready, preview: true }), false);
  assert.equal(mayAct({ ...ready, signingOut: true }), false);
  assert.equal(mayAct({ ...ready, working: true }), false);
});

// SR7: when each block was made. June 2026 in London (BST); 24 Dec 2025 is last year.
const JUNE = Date.parse("2026-06-15T12:00:00Z");
const LONDON = "Europe/London";
const LEO_2 = "0a000000-0000-4000-8000-000000000004";
const dated = (state: BlockedPeopleState) => blockedPeopleView(state, { preview: false, now: JUNE, zone: LONDON });

test("SR7: the gateway keeps each block's time, and leaves out one it can't read", async () => {
  const rows = [
    { user_id: LEO, name: "Leo", at: "2026-06-10T18:00:00.123456+00:00" },
    { user_id: LEO_2, name: "Leo", at: "2025-12-24T10:00:00Z" },
    { user_id: ANA, name: "Ana" },
    { user_id: MIA, name: null, at: "yesterday" },
    { user_id: "0a000000-0000-4000-8000-000000000005", name: "Sol", at: 1781280000 },
    { user_id: "0a000000-0000-4000-8000-000000000006", name: "Pia", at: null },
  ];
  const gw = createSafetyGateway(async () => ({ data: rows, error: null }));
  assert.deepEqual(await gw.myBlocks(), [
    { userId: LEO, name: "Leo", at: "2026-06-10T18:00:00.123456+00:00" },
    { userId: LEO_2, name: "Leo", at: "2025-12-24T10:00:00Z" },
    { userId: ANA, name: "Ana" },
    { userId: MIA, name: null },
    { userId: "0a000000-0000-4000-8000-000000000005", name: "Sol" },
    { userId: "0a000000-0000-4000-8000-000000000006", name: "Pia" },
  ]);
});

test("SR7: each row says when it was blocked, in the phone's zone, the year only when it isn't this one, and says so to the screen reader", () => {
  assert.equal(SAFETY_COPY.blockedOn("Wed 10 Jun"), "Blocked Wed 10 Jun");
  const v = dated(
    listed([
      { userId: LEO, name: "Leo", at: "2026-06-10T18:00:00.123456+00:00" },
      { userId: LEO_2, name: "Leo", at: "2025-12-24T10:00:00Z" },
      // 23:30 UTC on 30 June is 1 July in London.
      { userId: ANA, name: "Ana", at: "2026-06-30T23:30:00Z" },
    ]),
  );
  assert.equal(v.kind, "list");
  if (v.kind !== "list") return;
  assert.deepEqual(
    v.rows.map((r) => [r.name, r.since, r.rowLabel, r.label]),
    [
      ["Leo", "Blocked Wed 10 Jun", "Leo, Blocked Wed 10 Jun", "Unblock Leo"],
      ["Leo", "Blocked Wed 24 Dec 2025", "Leo, Blocked Wed 24 Dec 2025", "Unblock Leo"],
      ["Ana", "Blocked Wed 1 Jul", "Ana, Blocked Wed 1 Jul", "Unblock Ana"],
    ],
  );
  // Two people with the same first name are told apart.
  assert.notEqual(v.rows[0].rowLabel, v.rows[1].rowLabel);
});

test("SR7: no time, or one that can't be read, gives no second line and never throws", () => {
  const odd = [
    { userId: LEO, name: "Leo" },
    { userId: ANA, name: "Ana", at: "not a time" },
    { userId: MIA, name: null, at: "" },
  ] as BlockedPerson[];
  const v = dated(listed(odd));
  assert.deepEqual(v.kind === "list" && v.rows.map((r) => [r.since, r.rowLabel]), [
    [null, "Leo"],
    [null, "Ana"],
    [null, "Someone"],
  ]);
  // Without a clock or a zone, the phone's own are used.
  const plain = view(listed([{ userId: LEO, name: "Leo", at: new Date().toISOString() }]));
  assert.match(plain.kind === "list" ? String(plain.rows[0].since) : "", /^Blocked \w{3} \d{1,2} \w{3}$/);
});

test("the screen and its hook: the gateway's reads and unblock, its error words, and the model's view", () => {
  const hook = readFileSync(new URL("./useBlockedPeople.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../../app/blocked-people.tsx", import.meta.url), "utf8");
  // The gateway's unblock, so the "blocks changed" event reaches a chat open beneath (B3); its own read; its words.
  assert.match(hook, /safetyGateway\.unblock\(/);
  assert.match(hook, /safetyGateway\.myBlocks\(\)/);
  assert.equal(hook.includes("safetyGateway.block("), false, "Blocked people never blocks");
  assert.match(hook, /safetyErrorMessage\(/);
  // Both the read and the unblock ask mayAct first, so the preview, signing out and a running unblock send nothing.
  assert.equal(hook.match(/if \(!mayAct\(\{ userId, preview, signingOut, working: working\.current \}\)\) return;/g)?.length, 2);
  // The screen draws the model's view, and its words are the rulings'.
  assert.match(screen, /SAFETY_COPY\.noneBlocked/);
  assert.match(screen, /SAFETY_COPY\.blockedPeople/);
  assert.match(screen, /EVENT_COPY\.tryAgain/);
});
