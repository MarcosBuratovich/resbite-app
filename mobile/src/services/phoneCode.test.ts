import test from "node:test";
import assert from "node:assert/strict";
import { PHONE_CODE_COPY, sendPhoneCode, verifyPhoneCode, type AuthError, type PhoneCodeDeps } from "./phoneCode";

const phone = "+447700900834";
const wait = "Wait a minute, then send a new code.";
const connection = "Check your connection and try again.";
const mismatch = "That code doesn’t match. Try again.";
const expired = "That code has expired. Send a new one.";

function harness(o: { otp?: AuthError; verify?: AuthError; exchange?: string | null | "throw"; now?: number } = {}) {
  const calls = {
    signInWithOtp: [] as Parameters<PhoneCodeDeps["signInWithOtp"]>[0][],
    updatePhone: [] as string[],
    verifyOtp: [] as Parameters<PhoneCodeDeps["verifyOtp"]>[0][],
    exchange: [] as [string, string][],
  };
  const d: PhoneCodeDeps = {
    signInWithOtp: async (a) => (calls.signInWithOtp.push(a), { error: o.otp ?? null }),
    updatePhone: async (p) => (calls.updatePhone.push(p), { error: o.otp ?? null }),
    verifyOtp: async (a) => (calls.verifyOtp.push(a), { error: o.verify ?? null }),
    exchangeTestCode: async (p, c) => {
      calls.exchange.push([p, c]);
      if (o.exchange === "throw") throw new Error("offline");
      return o.exchange ?? null;
    },
    now: () => o.now ?? 1_000,
  };
  return { d, calls };
}

test("signup and signin choose shouldCreateUser, add updates the phone", async () => {
  const h = harness();
  assert.deepEqual(await sendPhoneCode(h.d, phone, "signup"), { ok: true, resendAt: 61_000 });
  await sendPhoneCode(h.d, phone, "signin");
  await sendPhoneCode(h.d, phone, "add");
  assert.deepEqual(h.calls.signInWithOtp, [
    { phone, options: { shouldCreateUser: true } },
    { phone, options: { shouldCreateUser: false } },
  ]);
  assert.deepEqual(h.calls.updatePhone, [phone]);
});

test("send errors map to copy and reasons", async () => {
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: "x", code: "otp_disabled", status: 422 } }).d, phone, "signin"), {
    ok: false,
    reason: "no_account",
    message: PHONE_CODE_COPY.noAccount,
  });
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: "x", code: "phone_exists", status: 422 } }).d, phone, "add"), {
    ok: false,
    reason: "taken",
    message: PHONE_CODE_COPY.taken,
  });
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: "x", status: 429 } }).d, phone, "signup"), { ok: false, message: wait });
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: "x", status: 0 } }).d, phone, "signup"), { ok: false, message: connection });
});

test("test mode swaps 000000 for the stored code", async () => {
  const h = harness({ exchange: "123456" });
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "000000", 1_000, "signin"), { ok: true });
  assert.deepEqual(h.calls.verifyOtp, [{ phone, token: "123456", type: "sms" }]);
  const a = harness({ exchange: "123456" });
  await verifyPhoneCode(a.d, phone, "000000", 1_000, "add");
  assert.equal(a.calls.verifyOtp[0].type, "phone_change");
});

test("live mode verifies 000000 as typed and a wrong code clears", async () => {
  const h = harness({ exchange: null, verify: { message: "invalid", status: 403 } });
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "000000", 1_000, "signup"), { ok: false, message: mismatch, clear: true });
  assert.equal(h.calls.verifyOtp[0].token, "000000");
});

test("other codes never touch the exchange", async () => {
  const h = harness();
  await verifyPhoneCode(h.d, phone, "654321", 1_000, "signup");
  assert.deepEqual(h.calls.exchange, []);
});

test("a thrown exchange is a connection failure", async () => {
  const h = harness({ exchange: "throw" });
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "000000", 1_000, "signup"), { ok: false, message: connection, clear: false });
  assert.deepEqual(h.calls.verifyOtp, []);
});

test("a bad code after ten minutes reads as expired", async () => {
  const h = harness({ verify: { message: "x", status: 403 }, now: 1_000 + 600_000 });
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "123456", 1_000, "signin"), { ok: false, message: expired, clear: true });
});

test("a short code is a mismatch without any call", async () => {
  const h = harness();
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "12345", 1_000, "signin"), { ok: false, message: mismatch, clear: true });
  assert.deepEqual(h.calls.verifyOtp, []);
  assert.deepEqual(h.calls.exchange, []);
});
