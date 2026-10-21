import test from "node:test";
import assert from "node:assert/strict";
import { createPendingInviteStore } from "./pendingInviteStore";

const code = "A".repeat(22);

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

test("the kept tick is stored and cleared with the invite", async () => {
  const disk = memory();
  const store = createPendingInviteStore(disk, () => {});
  assert.equal(await store.readTerms(), null);
  await store.remember(code);
  await store.rememberTerms("2026-10");
  assert.equal(await store.readTerms(), "2026-10");
  assert.equal(disk.data.get("resbite.pending-terms"), "2026-10");
  await store.remember(null);
  assert.equal(await store.readTerms(), null);

  await store.remember(code);
  await store.rememberTerms("2026-10");
  await store.clear();
  assert.equal(await store.readTerms(), null);
  assert.equal(disk.data.size, 0);

  await store.rememberTerms("2026-10");
  await store.rememberTerms(null);
  assert.equal(await store.readTerms(), null);
});
