import test from "node:test";
import assert from "node:assert/strict";
import {
  appleClientSecret,
  appleRevocationConfig,
  revokeAppleAuthorization,
  type AppleRevocationConfig,
} from "./apple-revocation.ts";

// A throwaway P-256 key made for each run. No real Apple key is ever in the repo.
const keys = (async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  ) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const body = btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join("\n");
  return { pair, pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n` };
})();

const settings = (pem: string): Record<string, string | undefined> => ({
  APPLE_TEAM_ID: "TEAMID1234",
  APPLE_KEY_ID: "ABCDEFGHIJ",
  APPLE_CLIENT_ID: "com.resbite.app",
  APPLE_PRIVATE_KEY: pem,
});
const get = (values: Record<string, string | undefined>) => (name: string) => values[name];
const config = async (): Promise<AppleRevocationConfig> =>
  appleRevocationConfig(get(settings((await keys).pem)))!;

const fromBase64url = (part: string) => Uint8Array.from(
  atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")),
  c => c.charCodeAt(0),
);
const decodeJson = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64url(part)));

type Call = { url: string; init: RequestInit; form: URLSearchParams };
function recorder(answer: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, form: new URLSearchParams(String(init.body)) });
    return answer(url);
  }) as typeof fetch;
  return { calls, fetcher };
}
const tokens = (extra: Record<string, unknown> = {}) => Response.json({
  access_token: "a-token", token_type: "Bearer", expires_in: 3600,
  refresh_token: "r-token", id_token: "h.p.s", ...extra,
});
// An answer whose body records whether anyone read it.
function watched(status: number) {
  const seen = { reads: 0 };
  const response = new Response(new ReadableStream({
    pull(controller) {
      seen.reads += 1;
      controller.enqueue(new TextEncoder().encode('{"error":"invalid_grant"}'));
      controller.close();
    },
  }, { highWaterMark: 0 }), { status });
  return { seen, response };
}

test("config is null until all four values are set, and takes a key with escaped newlines", async () => {
  const { pem } = await keys;
  const all = settings(pem);
  const ready = appleRevocationConfig(get(all));
  assert.deepEqual(ready, {
    teamId: "TEAMID1234", keyId: "ABCDEFGHIJ", clientId: "com.resbite.app", privateKeyPem: pem,
  });
  for (const name of Object.keys(all))
    assert.equal(appleRevocationConfig(get({ ...all, [name]: undefined })), null, name);
  assert.equal(appleRevocationConfig(get({ ...all, APPLE_TEAM_ID: "short" })), null);
  assert.equal(appleRevocationConfig(get({ ...all, APPLE_TEAM_ID: "teamid1234" })), null);
  assert.equal(appleRevocationConfig(get({ ...all, APPLE_KEY_ID: "ABCDEFGHIJK" })), null);
  assert.equal(appleRevocationConfig(get({ ...all, APPLE_CLIENT_ID: "com resbite app" })), null);
  assert.equal(appleRevocationConfig(get({ ...all, APPLE_CLIENT_ID: "x".repeat(256) })), null);
  assert.equal(appleRevocationConfig(get({ ...all, APPLE_PRIVATE_KEY: "not a key" })), null);
  const escaped = appleRevocationConfig(get({ ...all, APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n") }))!;
  assert.ok(escaped.privateKeyPem.includes("\n"));
  assert.ok(!escaped.privateKeyPem.includes("\\n"));
  assert.equal(escaped.privateKeyPem, pem);
});

test("the client secret is an ES256 JWT Apple can verify", async () => {
  const { pair } = await keys;
  const secret = await appleClientSecret(await config(), 1000);
  const parts = secret.split(".");
  assert.equal(parts.length, 3);
  for (const part of parts) assert.match(part, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeJson(parts[0]), { alg: "ES256", kid: "ABCDEFGHIJ" });
  assert.deepEqual(decodeJson(parts[1]), {
    iss: "TEAMID1234", iat: 1000, exp: 1300, aud: "https://appleid.apple.com", sub: "com.resbite.app",
  });
  const signature = fromBase64url(parts[2]);
  assert.equal(signature.byteLength, 64);
  assert.equal(await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, pair.publicKey, signature,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  ), true);
});

test("revocation exchanges the code, then revokes the refresh token", async () => {
  const apple = await config();
  const { calls, fetcher } = recorder(url => url.endsWith("/auth/token") ? tokens() : new Response(null, { status: 200 }));
  assert.equal(await revokeAppleAuthorization("c.abc-1", apple, fetcher, () => 1000), "revoked");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://appleid.apple.com/auth/token");
  assert.equal(calls[0].form.get("grant_type"), "authorization_code");
  assert.equal(calls[0].form.get("code"), "c.abc-1");
  assert.equal(calls[0].form.get("client_id"), "com.resbite.app");
  assert.equal(decodeJson(calls[0].form.get("client_secret")!.split(".")[1]).iat, 1000);
  assert.equal(calls[1].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(calls[1].form.get("client_id"), "com.resbite.app");
  assert.equal(calls[1].form.get("client_secret"), calls[0].form.get("client_secret"));
  assert.equal(calls[1].form.get("token"), "r-token");
  assert.equal(calls[1].form.get("token_type_hint"), "refresh_token");
  for (const call of calls) {
    assert.equal(call.init.method, "POST");
    assert.equal(new Headers(call.init.headers).get("content-type"), "application/x-www-form-urlencoded");
    assert.equal(call.init.redirect, "error");
    assert.ok(call.init.signal instanceof AbortSignal);
  }

  // Apple may answer without a refresh token; the access token is revoked instead.
  const fallback = recorder(url => url.endsWith("/auth/token")
    ? tokens({ refresh_token: undefined })
    : new Response(null, { status: 200 }));
  assert.equal(await revokeAppleAuthorization("c.abc-1", apple, fallback.fetcher, () => 1000), "revoked");
  assert.equal(fallback.calls[1].form.get("token"), "a-token");
  assert.equal(fallback.calls[1].form.get("token_type_hint"), "access_token");
});

test("a refused exchange revokes nothing and answers failed; a thrown fetch answers failed", async t => {
  const apple = await config();
  const logs = (["log", "info", "warn", "error", "debug"] as const).map(name => t.mock.method(console, name));

  const refused = watched(400);
  const exchange = recorder(() => refused.response);
  assert.equal(await revokeAppleAuthorization("c.abc-1", apple, exchange.fetcher), "failed");
  assert.equal(exchange.calls.length, 1);
  assert.equal(refused.seen.reads, 0, "Apple's error body is never read");

  const thrown = recorder(() => { throw new TypeError("network down"); });
  assert.equal(await revokeAppleAuthorization("c.abc-1", apple, thrown.fetcher), "failed");
  assert.equal(thrown.calls.length, 1);

  const revokeRefused = watched(500);
  const revoke = recorder(url => url.endsWith("/auth/token") ? tokens() : revokeRefused.response);
  assert.equal(await revokeAppleAuthorization("c.abc-1", apple, revoke.fetcher), "failed");
  assert.equal(revoke.calls.length, 2);
  assert.equal(revokeRefused.seen.reads, 0);

  for (const answer of [tokens({ refresh_token: undefined, access_token: undefined }), new Response("not json")]) {
    const empty = recorder(() => answer);
    assert.equal(await revokeAppleAuthorization("c.abc-1", apple, empty.fetcher), "failed");
    assert.equal(empty.calls.length, 1);
  }

  const badKey = recorder(() => tokens());
  assert.equal(await revokeAppleAuthorization(
    "c.abc-1", { ...apple, privateKeyPem: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" }, badKey.fetcher,
  ), "failed");
  assert.equal(badKey.calls.length, 0);

  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test("a code that isn't Apple's shape is refused before any call", async () => {
  const apple = await config();
  for (const code of ["", "a b", "x".repeat(1025), "c/abc", "c.abc\n"]) {
    const { calls, fetcher } = recorder(() => tokens());
    assert.equal(await revokeAppleAuthorization(code, apple, fetcher), "failed", JSON.stringify(code));
    assert.equal(calls.length, 0);
  }
  const longest = recorder(url => url.endsWith("/auth/token") ? tokens() : new Response(null, { status: 200 }));
  assert.equal(await revokeAppleAuthorization("x".repeat(1024), apple, longest.fetcher), "revoked");
});
