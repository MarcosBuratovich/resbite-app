import test from "node:test";
import assert from "node:assert/strict";
import {
  coverIndexKey,
  createCoverJournalIndex,
  createIndexedCoverStore,
} from "./coverJournalIndex.ts";
import { coverScope } from "../domain/covers.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "33333333-3333-4333-8333-333333333333";
const p1 = "22222222-2222-4222-8222-222222222222";
const p2 = "44444444-4444-4444-8444-444444444444";
const p3 = "55555555-5555-4555-8555-555555555555";

function memory(log: string[] = []) {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: async (k: string) => values.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        log.push(`set:${k}`);
        values.set(k, v);
      },
      removeItem: async (k: string) => {
        log.push(`remove:${k}`);
        values.delete(k);
      },
    },
  };
}

test("index adds, dedupes and removes plan ids per owner", async () => {
  const { storage, values } = memory();
  const index = createCoverJournalIndex(storage);
  await index.add(owner, p1);
  await index.add(owner, p1);
  await index.add(owner, p2);
  await index.add(other, p3);
  assert.deepEqual(await index.list(owner), [p1, p2]);
  assert.deepEqual(await index.list(other), [p3]);
  assert.equal(values.get(coverIndexKey(owner)), JSON.stringify([p1, p2]));
  await index.remove(owner, p1);
  assert.deepEqual(await index.list(owner), [p2]);
  await index.remove(owner, p2);
  assert.equal(values.has(coverIndexKey(owner)), false);
});

test("concurrent adds and removes do not lose entries", async () => {
  const { storage } = memory();
  const slow = {
    ...storage,
    setItem: async (k: string, v: string) => {
      await new Promise((r) => setTimeout(r, 5));
      await storage.setItem(k, v);
    },
  };
  const index = createCoverJournalIndex(slow);
  await Promise.all([index.add(owner, p1), index.add(owner, p2), index.add(owner, p3)]);
  assert.deepEqual((await index.list(owner)).sort(), [p1, p2, p3].sort());
  await Promise.all([index.remove(owner, p1), index.add(owner, p1), index.remove(owner, p2)]);
  assert.deepEqual((await index.list(owner)).sort(), [p1, p3].sort());
});

test("malformed stored index is treated as empty and can be replaced or cleared", async () => {
  const { storage, values } = memory();
  const index = createCoverJournalIndex(storage);
  values.set(coverIndexKey(owner), "{not json");
  assert.deepEqual(await index.list(owner), []);
  await index.add(owner, p1);
  assert.deepEqual(await index.list(owner), [p1]);
  values.set(coverIndexKey(owner), JSON.stringify([p1, 7, "../x", p1, p2]));
  assert.deepEqual(await index.list(owner), [p1, p2]);
  values.set(coverIndexKey(owner), JSON.stringify({ a: 1 }));
  assert.deepEqual(await index.list(owner), []);
  await index.clearKey(owner);
  assert.equal(values.has(coverIndexKey(owner)), false);
  await assert.rejects(index.add("bad", p1));
  await assert.rejects(index.add(owner, "bad"));
});

function fakeStore(log: string[], failFor?: string) {
  return {
    read: async () => null,
    bytes: async () => new Uint8Array(),
    begin: async (scope: string) => {
      log.push(`begin:${scope}`);
    },
    clear: async (scope: string) => {
      log.push(`clear:${scope}`);
      if (scope === failFor) throw Error("disk");
    },
  };
}

test("begin indexes before the journal write; clear unindexes after the clear", async () => {
  const log: string[] = [];
  const { storage, values } = memory(log);
  const store = createIndexedCoverStore(fakeStore(log), createCoverJournalIndex(storage));
  const scope = coverScope(owner, p1);
  await store.begin(scope, { previous: null, target: null, expectedRevision: 0 }, null, () => {});
  assert.deepEqual(log, [`set:${coverIndexKey(owner)}`, `begin:${scope}`]);
  log.length = 0;
  await store.clear(scope);
  assert.deepEqual(log, [`clear:${scope}`, `remove:${coverIndexKey(owner)}`]);
  assert.equal(values.has(coverIndexKey(owner)), false);
});

