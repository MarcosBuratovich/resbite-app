import test from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_RECORDS_MAX, createCalendarRecordStore } from "./calendarRecordStore.ts";

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
const record = { starts_at: "2099-01-01T10:00:00Z", ends_at: null, place_label: "Riverside park" };

test("an added event is remembered per scope with what it was added with; clear removes only that scope", async () => {
  const disk = memory();
  const store = createCalendarRecordStore(disk);
  assert.equal(await store.get("owner", "plan-1"), null);
  await store.remember("owner", "plan-1", record);
  await store.remember("preview", "plan-9", record);
  assert.deepEqual(await store.get("owner", "plan-1"), record);
  assert.equal(await store.get("owner", "plan-9"), null);
  assert.deepEqual([...disk.data.keys()].sort(), [
    "resbite.calendar-records.v1.owner",
    "resbite.calendar-records.v1.preview",
  ]);
  await store.clear("owner");
  assert.equal(await store.get("owner", "plan-1"), null);
  assert.deepEqual(await store.get("preview", "plan-9"), record);
});

test("adding again (Update calendar) replaces the record, and the oldest drop off past the limit", async () => {
  const store = createCalendarRecordStore(memory());
  await store.remember("owner", "plan-1", record);
  const moved = { starts_at: "2099-01-02T10:00:00Z", ends_at: "2099-01-02T12:00:00Z", place_label: "Old mill" };
  await store.remember("owner", "plan-1", moved);
  assert.deepEqual(await store.get("owner", "plan-1"), moved);
  for (let i = 0; i < CALENDAR_RECORDS_MAX; i++) await store.remember("owner", `p${i}`, record);
  assert.equal(await store.get("owner", "plan-1"), null);
  assert.deepEqual(await store.get("owner", `p${CALENDAR_RECORDS_MAX - 1}`), record);
  assert.deepEqual(await store.get("owner", "p0"), record);
});

test("unreadable or invalid records read as not added, and the next add replaces them", async () => {
  const disk = memory();
  const store = createCalendarRecordStore(disk);
  const key = "resbite.calendar-records.v1.owner";
  disk.data.set(key, "{not json");
  assert.equal(await store.get("owner", "plan-1"), null);
  await store.remember("owner", "plan-1", record);
  assert.deepEqual(await store.get("owner", "plan-1"), record);
  disk.data.set(
    key,
    JSON.stringify([{ planId: "plan-1", starts_at: 7 }, { planId: "plan-2", ...record, ends_at: undefined }, { planId: "plan-3", ...record }]),
  );
  assert.equal(await store.get("owner", "plan-1"), null);
  assert.equal(await store.get("owner", "plan-2"), null);
  assert.deepEqual(await store.get("owner", "plan-3"), record);
  const broken = createCalendarRecordStore({ ...disk, getItem: async () => Promise.reject(Error("locked")) });
  assert.equal(await broken.get("owner", "plan-3"), null);
});

test("a session change before the write keeps the record off the device", async () => {
  const disk = memory();
  const store = createCalendarRecordStore(disk);
  await assert.rejects(
    store.remember("owner", "plan-1", record, () => {
      throw Error("Session changed. Please try again.");
    }),
    /Session changed/,
  );
  assert.equal(disk.data.size, 0);
});
