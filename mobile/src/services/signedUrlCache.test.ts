import test from "node:test";
import assert from "node:assert/strict";
import { createSignedUrlCache } from "./signedUrlCache.ts";

test("signed links are reused until the cache window ends, then signed again", async () => {
  let now = 0;
  let calls = 0;
  const cache = createSignedUrlCache(async (path) => `${path}?v=${++calls}`, {
    ttlMs: 1000,
    now: () => now,
  });
  assert.equal(await cache.get("a"), "a?v=1");
  assert.equal(await cache.get("a"), "a?v=1");
  assert.equal(cache.peek("a"), "a?v=1");
  now = 1001;
  assert.equal(cache.peek("a"), null);
  assert.equal(await cache.get("a"), "a?v=2");
});

test("concurrent requests for the same cover share one signing call", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = createSignedUrlCache(async (path) => {
    calls++;
    await gate;
    return `${path}?signed`;
  });
  const both = Promise.all([cache.get("a"), cache.get("a")]);
  release();
  assert.deepEqual(await both, ["a?signed", "a?signed"]);
  assert.equal(calls, 1);
});

test("a failed signing is not cached and can be retried", async () => {
  let fail = true;
  const cache = createSignedUrlCache(async (path) => {
    if (fail) throw Error("offline");
    return `${path}?ok`;
  });
  await assert.rejects(cache.get("a"), /offline/);
  fail = false;
  assert.equal(await cache.get("a"), "a?ok");
});
