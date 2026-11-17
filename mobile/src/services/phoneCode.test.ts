import test from "node:test";
import assert from "node:assert/strict";
import { PHONE_CODE_COPY, phoneCodeDeps, sendPhoneCode, verifyPhoneCode, type AuthError, type PhoneCodeDeps } from "./phoneCode";
import { PHONE_COPY, takenLine } from "../domain/phoneCopy";

const phone = "+447700900834";
const wait = "Wait a minute, then send a new code.";
const connection = "Check your connection and try again.";
const mismatch = "That code doesn’t match. Try again.";
const expired = "That code has expired. Send a new one.";

function harness(o: { otp?: AuthError; verify?: AuthError; now?: number } = {}) {
  const calls = {
    signInWithOtp: [] as Parameters<PhoneCodeDeps["signInWithOtp"]>[0][],
    updatePhone: [] as string[],
    verifyOtp: [] as Parameters<PhoneCodeDeps["verifyOtp"]>[0][],
  };
  const d: PhoneCodeDeps = {
    signInWithOtp: async (a) => (calls.signInWithOtp.push(a), { error: o.otp ?? null }),
    updatePhone: async (p) => (calls.updatePhone.push(p), { error: o.otp ?? null }),
    verifyOtp: async (a) => (calls.verifyOtp.push(a), { error: o.verify ?? null }),
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
  // No "sign in with that number": while folding is off that would make a second account (F2).
  assert.equal(
    PHONE_CODE_COPY.taken,
    "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help.",
  );
  assert.equal(PHONE_CODE_COPY.taken, PHONE_COPY.taken);
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: "x", status: 429 } }).d, phone, "signup"), { ok: false, message: wait });
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: "x", status: 0 } }).d, phone, "signup"), { ok: false, message: connection });
});

test("the taken-number line gives the support address when the build has one (B6)", () => {
  assert.equal(
    takenLine("support@resbite.com"),
    "This number already belongs to another Resbite account. Use a different number, or write to support@resbite.com.",
  );
  assert.equal(
    takenLine(null),
    "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help.",
  );
});

test("000000 is checked as typed, like any other code", async () => {
  const h = harness({ verify: { message: "invalid", status: 403 } });
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "000000", 1_000, "signup"), { ok: false, message: mismatch, clear: true });
  assert.deepEqual(h.calls.verifyOtp, [{ phone, token: "000000", type: "sms" }]);
});

test("nothing can swap a code any more", () => {
  assert.deepEqual(Object.keys(harness().d).sort(), ["now", "signInWithOtp", "updatePhone", "verifyOtp"]);
  assert.equal("exchangeTestCode" in phoneCodeDeps, false);
});

test("a refusal from the text-message hook reaches the screen as written", async () => {
  const words = "We can’t text this number. Check it, or use another number.";
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: words, status: 422 } }).d, phone, "signup"), { ok: false, message: words });
});

test("a bad code after ten minutes reads as expired", async () => {
  const h = harness({ verify: { message: "x", status: 403 }, now: 1_000 + 600_000 });
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "123456", 1_000, "signin"), { ok: false, message: expired, clear: true });
});

test("a short code is a mismatch without any call", async () => {
  const h = harness();
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "12345", 1_000, "signin"), { ok: false, message: mismatch, clear: true });
  assert.deepEqual(h.calls.verifyOtp, []);
});
