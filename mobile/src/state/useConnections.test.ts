import test from "node:test";
import assert from "node:assert/strict";
import {
  NO_ERRORS,
  actionErrorFor,
  applyDecision,
  keepOnFailure,
  nextErrors,
  requestGone,
  type ConnectionErrors,
} from "./connectionsModel";
import type { ConnectionPerson, MyConnections } from "../services/connections";

const person = (userId: string, name: string, title: string | null, context?: "going" | "met"): ConnectionPerson => ({
  userId,
  name,
  avatarPath: null,
  avatarRevision: 0,
  seriesId: title ? `series-${userId}` : null,
  title,
  ...(context ? { context } : {}),
});

const pedro = person("p", "Pedro", "Board game night", "going");
const ines = person("i", "Inés", null, "met");
const marta = person("m", "Marta", "Picnic in the park");
const tomas = person("t", "Tomás", "Sunday run");
const mine = (): MyConnections => ({ requests: [pedro, ines], connected: [marta, tomas] });

test("accepting moves the person from requests to connected, in name order, without the request's context", () => {
  const before = mine();
  const after = applyDecision(before, "p", "accept");
  assert.deepEqual(after.requests, [ines]);
  const { context: _context, ...connected } = pedro;
  assert.deepEqual(after.connected, [marta, connected, tomas]);
  assert.equal("context" in after.connected[1], false);
  // The data the screen holds is never changed in place.
  assert.deepEqual(before, mine());
});

test("accepting keeps the met-at title, or none", () => {
  const after = applyDecision(mine(), "i", "accept");
  assert.deepEqual(
    after.connected.map((p) => [p.name, p.title]),
    [
      ["Inés", null],
      ["Marta", "Picnic in the park"],
      ["Tomás", "Sunday run"],
    ],
  );
});

test("declining removes the request and connects nobody", () => {
  const after = applyDecision(mine(), "p", "decline");
  assert.deepEqual(after, { requests: [ines], connected: [marta, tomas] });
});

test("removing removes the person from connected and leaves the requests", () => {
  const after = applyDecision(mine(), "m", "remove");
  assert.deepEqual(after, { requests: [pedro, ines], connected: [tomas] });
});

test("a decision about someone not listed there changes nothing", () => {
  assert.deepEqual(applyDecision(mine(), "m", "accept"), mine());
  assert.deepEqual(applyDecision(mine(), "m", "decline"), mine());
  assert.deepEqual(applyDecision(mine(), "p", "remove"), mine());
  assert.deepEqual(applyDecision(mine(), "nobody", "accept"), mine());
});

test("accepting someone already connected lists them once", () => {
  const data: MyConnections = { requests: [pedro], connected: [person("p", "Pedro", "Board game night"), marta] };
  const after = applyDecision(data, "p", "accept");
  assert.deepEqual(after.requests, []);
  assert.deepEqual(
    after.connected.map((p) => p.name),
    ["Marta", "Pedro"],
  );
});

test("a request the server no longer holds (withdrawn or already answered) is told apart from every other refusal", () => {
  assert.equal(requestGone({ code: "42501", message: "No request", details: null, hint: null }), true);
  assert.equal(requestGone({ code: "42501", message: "Not a connection" }), false);
  assert.equal(requestGone({ code: "42501", message: "Names required" }), false);
  assert.equal(requestGone({ code: "22023", message: "No request" }), false);
  assert.equal(requestGone(new TypeError("Failed to fetch")), false);
  assert.equal(requestGone(null), false);
});

test("a failed read keeps the list already held; with none held yet there is still none", () => {
  const list = mine();
  assert.equal(keepOnFailure(list, true), list);
  assert.equal(keepOnFailure(null, true), null);
  // Only a failure keeps it: a read that brought a list puts its own in place.
  assert.equal(keepOnFailure(list, false), null);
});

const OFFLINE = "Check your connection and try again.";

test("a read's error stays through a retry, a sheet and a decision, and goes only when a read succeeds", () => {
  let e: ConnectionErrors = nextErrors(NO_ERRORS, { type: "readFailed", message: OFFLINE });
  assert.deepEqual(e, { read: OFFLINE, action: null });
  for (const event of [{ type: "readStarted" }, { type: "sheet" }, { type: "decisionStarted" }] as const) {
    e = nextErrors(e, event);
    assert.equal(e.read, OFFLINE, event.type);
  }
  e = nextErrors(e, { type: "decisionFailed", userId: "p", decision: "accept", message: "Couldn't do that. Try again." });
  assert.equal(e.read, OFFLINE, "a failed decision leaves the read's error where it is");
  e = nextErrors(e, { type: "readFailed", message: "Couldn't do that. Try again." });
  assert.equal(e.read, "Couldn't do that. Try again.", "the latest failed read says why");
  e = nextErrors(e, { type: "readSucceeded" });
  assert.equal(e.read, null);
});

test("a decision's error belongs to whose it was, and goes with the next decision or a sheet opening or closing", () => {
  const failed = nextErrors(NO_ERRORS, { type: "decisionFailed", userId: "m", decision: "remove", message: OFFLINE });
  assert.deepEqual(failed, { read: null, action: { userId: "m", decision: "remove", message: OFFLINE } });
  // Reads leave it.
  const reads = [{ type: "readStarted" }, { type: "readSucceeded" }, { type: "readFailed", message: OFFLINE }] as const;
  for (const event of reads) assert.deepEqual(nextErrors(failed, event).action, failed.action, event.type);
  assert.equal(nextErrors(failed, { type: "sheet" }).action, null);
  assert.equal(nextErrors(failed, { type: "decisionStarted" }).action, null);
});

test("a decision's error shows in its own card (Accept, Not now) or its own sheet (Remove), nowhere else", () => {
  const accept = { userId: "p", decision: "accept" as const, message: OFFLINE };
  const decline = { userId: "p", decision: "decline" as const, message: OFFLINE };
  const remove = { userId: "m", decision: "remove" as const, message: OFFLINE };
  assert.equal(actionErrorFor(accept, "p", "card"), OFFLINE);
  assert.equal(actionErrorFor(decline, "p", "card"), OFFLINE);
  assert.equal(actionErrorFor(accept, "i", "card"), null);
  assert.equal(actionErrorFor(accept, "p", "sheet"), null);
  assert.equal(actionErrorFor(remove, "m", "sheet"), OFFLINE);
  assert.equal(actionErrorFor(remove, "t", "sheet"), null);
  assert.equal(actionErrorFor(remove, "m", "card"), null);
  assert.equal(actionErrorFor(null, "p", "card"), null);
});
