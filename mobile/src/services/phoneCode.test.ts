import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  HOOK_SMS_COPY,
  PHONE_CODE_COPY,
  phoneCodeDeps,
  sendPhoneCode,
  verifyPhoneCode,
  type AuthError,
  type PhoneCodeDeps,
} from "./phoneCode";
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
  for (const purpose of ["signup", "signin", "add"] as const)
    assert.deepEqual(await sendPhoneCode(harness({ otp: { message: "Invalid code request.", status: 400 } }).d, phone, purpose), {
      ok: false,
      message: "Invalid code request.",
    }, purpose);
});

test("the hook's words in the app are the hook's own (supabase/functions/_shared/sms-hook.ts)", () => {
  const source = readFileSync(fileURLToPath(new URL("../../../supabase/functions/_shared/sms-hook.ts", import.meta.url)), "utf8");
  const block = /export const SMS_COPY = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? "";
  const words = [...block.matchAll(/:\s*"([^"]*)"/g)].map((m) => m[1]);
  assert.equal(words.length, 3);
  assert.deepEqual([...HOOK_SMS_COPY].sort(), words.sort());
});

// Auth's hook error codes (Supabase's Auth error-code list: hook_timeout, hook_timeout_after_retry, hook_payload_*),
// with words like Auth's, and other Auth messages: never shown as they came. The only server words shown are the hook's.
const AUTH_ERRORS: NonNullable<AuthError>[] = [
  { status: 422, code: "hook_timeout", message: "Failed to reach hook within maximum time of 5.000000 seconds" },
  { status: 422, code: "hook_timeout_after_retry", message: "Failed to reach hook after maximum retries" },
  { status: 400, code: "hook_payload_over_size_limit", message: "Payload size exceeded" },
  { status: 422, code: "hook_timeout", message: "We can’t text this number. Check it, or use another number." },
  { status: 400, code: "validation_failed", message: "Invalid phone number format (E.164 required)" },
  { status: 422, code: "sms_send_failed", message: "Error sending confirmation OTP to provider: x" },
  { status: 400, message: "Unsupported phone provider" },
  { status: 422, message: "" },
];

test("a hook timeout or any other Auth message reads as the connection copy, for every purpose", async () => {
  for (const purpose of ["signup", "signin", "add"] as const)
    for (const otp of AUTH_ERRORS)
      assert.deepEqual(await sendPhoneCode(harness({ otp }).d, phone, purpose), { ok: false, message: connection }, `${purpose} ${otp.code}`);
});

test("the hook's own busy answer (Auth's 503) reads as the connection copy", async () => {
  const otp = { status: 503, message: "Text messages aren’t available right now. Try again later." };
  assert.deepEqual(await sendPhoneCode(harness({ otp }).d, phone, "signin"), { ok: false, message: connection });
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
