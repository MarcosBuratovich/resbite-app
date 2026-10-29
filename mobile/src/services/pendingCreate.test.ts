import test from "node:test";
import assert from "node:assert/strict";
import { createJournalStore, type PendingCreate } from "./createJournal";
import { reconcilePendingCreate } from "./pendingCreate";
import { PlanSaveError, type Plan, type PlanGateway, type PlanWrite } from "../domain/plans";

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
    note: "",
    time_zone: "UTC",
    area: "",
    place_tbd: false,
    repeat_weeks: null,
  },
};
const entry: PendingCreate = { requestId: "request-1", write, savedAt: "2099-01-01T00:00:00.000Z" };
const plan: Plan = {
  id: "plan-1",
  activity_id: "coffee",
  title: "Coffee",
  description: "",
  categories: [],
  starts_at: write.details.starts_at,
  ends_at: write.details.ends_at,
  place_label: "Café",
  note: "",
  status: "active",
  version: 1,
  time_zone: "UTC",
  area: "",
  place_tbd: false,
  repeat_weeks: null,
  series_id: "series-1",
  repeats_from: null, admins: [],
};

function setup(gateway: Partial<PlanGateway>) {
  const values = new Map<string, string>();
  const journal = createJournalStore({
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => void values.set(k, v),
    removeItem: async (k) => void values.delete(k),
  });
  const calls = { create: 0 };
  const full: PlanGateway = {
    read: async () => null,
    create: async () => void calls.create++,
    update: async () => {},
    cancel: async () => 2,
    ...gateway,
  };
  return { journal, calls, gateway: full };
}

test("no entry: nothing to do", async () => {
  const { journal, gateway, calls } = setup({});
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan: null });
  assert.equal(calls.create, 0);
});

test("the plan is already there: no create, the entry is cleared", async () => {
  const { journal, gateway, calls } = setup({ read: async () => plan });
  await journal.put("a", entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan });
  assert.equal(calls.create, 0);
  assert.equal(await journal.read("a"), null);
});

test("the plan is absent: one create, the entry is cleared", async () => {
  let created = false;
  const { journal, gateway, calls } = setup({
    read: async () => (created ? plan : null),
    create: async () => {
      created = true;
      calls.create++;
    },
  });
  await journal.put("a", entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan });
  assert.equal(calls.create, 1);
  assert.equal(await journal.read("a"), null);
});

test("an unknown outcome keeps the entry", async () => {
  const { journal, gateway } = setup({
    create: async () => {
      throw new PlanSaveError("offline", true);
    },
  });
  await journal.put("a", entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan: null });
  assert.deepEqual(await journal.read("a"), entry);
});

test("a definite refusal clears the entry", async () => {
  const { journal, gateway } = setup({
    create: async () => {
      throw Object.assign(new Error("denied"), { code: "42501" });
    },
  });
  await journal.put("a", entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan: null });
  assert.equal(await journal.read("a"), null);
});

test("a failed read after the reconcile keeps the entry", async () => {
  let reads = 0;
  const { journal, gateway } = setup({
    read: async () => {
      if (++reads === 2) throw new Error("offline");
      return plan;
    },
  });
  await journal.put("a", entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan: null });
  assert.deepEqual(await journal.read("a"), entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan });
  assert.equal(await journal.read("a"), null);
});

test("a stray error keeps the entry", async () => {
  const { journal, gateway } = setup({
    create: async () => {
      throw new TypeError("boom");
    },
  });
  await journal.put("a", entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan: null });
  assert.deepEqual(await journal.read("a"), entry);
});

test("a plan that moved on is returned and the entry is cleared", async () => {
  const moved: Plan = { ...plan, version: 5, title: "Changed by someone" };
  const { journal, gateway } = setup({ read: async () => moved });
  await journal.put("a", entry);
  assert.deepEqual(await reconcilePendingCreate("a", gateway, journal), { plan: moved });
  assert.equal(await journal.read("a"), null);
});
