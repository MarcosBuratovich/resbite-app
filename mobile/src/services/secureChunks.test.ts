import test from "node:test";
import assert from "node:assert/strict";
import { chunkedStorage } from "./secureChunks.ts";
test("large sessions round-trip and replaced chunks are removed", async () => {
  const values = new Map<string, string>();
  let n = 0;
  const storage = chunkedStorage(
    {
      getItem: async (k) => values.get(k) ?? null,
      setItem: async (k, v) => {
        assert.ok(Buffer.byteLength(v) <= 1600);
        values.set(k, v);
      },
      removeItem: async (k) => {
        values.delete(k);
      },
    },
    () => String(++n),
  );
  const session = "x" + "🟢".repeat(4000);
  await storage.setItem("session", session);
  assert.equal(await storage.getItem("session"), session);
  await storage.setItem("session", "new");
  assert.equal(await storage.getItem("session"), "new");
  assert.equal(values.size, 2);
  await storage.removeItem("session");
  assert.equal(values.size, 0);
});
test("failed new session does not destroy the last committed session", async () => {
  const values = new Map<string, string>();
  let fail = false,
    n = 0;
  const storage = chunkedStorage(
    {
      getItem: async (k) => values.get(k) ?? null,
      setItem: async (k, v) => {
        if (fail && k.endsWith(".1")) throw Error("write failed");
        values.set(k, v);
      },
      removeItem: async (k) => {
        values.delete(k);
      },
    },
    () => String(++n),
  );
  await storage.setItem("session", "old");
  fail = true;
  await assert.rejects(storage.setItem("session", "x".repeat(900)));
  assert.equal(await storage.getItem("session"), "old");
  assert.equal(values.size, 2);
});
