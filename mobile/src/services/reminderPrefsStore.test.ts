import test from "node:test";
import assert from "node:assert/strict";
import { createReminderPrefsStore, MUTED_MAX } from "./reminderPrefsStore.ts";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}

test("reminders start on, with nothing muted and the sheet not shown yet", async () => {
  const store = createReminderPrefsStore(memory());
  assert.deepEqual(await store.read("owner"), { enabled: true, muted: [], asked: false });
});

test("the switches are saved per scope and clear removes only that scope", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  assert.deepEqual(await store.setEnabled("owner", false), { enabled: false, muted: [], asked: false });
  await store.setMuted("owner", "plan-1", true);
  await store.markAsked("owner");
  await store.setMuted("preview", "plan-9", true);
  assert.deepEqual(await store.read("owner"), { enabled: false, muted: ["plan-1"], asked: true });
  assert.deepEqual([...disk.data.keys()].sort(), [
    "resbite.reminder-prefs.v1.owner",
    "resbite.reminder-prefs.v1.preview",
  ]);
  await store.clear("owner");
  assert.deepEqual(await store.read("owner"), { enabled: true, muted: [], asked: false });
  assert.deepEqual((await store.read("preview")).muted, ["plan-9"]);
});

test("muting is per event, never duplicated, and unmuting removes it", async () => {
  const store = createReminderPrefsStore(memory());
  await store.setMuted("owner", "plan-1", true);
  await store.setMuted("owner", "plan-2", true);
  await store.setMuted("owner", "plan-1", true);
  assert.deepEqual((await store.read("owner")).muted, ["plan-2", "plan-1"]);
  assert.deepEqual((await store.setMuted("owner", "plan-2", false)).muted, ["plan-1"]);
  for (let i = 0; i < MUTED_MAX + 5; i++) await store.setMuted("owner", `p${i}`, true);
  const { muted } = await store.read("owner");
  assert.equal(muted.length, MUTED_MAX);
  assert.equal(muted.at(-1), `p${MUTED_MAX + 4}`);
  assert.equal(muted.includes("plan-1"), false);
});

test("unreadable or partly invalid data reads as the defaults, field by field", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  const key = "resbite.reminder-prefs.v1.owner";
  for (const raw of ["{not json", "null", "7", "[]"]) {
    disk.data.set(key, raw);
    assert.deepEqual(await store.read("owner"), { enabled: true, muted: [], asked: false });
  }
  disk.data.set(key, JSON.stringify({ enabled: "no", muted: ["a", 3, "", "a", "b"], asked: "yes" }));
  assert.deepEqual(await store.read("owner"), { enabled: true, muted: ["a", "b"], asked: false });
  disk.data.set(key, "{not json");
  assert.deepEqual(await store.setEnabled("owner", false), { enabled: false, muted: [], asked: false });
});

test("a storage failure reads as the defaults, but a failed save is reported", async () => {
  const store = createReminderPrefsStore({
    getItem: async () => {
      throw Error("locked");
    },
    setItem: async () => {},
    removeItem: async () => {},
  });
  assert.deepEqual(await store.read("owner"), { enabled: true, muted: [], asked: false });
  await assert.rejects(store.setEnabled("owner", false), /locked/);
});

test("a session change before the write keeps the switch off the device", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  await assert.rejects(
    store.setMuted("owner", "plan-1", true, () => {
      throw Error("Session changed. Please try again.");
    }),
    /Session changed/,
  );
  assert.equal(disk.data.size, 0);
});
