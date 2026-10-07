import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeAccountAccess,
  readAccountAccess,
  type AccountAccessAdapter,
} from "./accountAccess";

const accountId = "10000000-0000-4000-8000-000000000001";
const options = { accountId, assertCurrent() {} };
function adapter(status: unknown = "approved"): AccountAccessAdapter {
  return {
    async sessionAccountId() { return accountId; },
    async readStatus() { return { account_id: accountId, status }; },
  };
}

test("server access states are decoded only for the captured account", async () => {
  for (const status of ["approved", "unconfirmed", "access_pending"] as const)
    assert.equal(await readAccountAccess(options, adapter(status)), status);
  assert.throws(() => decodeAccountAccess({ account_id: "another", status: "approved" }, accountId));
  for (const value of [null, [], {}, "approved", { account_id: accountId, status: "unknown" }])
    assert.throws(() => decodeAccountAccess(value, accountId));
});

test("a signed-out or replaced account cannot read or publish approval", async () => {
  let reads = 0;
  const port = adapter();
  port.sessionAccountId = async () => null;
  port.readStatus = async () => { reads++; return null; };
  await assert.rejects(readAccountAccess(options, port), /Account changed/);
  assert.equal(reads, 0);
  let sessions = 0;
  port.sessionAccountId = async () => ++sessions === 1 ? accountId : "another";
  port.readStatus = adapter().readStatus;
  await assert.rejects(readAccountAccess(options, port), /Account changed/);
});

test("a session generation change during the RPC rejects even if the ID is reused", async () => {
  let current = true;
  const port = adapter();
  port.readStatus = async () => {
    current = false;
    return { account_id: accountId, status: "approved" };
  };
  await assert.rejects(readAccountAccess({
    accountId,
    assertCurrent() { if (!current) throw Error("Stale session"); },
  }, port), /Stale session/);
});

test("missing RPC, transport failure and malformed responses never imply approval", async () => {
  const port = adapter();
  port.readStatus = async () => { throw Error("RPC unavailable"); };
  await assert.rejects(readAccountAccess(options, port), /RPC unavailable/);
  port.readStatus = async () => null;
  await assert.rejects(readAccountAccess(options, port), /could not be checked/);
});

test("deadline settles a hung request and aborts the RPC", async () => {
  const port = adapter();
  let signal: AbortSignal | undefined;
  let finish!: (value: unknown) => void;
  let sessionReads = 0;
  port.sessionAccountId = async () => { sessionReads++; return accountId; };
  port.readStatus = async (value) => {
    signal = value;
    return new Promise((resolve) => { finish = resolve; });
  };
  await assert.rejects(readAccountAccess({ ...options, timeoutMs: 10 }, port), /timed out/);
  assert.equal(signal?.aborted, true);
  finish({ account_id: accountId, status: "approved" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sessionReads, 1);
});

test("deadline covers session lookup and prevents a late RPC", async () => {
  const port = adapter();
  let finish!: (value: string) => void;
  let reads = 0;
  port.sessionAccountId = async () => new Promise((resolve) => { finish = resolve; });
  port.readStatus = async () => { reads++; return null; };
  await assert.rejects(readAccountAccess({ ...options, timeoutMs: 10 }, port), /timed out/);
  finish(accountId);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 0);
});
