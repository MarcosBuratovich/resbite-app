import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeletionHandler,
  createCleanupHandler,
  cleanupAccounts,
  freshIdentity,
  type DeletionBucket,
  type DeletionGateway,
  type CleanupGateway,
  type StoredObject,
  type VerifiedIdentity,
} from "./account-deletion.ts";
import { accountDeletionGateway } from "./account-deletion-gateway.ts";
const userId = "41000000-0000-4000-8000-000000000001";
const requestId = "44000000-0000-4000-8000-000000000001";
const sessionId = "42000000-0000-4000-8000-000000000001";
const receipt = { requestId, recoveryToken: "a".repeat(64) };
const identity: VerifiedIdentity = {
  userId,
  sessionId,
  amr: [{ method: "password", timestamp: 1000 }],
  providers: ["email"],
};
const req = (body: unknown, token = "original") =>
  new Request("https://example.invalid/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const gateway = (): DeletionGateway => ({
  verify: async () => identity,
  request: async () => ({ requestId, status: "queued" }),
  status: async () => null,
  revoke: async () => {},
  revokeApple: async () => {},
});
test("fresh proof requires authentication method and time, not token refresh", () => {
  assert.equal(freshIdentity(identity, 1200), true);
  assert.equal(freshIdentity(identity, 1400), false);
  assert.equal(
    freshIdentity(
      { ...identity, amr: [{ method: "token_refresh", timestamp: 1200 }] },
      1200,
    ),
    false,
  );
  assert.equal(
    freshIdentity(
      { ...identity, amr: [{ method: "otp", timestamp: 1200 }] },
      1200,
    ),
    true,
  );
  assert.equal(freshIdentity(identity, 900), false);
});
// GI2-D10: Supabase records signInWithIdToken (Sign in with Apple) as an `oauth` entry.
const oauth = (providers: string[], timestamp = 1200): VerifiedIdentity => ({
  ...identity,
  amr: [{ method: "oauth", timestamp }],
  providers,
});
test("a fresh oauth entry passes for an Apple-only account", async () => {
  assert.equal(freshIdentity(oauth(["apple"]), 1200), true);
  // The same five-minute window as a password or a code.
  assert.equal(freshIdentity(oauth(["apple"], 1200), 1501), false);
  assert.equal(freshIdentity(oauth(["apple"], 1300), 1200), false);
  const g = gateway();
  g.verify = async () => oauth(["apple"]);
  assert.equal(
    (
      await createDeletionHandler(
        g,
        true,
        () => 1200,
      )(req({ action: "request", ...receipt, proof: "fresh" }))
    ).status,
    202,
  );
});
test("a fresh oauth entry fails for a Google account", async () => {
  assert.equal(freshIdentity(oauth(["google"]), 1200), false);
  assert.equal(freshIdentity(oauth([]), 1200), false);
  const g = gateway();
  g.verify = async () => oauth(["google"]);
  assert.equal(
    (
      await createDeletionHandler(
        g,
        true,
        () => 1200,
      )(req({ action: "request", ...receipt, proof: "fresh" }))
    ).status,
    401,
  );
});
test("a fresh oauth entry passes for an Apple account that also has a password", () => {
  // ASR2-2: an account with Apple linked confirms with Apple, the only way to get the code that revokes its tokens.
  assert.equal(freshIdentity(oauth(["apple", "email"]), 1200), true);
  assert.equal(freshIdentity(oauth(["email", "apple"]), 1200), true);
  assert.equal(freshIdentity(oauth(["apple", "email"], 1200), 1501), false);
  // Such an account may still confirm with its password or a code.
  assert.equal(
    freshIdentity(
      { ...oauth(["apple", "email"]), amr: [{ method: "password", timestamp: 1200 }] },
      1200,
    ),
    true,
  );
});
test("a phone account's fresh code (otp) is accepted", () => {
  // Supabase records a verified SMS code as `otp`.
  assert.equal(
    freshIdentity(
      { ...identity, providers: ["phone"], amr: [{ method: "otp", timestamp: 1200 }] },
      1200,
    ),
    true,
  );
  assert.equal(
    freshIdentity(
      { ...identity, providers: ["phone"], amr: [{ method: "otp", timestamp: 1200 }] },
      1501,
    ),
    false,
  );
  assert.equal(
    freshIdentity(
      { ...identity, providers: ["phone"], amr: [{ method: "oauth", timestamp: 1200 }] },
      1200,
    ),
    false,
  );
});
// The handler's calls in order, from a gateway that records them.
const recording = (providers: string[]) => {
  const order: string[] = [];
  const codes: string[] = [];
  let verified = 0;
  const g: DeletionGateway = {
    verify: async () => {
      verified++;
      return oauth(providers);
    },
    request: async () => {
      order.push("request");
      return { requestId, status: "queued" };
    },
    status: async () => null,
    revoke: async () => {
      order.push("revoke");
    },
    revokeApple: async (code) => {
      order.push("apple");
      codes.push(code);
    },
  };
  return { g, order, codes, verified: () => verified };
};
const appleCode = "c.abc-1_x";
test("Apple is revoked after the request and the logout, and a failing Apple still answers 202", async () => {
  const r = recording(["apple"]);
  const response = await createDeletionHandler(r.g, true, () => 1200)(
    req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode: appleCode }),
  );
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { requestId, status: "queued" });
  assert.deepEqual(r.order, ["request", "revoke", "apple"]);
  assert.deepEqual(r.codes, [appleCode]);
  // Apple failing, by a rejection or a throw, never fails the accepted deletion.
  r.g.revokeApple = async () => {
    r.order.push("apple");
    throw Error("Apple unavailable");
  };
  assert.equal(
    (
      await createDeletionHandler(r.g, true, () => 1200)(
        req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode: appleCode }),
      )
    ).status,
    202,
  );
  r.g.revokeApple = () => {
    r.order.push("apple");
    throw Error("Apple unavailable");
  };
  r.g.revoke = async () => {
    r.order.push("revoke");
    throw Error("Logout unavailable");
  };
  r.order.length = 0;
  assert.equal(
    (
      await createDeletionHandler(r.g, true, () => 1200)(
        req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode: appleCode }),
      )
    ).status,
    202,
  );
  assert.deepEqual(r.order, ["request", "revoke", "apple"]);
});
test("no Apple call without a code, or for an account without Apple", async () => {
  // A code, but the proof's account has no Apple linked.
  const email = recording(["email"]);
  email.g.verify = async () => identity;
  assert.equal(
    (
      await createDeletionHandler(email.g, true, () => 1200)(
        req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode: appleCode }),
      )
    ).status,
    202,
  );
  assert.deepEqual(email.order, ["request", "revoke"]);
  // An Apple account that sent no code.
  const apple = recording(["apple"]);
  assert.equal(
    (
      await createDeletionHandler(apple.g, true, () => 1200)(
        req({ action: "request", ...receipt, proof: "fresh" }),
      )
    ).status,
    202,
  );
  assert.deepEqual(apple.order, ["request", "revoke"]);
  // A refused request never reaches Apple either.
  const refused = recording(["apple"]);
  refused.g.request = async () => {
    refused.order.push("request");
    throw Error("Backend operation failed");
  };
  assert.equal(
    (
      await createDeletionHandler(refused.g, true, () => 1200)(
        req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode: appleCode }),
      )
    ).status,
    503,
  );
  assert.deepEqual(refused.order, ["request"]);
});
test("a request whose reply was lost, but which the receipt shows queued, still logs out and revokes Apple", async () => {
  // The transaction committed (or was waiting on the deletion lock past the RPC's timeout, then committed): the
  // receipt finds the job, so the answer is 202 and the logout and Apple's revocation run once each, in order.
  const r = recording(["apple"]);
  const looked: [string, string][] = [];
  r.g.request = async () => {
    r.order.push("request");
    throw Error("RPC timed out");
  };
  r.g.status = async (id, token) => {
    r.order.push("status");
    looked.push([id, token]);
    return { requestId: id, status: "queued" };
  };
  const response = await createDeletionHandler(r.g, true, () => 1200)(
    req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode: appleCode }),
  );
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { requestId, status: "queued" });
  assert.deepEqual(r.order, ["request", "status", "revoke", "apple"]);
  assert.deepEqual(looked, [[requestId, receipt.recoveryToken]]);
  assert.deepEqual(r.codes, [appleCode]);
  // No job behind the receipt: unconfirmed, and neither the logout nor Apple runs.
  for (const status of [async () => null, async () => Promise.reject(Error("status down"))]) {
    const none = recording(["apple"]);
    none.g.request = async () => {
      none.order.push("request");
      throw Error("Backend operation failed");
    };
    none.g.status = status;
    const unconfirmed = await createDeletionHandler(none.g, true, () => 1200)(
      req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode: appleCode }),
    );
    assert.equal(unconfirmed.status, 503);
    assert.deepEqual(await unconfirmed.json(), {
      error: "Request unconfirmed; check the saved receipt before retrying",
    });
    assert.deepEqual(none.order, ["request"]);
  }
});
test("a malformed Apple code is refused before any backend call", async () => {
  for (const appleAuthorizationCode of [7, "a b", "", null, "x".repeat(1025), "c/abc"]) {
    const r = recording(["apple"]);
    const response = await createDeletionHandler(r.g, true, () => 1200)(
      req({ action: "request", ...receipt, proof: "fresh", appleAuthorizationCode }),
    );
    assert.equal(response.status, 400, String(appleAuthorizationCode));
    assert.deepEqual(await response.json(), { error: "Invalid request" });
    assert.equal(r.verified(), 0);
    assert.deepEqual(r.order, []);
  }
});
test("disabled handler has no backend side effects", async () => {
  const g = gateway();
  g.verify = async () => {
    throw Error("must not call");
  };
  assert.equal(
    (
      await createDeletionHandler(
        g,
        false,
      )(req({ action: "request", ...receipt, proof: "fresh" }))
    ).status,
    503,
  );
});
test("same account and recent proof required before request", async () => {
  let writes = 0;
  const g = gateway();
  g.request = async () => {
    writes++;
    return { requestId, status: "queued" };
  };
  g.verify = async (token) =>
    token === "fresh"
      ? { ...identity, userId: "41000000-0000-4000-8000-000000000002" }
      : identity;
  assert.equal(
    (
      await createDeletionHandler(
        g,
        true,
        () => 1200,
      )(req({ action: "request", ...receipt, proof: "fresh" }))
    ).status,
    401,
  );
  assert.equal(writes, 0);
  g.verify = async () => identity;
  assert.equal(
    (
      await createDeletionHandler(
        g,
        true,
        () => 1500,
      )(req({ action: "request", ...receipt, proof: "fresh" }))
    ).status,
    401,
  );
  assert.equal(writes, 0);
});
test("accepted deletion remains accepted if session revocation fails", async () => {
  const g = gateway();
  g.revoke = async () => {
    throw Error("network");
  };
  const response = await createDeletionHandler(
    g,
    true,
    () => 1200,
  )(req({ action: "request", ...receipt, proof: "fresh" }));
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { requestId, status: "queued" });
});
test("status-only recovery uses secret and works without an active account", async () => {
  const g = gateway();
  g.verify = async () => {
    throw Error("must not authenticate");
  };
  g.status = async (id, token) =>
    token === receipt.recoveryToken
      ? { requestId: id, status: "complete" }
      : null;
  const h = createDeletionHandler(g, true);
  assert.equal((await h(req({ action: "status", ...receipt }))).status, 200);
  assert.equal(
    (
      await h(
        req({ action: "status", ...receipt, recoveryToken: "b".repeat(64) }),
      )
    ).status,
    404,
  );
  assert.equal(
    (await h(req({ action: "status", ...receipt, recoveryToken: "short" })))
      .status,
    400,
  );
});
test("malformed and oversized requests are rejected", async () => {
  const h = createDeletionHandler(gateway(), true);
  assert.equal((await h(req({ action: "other", ...receipt }))).status, 400);
  assert.equal((await h(req({ data: "x".repeat(17000) }))).status, 413);
  assert.equal(
    (await h(new Request("https://example.invalid", { method: "GET" }))).status,
    405,
  );
});
const job = { requestId, userId, leaseId: sessionId, attempts: 1 };
// A cleanup gateway over a list of pages, recording what it removes, in order.
const cleanupRecording = (pages: StoredObject[][]) => {
  const order: string[] = [];
  const removed: { bucket: DeletionBucket; names: string[] }[] = [];
  let listed = 0;
  const g: CleanupGateway = {
    claim: async () => [job],
    storageObjects: async () => {
      const page = listed < pages.length ? pages[listed] : [];
      listed++;
      return page;
    },
    removeObjects: async (bucket, names) => {
      order.push(`remove:${bucket}`);
      removed.push({ bucket, names });
    },
    deleteAuth: async () => {
      order.push("auth");
    },
    finish: async (_, complete) => {
      order.push(complete ? "complete" : "retry");
      return true;
    },
  };
  return { g, order, removed, listed: () => listed };
};
test("cleanup removes both buckets under the account before Auth, then completes", async () => {
  // deletion_storage_objects answers ordered by bucket, then name.
  const r = cleanupRecording([
    [
      { bucket: "plan-covers", name: `${userId}/cover-1.jpg` },
      { bucket: "plan-covers", name: `${userId}/cover-2.jpg` },
      { bucket: "profile-photos", name: `${userId}/a.jpg` },
    ],
  ]);
  assert.deepEqual(await cleanupAccounts(r.g), {
    claimed: 1,
    complete: 1,
    retry: 0,
  });
  assert.deepEqual(r.order, ["remove:plan-covers", "remove:profile-photos", "auth", "complete"]);
  // One call per bucket present, with only that bucket's names.
  assert.deepEqual(r.removed, [
    { bucket: "plan-covers", names: [`${userId}/cover-1.jpg`, `${userId}/cover-2.jpg`] },
    { bucket: "profile-photos", names: [`${userId}/a.jpg`] },
  ]);
  // An account with nothing stored goes straight to Auth.
  const empty = cleanupRecording([]);
  assert.equal((await cleanupAccounts(empty.g)).complete, 1);
  assert.deepEqual(empty.order, ["auth", "complete"]);
  // Ten full pages and still more: the job stays open and Auth stays.
  const many = cleanupRecording(
    Array.from({ length: 11 }, (_, i) => [{ bucket: "profile-photos" as const, name: `${userId}/${i}.jpg` }]),
  );
  assert.equal((await cleanupAccounts(many.g)).retry, 1);
  assert.equal(many.listed(), 10);
  assert.equal(many.order.filter((step) => step === "auth").length, 0);
  assert.equal(many.order.at(-1), "retry");
  // Storage failing keeps the job open and Auth in place.
  const failing = cleanupRecording([[{ bucket: "plan-covers", name: `${userId}/cover-1.jpg` }]]);
  failing.g.removeObjects = async () => {
    throw Error("Storage unavailable");
  };
  assert.equal((await cleanupAccounts(failing.g)).retry, 1);
  assert.deepEqual(failing.order, ["retry"]);
});
test("an object outside the account's folder or bucket stops the job before anything is removed", async () => {
  const valid: StoredObject = { bucket: "plan-covers", name: `${userId}/ok.jpg` };
  const bad = [
    { bucket: "avatars", name: `${userId}/x.jpg` },
    { bucket: "plan-covers", name: "other/x.jpg" },
    { bucket: "profile-photos", name: `${userId}/../other/x.jpg` },
    { bucket: "profile-photos", name: userId },
    { bucket: "profile-photos", name: 7 },
  ] as unknown as StoredObject[];
  for (const entry of bad) {
    // The bad entry comes after a good one: the whole page is checked before any removal.
    const r = cleanupRecording([[valid, entry]]);
    assert.deepEqual(await cleanupAccounts(r.g), { claimed: 1, complete: 0, retry: 1 }, JSON.stringify(entry));
    assert.deepEqual(r.removed, []);
    assert.equal(r.order.filter((step) => step === "auth").length, 0);
    assert.deepEqual(r.order, ["retry"]);
  }
  // An answer that isn't a list stops the job too.
  const r = cleanupRecording([null as unknown as StoredObject[]]);
  assert.equal((await cleanupAccounts(r.g)).retry, 1);
  assert.deepEqual(r.order, ["retry"]);
});
test("worker requires dedicated secret and enabled gate", async () => {
  let calls = 0;
  const g = {
    claim: async () => {
      calls++;
      return [];
    },
  } as unknown as CleanupGateway;
  const h = createCleanupHandler(g, true, "s".repeat(32));
  assert.equal((await h(req({}))).status, 401);
  assert.equal(calls, 0);
  assert.equal((await h(req({}, "s".repeat(32)))).status, 200);
  assert.equal(calls, 1);
});
test("gateway only decodes claims after Auth verification; removes objects via Storage API", async () => {
  const calls: string[] = [];
  let authorized = false;
  const claims = {
    sub: userId,
    session_id: sessionId,
    role: "authenticated",
    exp: Date.now() / 1000 + 1000,
    amr: identity.amr,
    app_metadata: { provider: "apple", providers: ["apple", 7] },
  };
  const token = `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
  const g = accountDeletionGateway(
    "https://example.invalid",
    "server-secret",
    async (url, options) => {
      calls.push(String(url));
      if (String(url).endsWith("/user"))
        return new Response(JSON.stringify({ id: userId }), {
          status: authorized ? 200 : 401,
        });
      assert.equal(options?.method, "DELETE");
      assert.deepEqual(JSON.parse(String(options?.body)), {
        prefixes: [`${userId}/a.jpg`],
      });
      return new Response("[]");
    },
  );
  await assert.rejects(g.request.verify(token));
  authorized = true;
  const verified = await g.request.verify(token);
  assert.equal(verified.userId, userId);
  // Providers come from the verified token's app_metadata, strings only.
  assert.deepEqual(verified.providers, ["apple"]);
  const bare = `e30.${Buffer.from(JSON.stringify({ ...claims, app_metadata: undefined })).toString("base64url")}.signature`;
  assert.deepEqual((await g.request.verify(bare)).providers, []);
  await g.cleanup.removeObjects("plan-covers", [`${userId}/a.jpg`]);
  assert.ok(calls.at(-1)?.endsWith("/storage/v1/object/plan-covers"));
  await g.cleanup.removeObjects("profile-photos", [`${userId}/a.jpg`]);
  assert.ok(calls.at(-1)?.endsWith("/storage/v1/object/profile-photos"));
});
test("the gateway's request is the direct RPC with the proof's session, and a mismatched answer throws", async () => {
  const seen: { url: string; method?: string; body: unknown }[] = [];
  let answer: unknown = { requestId, status: "queued" };
  const g = accountDeletionGateway(
    "https://example.invalid",
    "server-secret",
    async (url, options) => {
      seen.push({ url: String(url), method: options?.method, body: JSON.parse(String(options?.body)) });
      return new Response(JSON.stringify(answer));
    },
  );
  assert.deepEqual(
    await g.request.request(userId, sessionId, requestId, receipt.recoveryToken),
    { requestId, status: "queued" },
  );
  assert.deepEqual(seen, [
    {
      url: "https://example.invalid/rest/v1/rpc/request_account_deletion",
      method: "POST",
      body: { p_user: userId, p_session: sessionId, p_request: requestId, p_recovery: receipt.recoveryToken },
    },
  ]);
  // The answer is the request's status, nothing more.
  answer = { requestId, status: "complete", extra: "x" };
  assert.deepEqual(
    await g.request.request(userId, sessionId, requestId, receipt.recoveryToken),
    { requestId, status: "complete" },
  );
  for (const wrong of [
    { requestId: "44000000-0000-4000-8000-000000000002", status: "queued" },
    { requestId, status: "held" },
    { requestId },
    null,
    [],
  ]) {
    answer = wrong;
    await assert.rejects(
      g.request.request(userId, sessionId, requestId, receipt.recoveryToken),
      /Unexpected deletion answer/,
      JSON.stringify(wrong),
    );
  }
  // The status RPC and the storage listing are the worker's direct RPCs too.
  seen.length = 0;
  answer = [{ bucket: "plan-covers", name: `${userId}/a.jpg` }];
  assert.deepEqual(
    await g.cleanup.storageObjects({ requestId, userId, leaseId: sessionId, attempts: 1 }),
    answer,
  );
  assert.deepEqual(seen, [
    {
      url: "https://example.invalid/rest/v1/rpc/deletion_storage_objects",
      method: "POST",
      body: { p_request: requestId, p_lease: sessionId },
    },
  ]);
});
// A throwaway P-256 key, so no key material is committed.
async function applePem() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}
test("the gateway revokes Apple only with its four secrets, through its own fetcher", async () => {
  const urls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return String(url).endsWith("/auth/token")
      ? new Response(JSON.stringify({ refresh_token: "r-token" }))
      : new Response(null, { status: 200 });
  }) as typeof fetch;
  // No configuration: a no-op, with no call at all.
  await accountDeletionGateway("https://example.invalid", "server-secret", fetcher, null).request.revokeApple("c.1");
  await accountDeletionGateway("https://example.invalid", "server-secret", fetcher).request.revokeApple("c.1");
  assert.deepEqual(urls, []);
  const apple = { teamId: "TEAMID1234", keyId: "ABCDEFGHIJ", clientId: "com.resbite.app", privateKeyPem: await applePem() };
  await accountDeletionGateway("https://example.invalid", "server-secret", fetcher, apple).request.revokeApple("c.1");
  assert.deepEqual(urls, ["https://appleid.apple.com/auth/token", "https://appleid.apple.com/auth/revoke"]);
  // Apple failing still resolves.
  const failing = (async () => {
    throw Error("network");
  }) as typeof fetch;
  await accountDeletionGateway("https://example.invalid", "server-secret", failing, apple).request.revokeApple("c.1");
});
