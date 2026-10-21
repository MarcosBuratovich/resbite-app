import test from "node:test";
import assert from "node:assert/strict";
import { CODE_LIFETIME_MS, sendCode, verifyCode, type EmailCodeDeps } from "./emailCode";

type AuthError = { message: string; status?: number } | null;
function harness(otp: AuthError = null, verify: AuthError = null, now = 1_000) {
  const calls = {
    signInWithOtp: [] as Parameters<EmailCodeDeps["signInWithOtp"]>[0][],
    verifyOtp: [] as Parameters<EmailCodeDeps["verifyOtp"]>[0][],
  };
  const d: EmailCodeDeps = {
    signInWithOtp: async (args) => {
      calls.signInWithOtp.push(args);
      return { error: otp };
    },
    verifyOtp: async (args) => {
      calls.verifyOtp.push(args);
      return { error: verify };
    },
    now: () => now,
  };
  return { d, calls };
}

test("a bad address never reaches Supabase", async () => {
  const h = harness();
  for (const bad of ["", "ana", "ana@", "a b@c.d"])
    assert.deepEqual(await sendCode(h.d, bad), { ok: false, message: "Enter a valid email address." });
  assert.deepEqual(h.calls.signInWithOtp, []);
});

test("sending returns a resend time one minute out", async () => {
  const h = harness();
  assert.deepEqual(await sendCode(h.d, " ana@example.com "), { ok: true, resendAt: 61_000 });
  assert.deepEqual(h.calls.signInWithOtp, [{ email: "ana@example.com", options: { shouldCreateUser: true } }]);
});

test("a 429 maps to the wait copy", async () => {
  const wait = { ok: false, message: "Wait a minute, then send a new code." };
  assert.deepEqual(await sendCode(harness({ message: "x", status: 429 }).d, "ana@example.com"), wait);
  assert.deepEqual(await sendCode(harness({ message: "email rate limit exceeded" }).d, "ana@example.com"), wait);
});

test("another send error is shown as Supabase words it", async () => {
  assert.deepEqual(await sendCode(harness({ message: "Boom" }).d, "ana@example.com"), { ok: false, message: "Boom" });
});

test("a wrong code maps to the doesn’t-match copy and clears", async () => {
  const h = harness(null, { message: "Token has expired or is invalid", status: 403 }, 1_000 + CODE_LIFETIME_MS - 1);
  assert.deepEqual(await verifyCode(h.d, "ana@example.com", "123456", 1_000), {
    ok: false,
    message: "That code doesn’t match. Try again.",
    clear: true,
  });
  assert.equal(h.calls.verifyOtp.length, 1);
});

test("an expired code maps to the expired copy", async () => {
  const h = harness(null, { message: "Token has expired or is invalid", status: 403 }, 1_000 + CODE_LIFETIME_MS);
  assert.deepEqual(await verifyCode(h.d, "ana@example.com", "123456", 1_000), {
    ok: false,
    message: "That code has expired. Send a new one.",
    clear: true,
  });
  assert.deepEqual(h.calls.verifyOtp, [{ email: "ana@example.com", token: "123456", type: "email" }]);
});

test("a right code is ok", async () => {
  assert.deepEqual(await verifyCode(harness().d, "ana@example.com", "123456", 1_000), { ok: true });
});

test("five digits are refused before any call", async () => {
  const h = harness();
  for (const bad of ["12345", "1234567", "12345a", ""])
    assert.deepEqual(await verifyCode(h.d, "ana@example.com", bad, 1_000), {
      ok: false,
      message: "That code doesn’t match. Try again.",
      clear: true,
    });
  assert.deepEqual(h.calls.verifyOtp, []);
});

test("a connection failure is not a wrong code and keeps the digits", async () => {
  const down = { message: "fetch failed", status: 0 };
  assert.deepEqual(await verifyCode(harness(null, down).d, "ana@example.com", "123456", 1_000), {
    ok: false,
    message: "Check your connection and try again.",
    clear: false,
  });
  assert.deepEqual(await verifyCode(harness(null, { message: "x", status: 502 }).d, "ana@example.com", "123456", 1_000), {
    ok: false,
    message: "Check your connection and try again.",
    clear: false,
  });
  assert.deepEqual(await sendCode(harness(down).d, "ana@example.com"), {
    ok: false,
    message: "Check your connection and try again.",
  });
});

test("spaces in a pasted code are ignored", async () => {
  const h = harness();
  assert.deepEqual(await verifyCode(h.d, "ana@example.com", "123 456", 1_000), { ok: true });
  assert.equal(h.calls.verifyOtp[0].token, "123456");
});
