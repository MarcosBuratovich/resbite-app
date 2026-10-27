import test from "node:test";
import assert from "node:assert/strict";
import { foldLanded, foldPhoneAccount, retryFold, sendFoldCode, type FoldClientDeps } from "./phoneFold";
import { PHONE_COPY } from "../domain/phoneCopy";
import { PHONE_CODE_COPY } from "./phoneCode";

const phone = "+447700900834";

function harness(o: { status?: number; verify?: { status?: number; message: string } | null; exchange?: string | null; throwCall?: boolean; appToken?: string | null; now?: number } = {}) {
  const calls = { otp: [] as unknown[], verify: [] as unknown[], exchange: [] as unknown[], fold: [] as unknown[], mainAuth: 0 };
  const d: FoldClientDeps = {
    signInWithOtp: async (a) => (calls.otp.push(a), { error: null }),
    verifyOtp: async (a) => (calls.verify.push(a), { error: o.verify ?? null, accessToken: "foreign" }),
    exchangeTestCode: async (p, c) => (calls.exchange.push([p, c]), o.exchange ?? null),
    appAccessToken: async () => (o.appToken === undefined ? "app" : o.appToken),
    callFold: async (a) => {
      calls.fold.push(a);
      if (o.throwCall) throw new Error("offline");
      return { status: o.status ?? 200 };
    },
    now: () => o.now ?? 1_000,
  };
  return { d, calls };
}

test("the code goes to the isolated client with shouldCreateUser off", async () => {
  const h = harness();
  assert.deepEqual(await sendFoldCode(h.d, phone), { ok: true, resendAt: 61_000 });
  assert.deepEqual(h.calls.otp, [{ phone, options: { shouldCreateUser: false } }]);
  assert.equal(h.calls.mainAuth, 0);
});

test("000000 is swapped for the stored code before the isolated verify", async () => {
  const h = harness({ exchange: "123456" });
  assert.deepEqual(await foldPhoneAccount(h.d, phone, "000000", 1_000), { ok: true });
  assert.deepEqual(h.calls.exchange, [[phone, "000000"]]);
  assert.deepEqual(h.calls.verify, [{ phone, token: "123456", type: "sms" }]);
});

test("the function call carries both tokens", async () => {
  const h = harness();
  await foldPhoneAccount(h.d, phone, "123 456", 1_000);
  assert.deepEqual(h.calls.exchange, []);
  assert.deepEqual(h.calls.fold, [{ appToken: "app", body: { foreign_token: "foreign", phone } }]);
});

test("503, 403, 409, 401, 500 and connection failures map to their copy", async () => {
  const r = async (o: Parameters<typeof harness>[0]) => foldPhoneAccount(harness(o).d, phone, "123456", 1_000);
  assert.deepEqual(await r({ status: 503 }), { ok: false, message: PHONE_COPY.foldOff, clear: false, verified: true, blocked: true });
  assert.equal(PHONE_COPY.foldOff, "Bringing an invitation into this account isn’t switched on yet.");
  for (const status of [403, 409]) assert.deepEqual(await r({ status }), { ok: false, message: PHONE_COPY.taken, clear: false, verified: true });
  assert.deepEqual(await r({ status: 401 }), { ok: false, message: PHONE_COPY.foldGone, clear: false, gone: true });
  assert.deepEqual(await r({ status: 500 }), { ok: false, message: PHONE_CODE_COPY.connection, clear: false, verified: true, foreignToken: "foreign" });
  assert.deepEqual(await r({ throwCall: true }), { ok: false, message: PHONE_CODE_COPY.connection, clear: false, verified: true, foreignToken: "foreign" });
});

test("a wrong or expired code never reaches the function", async () => {
  const bad = { status: 400, message: "Token has expired or is invalid" };
  const a = harness({ verify: bad });
  assert.deepEqual(await foldPhoneAccount(a.d, phone, "123456", 1_000), { ok: false, message: PHONE_CODE_COPY.mismatch, clear: true });
  const b = harness({ verify: bad, now: 700_000 });
  assert.deepEqual(await foldPhoneAccount(b.d, phone, "123456", 1_000), { ok: false, message: PHONE_CODE_COPY.expired, clear: true });
  const c = harness({ verify: { status: 0, message: "x" } });
  assert.deepEqual(await foldPhoneAccount(c.d, phone, "123456", 1_000), { ok: false, message: PHONE_CODE_COPY.connection, clear: false });
  assert.deepEqual(await foldPhoneAccount(harness().d, phone, "12345", 1_000), { ok: false, message: PHONE_CODE_COPY.mismatch, clear: true });
  for (const h of [a, b, c]) assert.deepEqual(h.calls.fold, []);
});

test("a signed-out app session calls nothing", async () => {
  const h = harness({ appToken: null });
  assert.equal((await foldPhoneAccount(h.d, phone, "123456", 1_000)).ok, false);
  assert.deepEqual(h.calls.fold, []);
});

test("the deps expose no way to touch the app's auth session", () => {
  assert.deepEqual(Object.keys(harness().d).sort(), ["appAccessToken", "callFold", "exchangeTestCode", "now", "signInWithOtp", "verifyOtp"]);
});

test("a 500 then a retry with the kept token posts again without verifying again", async () => {
  const h = harness({ status: 500 });
  const first = await foldPhoneAccount(h.d, phone, "123456", 1_000);
  assert.equal(first.ok, false);
  const token = !first.ok ? first.foreignToken : undefined;
  assert.equal(token, "foreign");
  const second = await retryFold(h.d, phone, token!);
  assert.equal(second.ok, false);
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.fold.length, 2);
  const ok = harness();
  assert.deepEqual(await retryFold(ok.d, phone, "foreign"), { ok: true });
  assert.deepEqual(ok.calls.verify, []);
});

test("503 keeps no token and a lost reply counts as done once the account holds the number", async () => {
  const off = await foldPhoneAccount(harness({ status: 503 }).d, phone, "123456", 1_000);
  assert.equal(!off.ok && off.foreignToken, undefined);
  const lost = await foldPhoneAccount(harness({ throwCall: true }).d, phone, "123456", 1_000);
  assert.equal(!lost.ok && lost.verified, true);
  const held = { phone: "447700900834", phone_confirmed_at: "2026-10-27T00:00:00Z" };
  assert.equal(foldLanded(held as never, phone), true);
  assert.equal(foldLanded({ phone: "447700900835", phone_confirmed_at: "x" } as never, phone), false);
  assert.equal(foldLanded(null, phone), false);
});
