import test from "node:test";
import assert from "node:assert/strict";
import { createRecentPlacesStore, RECENT_PLACES_MAX } from "./recentPlacesStore.ts";

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

test("newest first, deduplicated regardless of case, at most five, blanks ignored", async () => {
  const store = createRecentPlacesStore(memory());
  for (const place of ["Riverside park", "Old mill", "Café Nero", "riverside PARK ", "  ", "Library", "Station", "Market"])
    await store.remember("owner", place);
  assert.equal(RECENT_PLACES_MAX, 5);
  assert.deepEqual(await store.list("owner"), ["Market", "Station", "Library", "riverside PARK", "Café Nero"]);
});

test("places are per scope on this device, and clear removes only that scope", async () => {
  const disk = memory();
  const store = createRecentPlacesStore(disk);
  await store.remember("owner", "Riverside park");
  await store.remember("preview", "Preview café");
  assert.deepEqual(await store.list("other"), []);
  assert.deepEqual([...disk.data.keys()].sort(), [
    "resbite.recent-places.v1.owner",
    "resbite.recent-places.v1.preview",
  ]);
  await store.clear("owner");
  assert.deepEqual(await store.list("owner"), []);
  assert.deepEqual(await store.list("preview"), ["Preview café"]);
});

test("a session change before the write keeps the place off the device", async () => {
  const disk = memory();
  const store = createRecentPlacesStore(disk);
  await assert.rejects(
    store.remember("owner", "Riverside park", () => {
      throw Error("Session changed. Please try again.");
    }),
    /Session changed/,
  );
  assert.equal(disk.data.size, 0);
});

test("unreadable saved places read as none and the next save replaces them", async () => {
  const disk = memory();
  disk.data.set("resbite.recent-places.v1.owner", "{not json");
  const store = createRecentPlacesStore(disk);
  assert.deepEqual(await store.list("owner"), []);
  await store.remember("owner", "Riverside park");
  assert.deepEqual(await store.list("owner"), ["Riverside park"]);
  disk.data.set("resbite.recent-places.v1.owner", JSON.stringify(["Old mill", 7, ""]));
  assert.deepEqual(await store.list("owner"), ["Old mill"]);
});

test("an assert captured before a session change keeps the place off the device", async () => {
  const disk = memory();
  const store = createRecentPlacesStore(disk);
  let epoch = 0;
  const capture = () => {
    const version = epoch;
    return () => {
      if (version !== epoch) throw Error("Session changed. Please try again.");
    };
  };
  const assertSession = capture();
  epoch++; // sign-out completes while the save is still in flight
  await assert.rejects(store.remember("owner", "Riverside park", assertSession), /Session changed/);
  assert.equal(disk.data.size, 0);
});
