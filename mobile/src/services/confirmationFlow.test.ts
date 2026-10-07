import test from "node:test";
import assert from "node:assert/strict";
import {
  createConfirmationStore, EmailRequestCooldownError, retrySeconds,
  checkEmailConfirmation, authLinkGuidance, emailRequestFailure,
} from "./confirmationFlow";

function fixture() {
  const values = new Map<string, string>();
  let time = 1_800_000_000_000;
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
  return { values, storage, now: () => time, advance: (ms: number) => { time += ms; } };
}

test("reservation survives restart and serializes rapid duplicate email requests", async () => {
  const f = fixture(), store = createConfirmationStore(f.storage, f.now);
  const results = await Promise.allSettled([
    store.reserve(" Person@example.invalid ", "confirmation"),
    store.reserve("person@example.invalid", "confirmation"),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  const restored = createConfirmationStore(f.storage, f.now);
  const pending = await restored.read();
  assert.equal(pending?.email, "Person@example.invalid");
  assert.equal(retrySeconds(pending, f.now()), 60);
  await assert.rejects(restored.reserve("person@example.invalid", "recovery"), EmailRequestCooldownError);
  f.advance(60_000);
  assert.equal(retrySeconds(pending, f.now()), 0);
  await restored.reserve("person@example.invalid", "confirmation");
  assert.deepEqual(Object.keys(JSON.parse([...f.values.values()][0])).sort(),
    ["schema", "email", "kind", "requestedAt", "retryAt", "expiresAt"].sort());
});

test("server wait extends cooldown; losing a network response still keeps the reservation", async () => {
  const f = fixture(), store = createConfirmationStore(f.storage, f.now);
  const pending = await store.reserve("person@example.invalid", "confirmation");
  f.advance(1000);
  const limited = await store.failure(pending, {
    status: 429, code: "over_email_send_rate_limit",
    message: "For security purposes, you can only request this after 120 seconds.",
  });
  assert.equal(retrySeconds(limited, f.now()), 120);
  const failed = await store.failure(pending, new Error("Network timeout"));
  assert.equal(retrySeconds(failed, f.now()), 120);
  assert.match(emailRequestFailure({ status: 429 }).message, /service may need longer/);
});

test("stale failures and cleanup cannot replace a newer destination", async () => {
  const f = fixture(), store = createConfirmationStore(f.storage, f.now);
  const old = await store.reserve("old@example.invalid", "confirmation");
  f.advance(100);
  const current = await store.reserve("new@example.invalid", "recovery");
  await store.failure(old, { status: 429, message: "after 600 seconds" });
  await store.clear(old);
  assert.deepEqual(await store.read(), current);
  await store.clear(current);
  assert.equal(await store.read(), null);
});

test("expired or malformed email state is removed; storage failure prevents reservation", async () => {
  const f = fixture(), store = createConfirmationStore(f.storage, f.now);
  await store.reserve("person@example.invalid", "confirmation");
  f.advance(7 * 24 * 60 * 60 * 1000);
  assert.equal(await store.read(), null);
  assert.equal(f.values.size, 0);
  f.values.set("resbite.pending-auth-email.v1", "{broken");
  assert.equal(await store.read(), null);
  const broken = createConfirmationStore({ ...f.storage, setItem: async () => { throw Error("locked"); } }, f.now);
  await assert.rejects(broken.reserve("person@example.invalid", "confirmation"), /locked/);
});

test("confirmation check needs a verified matching account and never creates a session", async () => {
  const account = { id: "a", email: "person@example.invalid" };
  let reads = 0;
  const user = async () => { reads++; return { ...account, email_confirmed_at: "2026-09-23" }; };
  assert.equal(await checkEmailConfirmation(account.email, { session: async () => null, user }), "sign_in");
  assert.equal(reads, 0);
  assert.equal(await checkEmailConfirmation("other@example.invalid", { session: async () => account, user }), "different_account");
  assert.equal(reads, 0);
  assert.equal(await checkEmailConfirmation("PERSON@example.invalid", { session: async () => account, user }), "confirmed");
  assert.equal(await checkEmailConfirmation(account.email, { session: async () => account, user: async () => account }), "unconfirmed");
  let sessions = 0;
  assert.equal(await checkEmailConfirmation(account.email, {
    session: async () => ++sessions === 1 ? account : { ...account, id: "b" }, user,
  }), "different_account");
  assert.equal(await checkEmailConfirmation(account.email, {
    session: async () => account, user: async () => ({ id: "b", email: "other@example.invalid", email_confirmed_at: "2026-09-23" }),
  }), "different_account");
});

test("link errors explain same-device recovery without exposing provider internals", () => {
  assert.match(authLinkGuidance({ code: "pkce_code_verifier_not_found" }, false), /reinstalled Resbite/);
  assert.match(authLinkGuidance({ code: "otp_expired" }, true), /most recent email/);
  assert.match(authLinkGuidance(new Error("secret internal detail"), false), /Try signing in/);
  assert.doesNotMatch(authLinkGuidance(new Error("secret internal detail"), false), /secret/);
});
