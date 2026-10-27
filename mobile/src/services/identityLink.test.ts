import test from "node:test";
import assert from "node:assert/strict";
import { LINK_COPY, linkApple, linkGoogle, type AppleLinkDeps, type GoogleLinkDeps } from "./identityLink";

function apple(over: Partial<AppleLinkDeps> = {}) {
  const linked: unknown[] = [];
  const saved: string[] = [];
  const d: AppleLinkDeps = {
    randomUUID: () => "raw",
    sha256: async (t) => `h(${t})`,
    requestCredential: async () => ({
      identityToken: "tok",
      email: "sam@example.com",
      fullName: { givenName: "Sam", familyName: "Patel" },
    }),
    linkIdToken: async (a) => {
      linked.push(a);
      return { error: null };
    },
    saveName: async (n) => void saved.push(n),
    ...over,
  };
  return { d, linked, saved };
}

test("Apple link sends the raw nonce and returns name and email", async () => {
  const h = apple();
  assert.deepEqual(await linkApple(h.d), { ok: true, name: "Sam Patel", email: "sam@example.com" });
  assert.deepEqual(h.linked, [{ provider: "apple", token: "tok", nonce: "raw" }]);
  assert.deepEqual(h.saved, ["Sam Patel"]);
});

test("Apple cancel links nothing", async () => {
  const h = apple({
    requestCredential: async () => {
      throw { code: "ERR_REQUEST_CANCELED" };
    },
  });
  assert.deepEqual(await linkApple(h.d), { ok: false, cancelled: true });
  assert.equal(h.linked.length, 0);
});

test("Apple identity already linked elsewhere", async () => {
  const h = apple({ linkIdToken: async () => ({ error: { message: "x", code: "identity_already_exists", status: 422 } }) });
  assert.deepEqual(await linkApple(h.d), { ok: false, cancelled: false, message: LINK_COPY.appleTaken });
});

test("Apple connection failure", async () => {
  const h = apple({ linkIdToken: async () => ({ error: { message: "fetch", status: 0 } }) });
  assert.deepEqual(await linkApple(h.d), { ok: false, cancelled: false, message: "Check your connection and try again." });
});

test("no name means saveName is not called, and a failed save is not an error", async () => {
  const h = apple({ requestCredential: async () => ({ identityToken: "tok", email: null, fullName: null }) });
  assert.deepEqual(await linkApple(h.d), { ok: true, name: null, email: null });
  assert.deepEqual(h.saved, []);
  const f = apple({ saveName: async () => { throw new Error("no"); } });
  assert.equal((await linkApple(f.d)).ok, true);
});

function google(over: Partial<GoogleLinkDeps> = {}) {
  const exchanged: string[] = [];
  const saved: string[] = [];
  const d: GoogleLinkDeps = {
    redirectTo: "resbite://auth/callback",
    linkUrl: async () => ({ url: "https://accounts.example/auth", error: null }),
    openAuthSession: async () => ({ type: "success", url: "resbite://auth/callback?code=abc" }),
    exchange: async (c) => void exchanged.push(c),
    googleIdentity: async () => ({ name: "Sam Patel", email: "sam@example.com" }),
    saveName: async (n) => void saved.push(n),
    ...over,
  };
  return { d, exchanged, saved };
}

test("Google link exchanges the code and returns identity", async () => {
  const h = google();
  assert.deepEqual(await linkGoogle(h.d), { ok: true, name: "Sam Patel", email: "sam@example.com" });
  assert.deepEqual(h.exchanged, ["abc"]);
  assert.deepEqual(h.saved, ["Sam Patel"]);
});

test("Google cancel", async () => {
  const h = google({ openAuthSession: async () => ({ type: "cancel" }) });
  assert.deepEqual(await linkGoogle(h.d), { ok: false, cancelled: true });
  assert.deepEqual(h.exchanged, []);
});

test("Google account taken", async () => {
  const h = google({ linkUrl: async () => ({ url: null, error: { message: "x", code: "identity_already_exists" } }) });
  assert.deepEqual(await linkGoogle(h.d), { ok: false, cancelled: false, message: LINK_COPY.googleTaken });
});

test("Google taken surfacing on exchange", async () => {
  const h = google({ exchange: async () => { throw { code: "identity_already_exists" }; } });
  assert.deepEqual(await linkGoogle(h.d), { ok: false, cancelled: false, message: LINK_COPY.googleTaken });
});

const taken = (url: string) => google({ openAuthSession: async () => ({ type: "success", url }) });

test("Google taken reported in the fragment of the redirect", async () => {
  const h = taken("resbite://auth/callback#error=server_error&error_code=identity_already_exists");
  assert.deepEqual(await linkGoogle(h.d), { ok: false, cancelled: false, message: LINK_COPY.googleTaken });
  assert.deepEqual(h.exchanged, []);
});

test("Google taken reported in the query of the redirect", async () => {
  const h = taken("resbite://auth/callback?error=server_error&error_code=identity_already_exists");
  assert.deepEqual(await linkGoogle(h.d), { ok: false, cancelled: false, message: LINK_COPY.googleTaken });
  assert.deepEqual(h.exchanged, []);
});

test("other redirect errors get the connection copy", async () => {
  const h = taken("resbite://auth/callback?error=access_denied");
  assert.deepEqual(await linkGoogle(h.d), { ok: false, cancelled: false, message: "Check your connection and try again." });
  assert.deepEqual(h.exchanged, []);
});

test("a success URL with neither code nor error is unverifiable", async () => {
  const h = taken("resbite://auth/callback");
  assert.deepEqual(await linkGoogle(h.d), { ok: false, cancelled: false, message: "Unable to verify the sign-in link." });
  assert.deepEqual(h.exchanged, []);
});

// GoTrue answers email_exists when the provider's email already belongs to another account: the same refusal.
test("Apple email already used by another account, returned or thrown", async () => {
  const returned = apple({ linkIdToken: async () => ({ error: { message: "x", code: "email_exists", status: 422 } }) });
  assert.deepEqual(await linkApple(returned.d), { ok: false, cancelled: false, message: LINK_COPY.appleTaken });
  const thrown = apple({
    linkIdToken: async () => {
      throw { code: "email_exists", status: 422 };
    },
  });
  assert.deepEqual(await linkApple(thrown.d), { ok: false, cancelled: false, message: LINK_COPY.appleTaken });
  assert.deepEqual(thrown.saved, []);
});

test("Google email already used by another account, returned, thrown or in the redirect", async () => {
  const returned = google({ linkUrl: async () => ({ url: null, error: { message: "x", code: "email_exists", status: 422 } }) });
  assert.deepEqual(await linkGoogle(returned.d), { ok: false, cancelled: false, message: LINK_COPY.googleTaken });
  const thrown = google({
    exchange: async () => {
      throw { code: "email_exists" };
    },
  });
  assert.deepEqual(await linkGoogle(thrown.d), { ok: false, cancelled: false, message: LINK_COPY.googleTaken });
  const redirect = taken("resbite://auth/callback#error=server_error&error_code=email_exists");
  assert.deepEqual(await linkGoogle(redirect.d), { ok: false, cancelled: false, message: LINK_COPY.googleTaken });
  assert.deepEqual(redirect.exchanged, []);
});
