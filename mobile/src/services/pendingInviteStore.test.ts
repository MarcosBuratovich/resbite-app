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

test("a tick GI2 kept goes with the invite", async () => {
  const disk = memory();
  const store = createPendingInviteStore(disk, () => {});
  disk.data.set("resbite.pending-terms", "2026-10");
  await store.remember(code);
  assert.equal(disk.data.get("resbite.pending-invite"), code);
  await store.remember(null);
  assert.equal(disk.data.size, 0);

  disk.data.set("resbite.pending-terms", "2026-10");
  await store.remember(code);
  await store.clear();
  assert.equal(disk.data.size, 0);
});

test("an invite is refused while sign-out is in progress", async () => {
  const kept: (string | null)[] = [];
  const disk = memory();
  const store = createPendingInviteStore(disk, (token) => kept.push(token));
  const unblock = store.beginCleanup();
  await assert.rejects(store.remember(code), /Sign-out/);
  unblock();
  await store.remember(code);
  assert.equal(disk.data.get("resbite.pending-invite"), code);
  assert.deepEqual(kept, [code]);
});
