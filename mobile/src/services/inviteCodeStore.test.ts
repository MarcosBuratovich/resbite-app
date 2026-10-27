import test from "node:test";
import assert from "node:assert/strict";
import { createInviteCodeStore } from "./inviteCodeStore";

function disk() {
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
const a = { code: "A".repeat(22), name: "Alex" };
const b = { code: "B".repeat(22), name: "Bea", sentVia: "whatsapp" as const };

test("codes round-trip per scope and plan", async () => {
  const d = disk();
  const store = createInviteCodeStore(d);
  assert.deepEqual(await store.get("u1", "p1"), {});
  await store.put("u1", "p1", "+447700900201", a);
  await store.put("u1", "p1", "+447700900202", b);
  await store.put("u1", "p2", "+447700900201", b);
  await store.put("u2", "p1", "+447700900201", b);
  assert.deepEqual(await store.get("u1", "p1"), { "+447700900201": a, "+447700900202": b });
  assert.deepEqual(await store.get("u1", "p2"), { "+447700900201": b });
  assert.deepEqual(await store.get("u2", "p1"), { "+447700900201": b });
  assert.ok(d.data.has("resbite.invite-codes.v1.u1") || [...d.data.keys()].some((k) => k.startsWith("resbite.invite-codes.v1.u1")));
});

test("put replaces an entry; remove drops one; clear wipes the scope only", async () => {
  const store = createInviteCodeStore(disk());
  await store.put("u1", "p1", "+447700900201", a);
  await store.put("u1", "p1", "+447700900202", a);
  await store.put("u1", "p1", "+447700900201", b);
  assert.deepEqual((await store.get("u1", "p1"))["+447700900201"], b);
  await store.remove("u1", "p1", "+447700900201");
  assert.deepEqual(await store.get("u1", "p1"), { "+447700900202": a });
  await store.remove("u1", "p1", "+447700900999");
  await store.put("u2", "p1", "+447700900201", a);
  await store.clear("u1");
  assert.deepEqual(await store.get("u1", "p1"), {});
  assert.deepEqual(await store.get("u2", "p1"), { "+447700900201": a });
});

test("concurrent puts all land", async () => {
  const store = createInviteCodeStore(disk());
  await Promise.all(["1", "2", "3"].map((n) => store.put("u", "p", `+44770090020${n}`, a)));
  assert.equal(Object.keys(await store.get("u", "p")).length, 3);
});

test("a put after suspend rejects, and works again after resume", async () => {
  const d = disk();
  const store = createInviteCodeStore(d);
  store.suspend("u1");
  await assert.rejects(store.put("u1", "p1", "+447700900201", a), { message: "Session changed" });
  assert.equal(d.data.size, 0);
  await store.put("u2", "p1", "+447700900201", a);
  store.resume("u1");
  await store.put("u1", "p1", "+447700900201", a);
  assert.deepEqual(await store.get("u1", "p1"), { "+447700900201": a });
});

test("a put that started before clear cannot recreate the data after it", async () => {
  const d = disk();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  const store = createInviteCodeStore({
    ...d,
    getItem: async (k) => {
      if (first) {
        first = false;
        await gate;
      }
      return d.getItem(k);
    },
  });
  const late = store.put("u1", "p1", "+447700900201", a);
  const cleared = store.clear("u1");
  release();
  await assert.rejects(late, { message: "Session changed" });
  await cleared;
  assert.equal(d.data.size, 0);
});
