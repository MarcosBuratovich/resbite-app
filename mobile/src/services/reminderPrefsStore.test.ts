import test from "node:test";
import assert from "node:assert/strict";
import { createReminderPrefsStore } from "./reminderPrefsStore.ts";

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

test("reminders start on, with neither ask shown yet", async () => {
  const store = createReminderPrefsStore(memory());
  assert.deepEqual(await store.read("owner"), { enabled: true, asked: false, notificationsAsked: false });
});

test("the switches are saved per scope and clear removes only that scope", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  assert.deepEqual(await store.setEnabled("owner", false), { enabled: false, asked: false, notificationsAsked: false });
  await store.markNotificationsAsked("owner");
  await store.setEnabled("preview", false);
  assert.deepEqual(await store.read("owner"), {
    enabled: false,
    asked: false,
    notificationsAsked: true,
  });
  assert.deepEqual([...disk.data.keys()].sort(), [
    "resbite.reminder-prefs.v1.owner",
    "resbite.reminder-prefs.v1.preview",
  ]);
  await store.clear("owner");
  assert.deepEqual(await store.read("owner"), { enabled: true, asked: false, notificationsAsked: false });
  assert.equal((await store.read("preview")).enabled, false);
});

test("UX3’s Get reminders? flag is kept as stored: the notification ask has its own", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  const key = "resbite.reminder-prefs.v1.owner";
  disk.data.set(key, JSON.stringify({ enabled: true, asked: true }));
  assert.deepEqual(await store.read("owner"), { enabled: true, asked: true, notificationsAsked: false });
  // Other switches leave it untouched on the device.
  await store.setEnabled("owner", false);
  assert.equal(JSON.parse(disk.data.get(key)!).asked, true);
  assert.deepEqual(await store.markNotificationsAsked("owner"), {
    enabled: false,
    asked: true,
    notificationsAsked: true,
  });
});

test("a muted list stored by an older version is ignored and dropped on the next save", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  const key = "resbite.reminder-prefs.v1.owner";
  disk.data.set(key, JSON.stringify({ enabled: true, muted: ["plan-1"], asked: false, notificationsAsked: true }));
  assert.deepEqual(await store.read("owner"), { enabled: true, asked: false, notificationsAsked: true });
  await store.setEnabled("owner", false);
  assert.equal("muted" in JSON.parse(disk.data.get(key)!), false);
});

test("unreadable or partly invalid data reads as the defaults, field by field", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  const key = "resbite.reminder-prefs.v1.owner";
  for (const raw of ["{not json", "null", "7", "[]"]) {
    disk.data.set(key, raw);
    assert.deepEqual(await store.read("owner"), { enabled: true, asked: false, notificationsAsked: false });
  }
  disk.data.set(key, JSON.stringify({ enabled: "no", muted: ["a"], asked: "yes", notificationsAsked: 1 }));
  assert.deepEqual(await store.read("owner"), { enabled: true, asked: false, notificationsAsked: false });
  disk.data.set(key, "{not json");
  assert.deepEqual(await store.setEnabled("owner", false), { enabled: false, asked: false, notificationsAsked: false });
});

test("a storage failure reads as the defaults, but a failed save is reported", async () => {
  const store = createReminderPrefsStore({
    getItem: async () => {
      throw Error("locked");
    },
    setItem: async () => {},
    removeItem: async () => {},
  });
  assert.deepEqual(await store.read("owner"), { enabled: true, asked: false, notificationsAsked: false });
  await assert.rejects(store.setEnabled("owner", false), /locked/);
});

test("a session change before the write keeps the switch off the device", async () => {
  const disk = memory();
  const store = createReminderPrefsStore(disk);
  await assert.rejects(
    store.setEnabled("owner", false, () => {
      throw Error("Session changed. Please try again.");
    }),
    /Session changed/,
  );
  assert.equal(disk.data.size, 0);
});