test("a failed clear keeps the plan indexed", async () => {
  const log: string[] = [];
  const { storage, values } = memory(log);
  const scope = coverScope(owner, p1);
  const store = createIndexedCoverStore(fakeStore(log, scope), createCoverJournalIndex(storage));
  await store.begin(scope, { previous: null, target: null, expectedRevision: 0 }, null, () => {});
  await assert.rejects(store.clear(scope), /disk/);
  assert.deepEqual(JSON.parse(values.get(coverIndexKey(owner))!), [p1]);
});

test("clearCoverJournals clears every indexed plan, drops the key, and rethrows after a failure", async () => {
  const log: string[] = [];
  const { storage, values } = memory(log);
  const index = createCoverJournalIndex(storage);
  const store = createIndexedCoverStore(fakeStore(log), index);
  for (const p of [p1, p2]) await index.add(owner, p);
  await index.add(other, p3);
  log.length = 0;
  await store.clearCoverJournals(owner);
  assert.deepEqual(log.filter((l) => l.startsWith("clear:")), [
    `clear:${coverScope(owner, p1)}`,
    `clear:${coverScope(owner, p2)}`,
  ]);
  assert.equal(values.has(coverIndexKey(owner)), false);
  assert.deepEqual(await index.list(other), [p3]);

  const failing = createIndexedCoverStore(fakeStore(log, coverScope(owner, p1)), index);
  for (const p of [p1, p2]) await index.add(owner, p);
  log.length = 0;
  await assert.rejects(failing.clearCoverJournals(owner), /disk/);
  assert.deepEqual(log.filter((l) => l.startsWith("clear:")), [
    `clear:${coverScope(owner, p1)}`,
    `clear:${coverScope(owner, p2)}`,
  ]);
  assert.deepEqual(await index.list(owner), [p1], "failed plan stays indexed for a retry");
  await store.clearCoverJournals(owner);
  assert.equal(values.has(coverIndexKey(owner)), false);
});

test("clearCoverJournals with a malformed index still removes the key", async () => {
  const { storage, values } = memory();
  const store = createIndexedCoverStore(fakeStore([]), createCoverJournalIndex(storage));
  values.set(coverIndexKey(owner), "garbage");
  await store.clearCoverJournals(owner);
  assert.equal(values.has(coverIndexKey(owner)), false);
});

test("discardStaleCoverJournals clears cancelled, started and not-owned plans only", async () => {
  const log: string[] = [];
  const { storage } = memory(log);
  const index = createCoverJournalIndex(storage);
  const store = createIndexedCoverStore(fakeStore(log), index);
  const ids = [
    "a0000000-0000-4000-8000-000000000001",
    "a0000000-0000-4000-8000-000000000002",
    "a0000000-0000-4000-8000-000000000003",
    "a0000000-0000-4000-8000-000000000004",
    "a0000000-0000-4000-8000-000000000005",
  ];
  for (const id of ids) await index.add(owner, id);
  const now = new Date("2026-06-01T12:00:00Z");
  const future = "2026-06-02T12:00:00Z";
  const plans = [
    { id: ids[0], owner_id: owner, status: "cancelled", starts_at: future },
    { id: ids[1], owner_id: owner, status: "active", starts_at: "2026-06-01T11:00:00Z" },
    { id: ids[2], owner_id: other, status: "active", starts_at: future },
    { id: ids[3], owner_id: owner, status: "active", starts_at: future },
    { id: p1, owner_id: owner, status: "cancelled", starts_at: future }, // listed but never indexed
  ];
  log.length = 0;
  await store.discardStaleCoverJournals(owner, plans, now);
  assert.deepEqual(
    log.filter((l) => l.startsWith("clear:")).sort(),
    ids.slice(0, 3).map((id) => `clear:${coverScope(owner, id)}`).sort(),
  );
  assert.deepEqual((await index.list(owner)).sort(), [ids[3], ids[4]].sort());
});
