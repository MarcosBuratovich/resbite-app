import test from "node:test";
import assert from "node:assert/strict";
import { createChatQueue, type QueuedMessage } from "./chatQueue";

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
const S1 = "0b000000-0000-4000-8000-000000000001";
const S2 = "0b000000-0000-4000-8000-000000000002";
const item = (clientId: string, series = S1, over: Partial<QueuedMessage> = {}): QueuedMessage => ({
  clientId,
  series,
  body: `message ${clientId}`,
  createdAt: "2025-11-15T18:02:00.000Z",
  failed: false,
  ...over,
});

test("put and list keep a series' unsent messages in order, per scope and series", async () => {
  const d = disk();
  const queue = createChatQueue(d);
  assert.deepEqual(await queue.list("u1", S1), []);
  await queue.put("u1", item("c1"));
  await queue.put("u1", item("c2"));
  await queue.put("u1", item("c3", S2));
  await queue.put("u2", item("c4"));
  assert.deepEqual(await queue.list("u1", S1), [item("c1"), item("c2")]);
  assert.deepEqual(await queue.list("u1", S2), [item("c3", S2)]);
  assert.deepEqual(await queue.list("u2", S1), [item("c4")]);
  assert.deepEqual(await queue.list("u2", S2), []);
  assert.deepEqual([...d.data.keys()].sort(), ["resbite.chat-queue.v1.u1", "resbite.chat-queue.v1.u2"]);
});

test("put replaces an item with the same client id in its place", async () => {
  const queue = createChatQueue(disk());
  await queue.put("u1", item("c1"));
  await queue.put("u1", item("c2"));
  await queue.put("u1", item("c1", S1, { body: "edited", failed: true }));
  assert.deepEqual(await queue.list("u1", S1), [item("c1", S1, { body: "edited", failed: true }), item("c2")]);
});

test("update changes failed only; remove drops one; neither creates an item", async () => {
  const queue = createChatQueue(disk());
  await queue.put("u1", item("c1"));
  await queue.put("u1", item("c2"));
  await queue.update("u1", "c1", { failed: true });
  assert.deepEqual(await queue.list("u1", S1), [item("c1", S1, { failed: true }), item("c2")]);
  await queue.update("u1", "c1", { failed: false, body: "changed", series: S2 } as { failed: boolean });
  assert.deepEqual(await queue.list("u1", S1), [item("c1"), item("c2")], "only failed changes");
  await queue.update("u1", "missing", { failed: true });
  await queue.remove("u1", "missing");
  await queue.remove("u1", "c1");
  assert.deepEqual(await queue.list("u1", S1), [item("c2")]);
  await queue.update("u2", "c2", { failed: true });
  assert.deepEqual(await queue.list("u2", S1), [], "another scope's item is not touched or made");
  assert.deepEqual(await queue.list("u1", S1), [item("c2")]);
});

test("clear wipes the scope only", async () => {
  const d = disk();
  const queue = createChatQueue(d);
  await queue.put("u1", item("c1"));
  await queue.put("u2", item("c2"));
  await queue.clear("u1");
  assert.deepEqual(await queue.list("u1", S1), []);
  assert.deepEqual(await queue.list("u2", S1), [item("c2")]);
  assert.equal(d.data.has("resbite.chat-queue.v1.u1"), false);
});

test("concurrent writes all land", async () => {
  const queue = createChatQueue(disk());
  await Promise.all(["c1", "c2", "c3"].map((c) => queue.put("u", item(c))));
  await Promise.all([queue.update("u", "c1", { failed: true }), queue.remove("u", "c2"), queue.put("u", item("c4"))]);
  assert.deepEqual(await queue.list("u", S1), [item("c1", S1, { failed: true }), item("c3"), item("c4")]);
});

test("a write after suspend rejects with Session changed, and works again after resume", async () => {
  const d = disk();
  const queue = createChatQueue(d);
  queue.suspend("u1");
  await assert.rejects(queue.put("u1", item("c1")), { message: "Session changed" });
  await assert.rejects(queue.update("u1", "c1", { failed: true }), { message: "Session changed" });
  await assert.rejects(queue.remove("u1", "c1"), { message: "Session changed" });
  assert.equal(d.data.size, 0);
  await queue.put("u2", item("c2"));
  queue.resume("u1");
  await queue.put("u1", item("c1"));
  assert.deepEqual(await queue.list("u1", S1), [item("c1")]);
});

