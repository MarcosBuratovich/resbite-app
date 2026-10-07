import test from "node:test";
import assert from "node:assert/strict";
import { createDraftStore, type PlanDraft } from "./draftStore";
import { reconcilePlan, PlanSaveError } from "../domain/plans";
const fixture = (scope = "account-a"): PlanDraft => ({
  schema: 1,
  scope,
  key: "new-coffee",
  activityId: "coffee",
  requestId: "request-1",
  original: null,
  initial: "[]",
  start: "2099-01-01 12:00",
  place: "Café",
  note: "By the window",
  zone: "UTC",
  pending: null,
  updatedAt: new Date().toISOString(),
});
function memory() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: async (k: string) => values.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        values.set(k, v);
      },
      removeItem: async (k: string) => {
        values.delete(k);
      },
    },
  };
}
test("drafts survive store recreation and remain scoped to their account", async () => {
  const { storage } = memory();
  const first = createDraftStore(storage);
  await first.put(fixture());
  await first.put({ ...fixture(), key: "edit-other", place: "Park" });
  const restored = createDraftStore(storage);
  assert.equal((await restored.list("account-a")).length, 2);
  assert.deepEqual(await restored.list("account-b"), []);
  assert.deepEqual(await restored.list("preview"), []);
  assert.equal((await restored.list("account-a"))[1].note, "By the window");
});
test("queued writes cannot resurrect a cleared draft; other drafts survive", async () => {
  const { storage } = memory();
  const drafts = createDraftStore(storage);
  await Promise.all([
    drafts.put(fixture()),
    drafts.put({ ...fixture(), key: "edit-other" }),
    drafts.put({ ...fixture(), note: "Latest" }),
    drafts.remove("account-a", "new-coffee"),
  ]);
  assert.deepEqual(
    (await drafts.list("account-a")).map((d) => d.key),
    ["edit-other"],
  );
});
test("failed persistence rejects and a later retry can succeed", async () => {
  const { storage } = memory();
  let fail = true;
  const drafts = createDraftStore({
    ...storage,
    setItem: async (k, v) => {
      if (fail) throw Error("Full");
      await storage.setItem(k, v);
    },
  });
  await assert.rejects(drafts.put(fixture()));
  fail = false;
  await drafts.put(fixture());
  assert.equal((await drafts.list("account-a")).length, 1);
});
const write = {
  id: "request-1",
  activityId: "coffee",
  details: {
    starts_at: "2099-01-01T12:00:00Z",
    time_zone: "UTC",
    place_label: "Café",
    note: "By the window",
  },
};
const plan = {
  id: write.id,
  activity_id: "coffee",
  ...write.details,
  status: "active",
  version: 1,
};
test("restart recovery acknowledges a committed create or edit without another write", async () => {
  const unexpected = async () => {
    throw Error("Must not write");
  };
  await reconcilePlan(
    { read: async () => plan, create: unexpected, update: unexpected },
    write,
  );
  await reconcilePlan(
    {
      read: async () => ({ ...plan, version: 3 }),
      create: unexpected,
      update: unexpected,
    },
    { ...write, version: 2 },
  );
});
test("restart recovery retries an absent create with the same identifier and payload", async () => {
  let sent: unknown;
  await reconcilePlan(
    {
      read: async () => null,
      create: async (w) => {
        sent = w;
      },
      update: async () => {
        throw Error("wrong operation");
      },
    },
    write,
  );
  assert.deepEqual(sent, write);
});
test("restart recovery preserves conflicts and cannot write when reconciliation is offline", async () => {
  let writes = 0;
  const mutate = async () => {
    writes++;
  };
  await assert.rejects(
    reconcilePlan(
      {
        read: async () => ({ ...plan, version: 3, note: "Changed" }),
        create: mutate,
        update: mutate,
      },
      write,
    ),
    (e: unknown) => e instanceof PlanSaveError && e.latest?.version === 3,
  );
  await assert.rejects(
    reconcilePlan(
      {
        read: async () => {
          throw Error("Offline");
        },
        create: mutate,
        update: mutate,
      },
      write,
    ),
    (e: unknown) => e instanceof PlanSaveError && e.uncertain,
  );
  assert.equal(writes, 0);
});

test("account deletion clears all drafts and rejects delayed writes without touching another account", async () => {
  const { storage } = memory();
  const drafts = createDraftStore(storage);
  await drafts.put(fixture());
  await drafts.put(fixture("account-b"));
  const late = drafts.put({ ...fixture(), note: "stale input" });
  const clear = drafts.clearScope("account-a");
  await assert.rejects(late, /deletion/);
  await clear;
  await assert.rejects(drafts.put(fixture()), /deletion/);
  assert.deepEqual(await drafts.list("account-a"), []);
  assert.equal((await drafts.list("account-b")).length, 1);
});

test("drafts saved before custom events still load without event fields", async () => {
  const { storage } = memory();
  const drafts = createDraftStore(storage);
  await drafts.put(fixture());
  const [legacy] = await drafts.list("account-a");
  assert.equal(legacy.title, undefined);
  assert.equal(legacy.activityId, "coffee");
});

test("a blank event draft has no idea and keeps its event fields", async () => {
  const { storage } = memory();
  const drafts = createDraftStore(storage);
  await drafts.put({
    ...fixture(),
    key: "new",
    activityId: null,
    title: "Garden picnic",
    description: "Bring a blanket",
    categories: ["natural", "community"],
  });
  const [blank] = await createDraftStore(storage).list("account-a");
  assert.equal(blank.activityId, null);
  assert.equal(blank.title, "Garden picnic");
  assert.deepEqual(blank.categories, ["natural", "community"]);
});

test("corrupt event fields are rejected rather than half-restored", async () => {
  for (const corrupt of [{ activityId: 5 }, { categories: "natural" }, { title: 3 }]) {
    const { storage, values } = memory();
    values.set("resbite.drafts.v1.account-a", JSON.stringify([{ ...fixture(), ...corrupt }]));
    await assert.rejects(createDraftStore(storage).list("account-a"), /Could not read saved drafts/);
  }
});
