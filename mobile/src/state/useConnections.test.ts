import test from "node:test";
import assert from "node:assert/strict";
import { applyDecision } from "./connectionsModel";
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