test("a write issued before clear that finishes after it does not bring the items back", async () => {
  const d = disk();
  d.data.set("resbite.chat-queue.v1.u1", JSON.stringify([item("c0")]));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  const queue = createChatQueue({
    ...d,
    getItem: async (k) => {
      if (first) {
        first = false;
        await gate;
      }
      return d.getItem(k);
    },
  });
  const late = queue.put("u1", item("c1"));
  const cleared = queue.clear("u1");
  release();
  await assert.rejects(late, { message: "Session changed" });
  await cleared;
  assert.equal(d.data.size, 0);
  assert.deepEqual(await queue.list("u1", S1), []);
});

test("a write whose read straddles a suspend does not land", async () => {
  const d = disk();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const reading = new Promise<void>((r) => (started = r));
  const queue = createChatQueue({
    ...d,
    getItem: async (k) => {
      started();
      await gate;
      return d.getItem(k);
    },
  });
  const write = queue.put("u1", item("c1"));
  await reading;
  queue.suspend("u1");
  release();
  await assert.rejects(write, { message: "Session changed" });
  assert.equal(d.data.size, 0);
});

test("a damaged record reads as empty and the next write replaces it; a bad item inside is dropped (D3)", async () => {
  for (const raw of ["{{", "{}", "null", '"x"', JSON.stringify({ c1: item("c1") }), "[[1]]"]) {
    const d = disk();
    d.data.set("resbite.chat-queue.v1.u1", raw);
    const queue = createChatQueue(d);
    assert.deepEqual(await queue.list("u1", S1), [], raw);
    await queue.put("u1", item("c9"));
    assert.deepEqual(JSON.parse(d.data.get("resbite.chat-queue.v1.u1")!), [item("c9")], raw);
  }
  const d = disk();
  const queue = createChatQueue(d);
  d.data.set(
    "resbite.chat-queue.v1.u1",
    JSON.stringify([item("c1"), { clientId: "c2", series: S1 }, null, item("c3", S1, { failed: true })]),
  );
  assert.deepEqual(await queue.list("u1", S1), [item("c1"), item("c3", S1, { failed: true })]);
  await queue.put("u1", item("c4"));
  assert.deepEqual(JSON.parse(d.data.get("resbite.chat-queue.v1.u1")!), [
    item("c1"),
    item("c3", S1, { failed: true }),
    item("c4"),
  ]);
});

test("put and update refuse a partial item or patch, and keep what is there (Q7)", async () => {
  const d = disk();
  const queue = createChatQueue(d);
  await queue.put("u1", item("c1"));
  const before = d.data.get("resbite.chat-queue.v1.u1");
  for (const bad of [null, {}, { clientId: "x" }, { ...item("c2"), failed: "no" }, { ...item("c2"), body: 5 }])
    await assert.rejects(queue.put("u1", bad as unknown as QueuedMessage), /Invalid queued message/, JSON.stringify(bad));
  for (const patch of [{}, { failed: "yes" }, null])
    await assert.rejects(queue.update("u1", "c1", patch as unknown as { failed: boolean }), /Invalid queued message/);
  assert.equal(d.data.get("resbite.chat-queue.v1.u1"), before);
  assert.deepEqual(await queue.list("u1", S1), [item("c1")]);
});

test("an account holds at most 100 unsent messages (H20)", async () => {
  const queue = createChatQueue(disk());
  for (let i = 0; i < 100; i++) await queue.put("u1", item(`c${i}`, i % 2 ? S1 : S2));
  await assert.rejects(queue.put("u1", item("c100")), /Too many unsent messages/);
  await queue.put("u1", item("c5", S1, { failed: true }));
  await queue.put("u2", item("c100"));
  await queue.remove("u1", "c0");
  await queue.put("u1", item("c100"));
  const all = [...(await queue.list("u1", S1)), ...(await queue.list("u1", S2))];
  assert.equal(all.length, 100);
  assert.equal(all.find((i) => i.clientId === "c5")?.failed, true);
  assert.deepEqual(await queue.list("u2", S1), [item("c100")]);
});
