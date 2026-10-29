import test from "node:test";
import assert from "node:assert/strict";
import { createJournalStore, type PendingCreate } from "./createJournal";
import type { PlanWrite } from "../domain/plans";

const write: PlanWrite = {
  id: "plan-1",
  activityId: "coffee",
  details: {
    title: "Coffee",
    description: "",
    categories: [],
    starts_at: "2099-01-01T12:00:00.000Z",
    ends_at: "2099-01-01T13:00:00.000Z",
    place_label: "Café",
    note: "By the window",
    time_zone: "UTC",
    area: "",
    place_tbd: false,
    repeat_weeks: null,
  },
};
const entry: PendingCreate = { requestId: "request-1", write, savedAt: "2099-01-01T00:00:00.000Z" };

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: async (k: string) => values.get(k) ?? null,
      setItem: async (k: string, v: string) => void values.set(k, v),
      removeItem: async (k: string) => void values.delete(k),
    },
  };
}

test("an entry round-trips under the scope's key", async () => {
  const { values, storage } = memory();
  const journal = createJournalStore(storage);
  assert.equal(await journal.read("account-a"), null);
  await journal.put("account-a", entry);
  assert.deepEqual(await journal.read("account-a"), entry);
  assert.ok(values.has("resbite.create-journal.v1.account-a"));
  assert.equal(await journal.read("account-b"), null);
});

test("clear removes the entry", async () => {
  const { values, storage } = memory();
  const journal = createJournalStore(storage);
  await journal.put("account-a", entry);
  await journal.clear("account-a");
  assert.equal(await journal.read("account-a"), null);
  assert.equal(values.size, 0);
});

test("an unreadable or malformed value reads as empty", async () => {
  const { values, storage } = memory();
  const journal = createJournalStore(storage);
  values.set("resbite.create-journal.v1.account-a", "{not json");
  assert.equal(await journal.read("account-a"), null);
  values.set("resbite.create-journal.v1.account-a", '{"requestId":3}');
  assert.equal(await journal.read("account-a"), null);
  values.set("resbite.create-journal.v1.account-a", '{"requestId":"r","write":{"id":7}}');
  assert.equal(await journal.read("account-a"), null);
  values.set("resbite.create-journal.v1.account-a", "null");
  assert.equal(await journal.read("account-a"), null);
});

test("operations on one store run in order", async () => {
  const { storage } = memory();
  const journal = createJournalStore(storage);
  const all = [journal.put("a", entry), journal.clear("a"), journal.put("a", entry), journal.read("a")];
  assert.deepEqual((await Promise.all(all))[3], entry);
});
