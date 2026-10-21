import test from "node:test";
import assert from "node:assert/strict";
import { person, mergePeople } from "../domain/people";
import { createPeopleStore } from "./peopleStore";
const a = person("Alex", "A@example.com")!,
  b = person("Bea", "b@example.com")!,
  c = person("Cam", "+44 7700 900123")!;
function store() {
  const data = new Map<string, string>();
  return createPeopleStore({
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  });
}
test("overlapping groups deduplicate exact contact details without guessing identities", () => {
  assert.deepEqual(
    mergePeople([a, b], [b, c]).map((p) => p.key),
    [a.key, b.key, c.key],
  );
  assert.equal(person("Alex", " a@EXAMPLE.com ")?.key, a.key);
  assert.equal(person("Cam", "+44 (7700) 900-123")?.key, c.key);
  assert.notEqual(person("Cam", "07700900123")?.key, c.key);
  assert.equal(person("No detail", ""), null);
  assert.equal(person("Invalid", "abc"), null);
});
test("group edits/deletion never mutate a saved plan selection", async () => {
  const groups = store();
  await groups.saveGroup("owner", {
    id: "one",
    name: "Friends",
    members: [a, b],
  });
  await groups.saveGroup("owner", {
    id: "two",
    name: "Weekend",
    members: [b, c],
  });
  await groups.saveSelection("owner", "plan", mergePeople([a, b], [b, c]));
  await groups.saveGroup("owner", { id: "one", name: "Renamed", members: [a] });
  await groups.deleteGroup("owner", "two");
  const data = await groups.list("owner");
  assert.deepEqual(data.plans.plan, [a, b, c]);
  assert.equal(data.groups[0].name, "Renamed");
});
test("groups and plan selections are account-scoped and cleared on sign-out", async () => {
  const groups = store();
  await groups.saveGroup("a", { id: "one", name: "Friends", members: [a] });
  await groups.saveGroup("b", { id: "two", name: "Other", members: [b] });
  await groups.saveSelection("a", "plan", [a]);
  await groups.clear("a");
  assert.deepEqual(await groups.list("a"), { groups: [], plans: {} });
  assert.equal((await groups.list("b")).groups.length, 1);
});
test("clearing invalidates queued saves so a signing-out account is not repopulated", async () => {
  const groups = store();
  const save = groups.saveGroup("a", {
    id: "one",
    name: "Friends",
    members: [a],
  });
  const clear = groups.clear("a");
  await assert.rejects(save);
  await clear;
  assert.deepEqual((await groups.list("a")).groups, []);
});
test("a per-person invitation journal saved before GI1 is dropped on the next write", async () => {
  const data = new Map<string, string>();
  data.set(
    "resbite.people.v1.owner",
    JSON.stringify({ groups: [], plans: {}, invitations: [{ id: "i", token: "a".repeat(64), planId: "p" }] }),
  );
  const groups = createPeopleStore({
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  });
  assert.deepEqual(await groups.list("owner"), { groups: [], plans: {} });
  await groups.saveSelection("owner", "plan", [a]);
  assert.doesNotMatch(data.get("resbite.people.v1.owner")!, /invitations|aaaa/);
});
