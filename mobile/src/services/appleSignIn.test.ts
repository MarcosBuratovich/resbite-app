import test from "node:test";
import assert from "node:assert/strict";
import {
  appleName,
  signInWithApple,
  type AppleCredential,
  type AppleSignInDeps,
} from "./appleSignIn";

function harness(overrides: Partial<AppleSignInDeps> = {}) {
  const calls: { requestCredential: string[]; signInWithIdToken: Parameters<AppleSignInDeps["signInWithIdToken"]>[0][] } = {
    requestCredential: [],
    signInWithIdToken: [],
  };
  const credential: AppleCredential = { identityToken: "tok", email: null, fullName: { givenName: "Ana", familyName: "Lima" } };
  const d: AppleSignInDeps = {
    randomUUID: () => "raw-uuid",
    sha256: async (text) => `sha256(${text})`,
    requestCredential: async (hashedNonce) => {
      calls.requestCredential.push(hashedNonce);
      return credential;
    },
    signInWithIdToken: async (args) => {
      calls.signInWithIdToken.push(args);
      return { error: null };
    },
    ...overrides,
  };
  return { d, calls };
}

test("hashes the nonce for Apple and sends the raw nonce to Supabase", async () => {
  const h = harness();
  assert.deepEqual(await signInWithApple(h.d), { ok: true, name: "Ana Lima" });
  assert.deepEqual(h.calls.requestCredential, ["sha256(raw-uuid)"]);
  assert.deepEqual(h.calls.signInWithIdToken, [{ provider: "apple", token: "tok", nonce: "raw-uuid" }]);
});

test("a missing identity token is an error with the connection copy", async () => {
  const h = harness({ requestCredential: async () => ({ identityToken: null, email: null, fullName: null }) });
  assert.deepEqual(await signInWithApple(h.d), {
    ok: false,
    cancelled: false,
    message: "Check your connection and try again.",
  });
  assert.deepEqual(h.calls.signInWithIdToken, []);
});

test("a cancelled sheet is not an error", async () => {
  const h = harness({
    requestCredential: async () => {
      throw { code: "ERR_REQUEST_CANCELED" };
    },
  });
  assert.deepEqual(await signInWithApple(h.d), { ok: false, cancelled: true });
  assert.deepEqual(h.calls.signInWithIdToken, []);
});

test("Supabase's error is passed through", async () => {
  const h = harness({ signInWithIdToken: async () => ({ error: { message: "Provider is not enabled" } }) });
  assert.deepEqual(await signInWithApple(h.d), {
    ok: false,
    cancelled: false,
    message: "Provider is not enabled",
  });
});

test("Supabase's connection failures get the connection copy", async () => {
  for (const status of [0, 500, 503]) {
    const h = harness({
      signInWithIdToken: async () => ({ error: { message: "Network request failed", status } }),
    });
    assert.deepEqual(await signInWithApple(h.d), {
      ok: false,
      cancelled: false,
      message: "Check your connection and try again.",
    });
  }
  const h = harness({ signInWithIdToken: async () => ({ error: { message: "Invalid nonce", status: 400 } }) });
  assert.deepEqual(await signInWithApple(h.d), { ok: false, cancelled: false, message: "Invalid nonce" });
});

test("a failed sheet is an error with the connection copy, not a cancel", async () => {
  const failure = Object.assign(
    new Error("The credential returned by `signInAsync` is missing one or more required fields."),
    { code: "ERR_REQUEST_FAILED" },
  );
  const h = harness({
    requestCredential: async () => {
      throw failure;
    },
  });
  assert.deepEqual(await signInWithApple(h.d), {
    ok: false,
    cancelled: false,
    message: "Check your connection and try again.",
  });
  assert.deepEqual(h.calls.signInWithIdToken, []);
});

test("the name joins given and family names", () => {
  assert.equal(appleName({ givenName: " Ana", familyName: "Lima " }), "Ana Lima");
  assert.equal(appleName({ givenName: "Ana", familyName: null }), "Ana");
  assert.equal(appleName({ givenName: null, familyName: null }), null);
  assert.equal(appleName({ givenName: " ", familyName: "" }), null);
  assert.equal(appleName(null), null);
});
