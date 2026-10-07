import test from "node:test";
import assert from "node:assert/strict";
import { createReceiptPurgeHandler } from "./deletion-receipt-retention.ts";
const secret = "synthetic-worker-secret-only-123456789";
const req = (token = secret, method = "POST") =>
  new Request("https://fixture.invalid", {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
test("receipt purge is disabled by default and cannot be triggered by client payload", async () => {
  let calls = 0;
  const handler = createReceiptPurgeHandler(
    async () => {
      calls++;
      return 1;
    },
    false,
    secret,
  );
  assert.equal((await handler(req())).status, 503);
  assert.equal(calls, 0);
});
test("only authorized POST invokes bounded purge", async () => {
  let calls = 0;
  const handler = createReceiptPurgeHandler(
    async () => {
      calls++;
      return 3;
    },
    true,
    secret,
  );
  assert.equal((await handler(req("wrong"))).status, 401);
  assert.equal((await handler(req(secret, "GET"))).status, 405);
  assert.equal(calls, 0);
  assert.deepEqual(await (await handler(req())).json(), { receiptsPurged: 3 });
  assert.equal(calls, 1);
});
test("purge failures and invalid results expose no receipt or upstream details", async () => {
  const handler = createReceiptPurgeHandler(
    async () => {
      throw Error("private upstream contents");
    },
    true,
    secret,
  );
  const failure = await handler(req());
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes("private upstream"), false);
  assert.equal(
    (await createReceiptPurgeHandler(async () => 101, true, secret)(req()))
      .status,
    503,
  );
  assert.equal(
    (await createReceiptPurgeHandler(async () => 0, true, "short")(req()))
      .status,
    503,
  );
});
