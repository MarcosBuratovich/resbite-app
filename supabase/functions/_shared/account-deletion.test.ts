import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeletionHandler,
  createCleanupHandler,
  cleanupAccounts,
  freshIdentity,
  type DeletionGateway,
  type CleanupGateway,
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
test("cleanup removes all owned photos before Auth identity and only then completes", async () => {
  const order: string[] = [];
  let listed = 0;
  const g: CleanupGateway = {
    claim: async () => [job],
    photoPaths: async () => (listed++ === 0 ? [`${userId}/a.jpg`] : []),
    removePhotos: async () => {
      order.push("photos");
    },
    deleteAuth: async () => {
      order.push("auth");
    },
    finish: async (_, complete) => {
      order.push(complete ? "complete" : "retry");
      return true;
    },
  };
  assert.deepEqual(await cleanupAccounts(g), {
    claimed: 1,
    complete: 1,
    retry: 0,
  });
  assert.deepEqual(order, ["photos", "auth", "complete"]);
});
test("cleanup failure retains retry job and never removes Auth while photos remain", async () => {
  let auth = 0;
  const results: boolean[] = [];
  const g: CleanupGateway = {
    claim: async () => [job],
    photoPaths: async () => [`${userId}/a.jpg`],
    removePhotos: async () => {
      throw Error("Storage unavailable");
    },
    deleteAuth: async () => {
      auth++;
    },
    finish: async (_, complete) => {
      results.push(complete);
      return true;
    },
  };
  assert.equal((await cleanupAccounts(g)).retry, 1);
  assert.equal(auth, 0);
  assert.deepEqual(results, [false]);
  g.photoPaths = async () => ["someone-else/private.jpg"];
  g.removePhotos = async () => {
    throw Error("must not delete other prefix");
  };
  assert.equal((await cleanupAccounts(g)).retry, 1);
  assert.equal(auth, 0);
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
  assert.equal((await g.request.verify(token)).userId, userId);
  await g.cleanup.removePhotos([`${userId}/a.jpg`]);
  assert.ok(calls.at(-1)?.endsWith("/storage/v1/object/profile-photos"));
});
