import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanupProfilePhotos, createPhotoCleanupHandler, type PhotoCleanupGateway, type PhotoCleanupJob } from "./profile-photo-cleanup.ts";
import { profilePhotoCleanupGateway } from "./profile-photo-cleanup-gateway.ts";

const job: PhotoCleanupJob = {
  jobId: "81000000-0000-4000-8000-000000000001",
  userId: "82000000-0000-4000-8000-000000000001",
  leaseId: "83000000-0000-4000-8000-000000000001",
  attempts: 1,
};
const path = `${job.userId}/photo.jpg`;
function fixture(overrides: Partial<PhotoCleanupGateway> = {}) {
  const calls: string[] = [];
  const gateway: PhotoCleanupGateway = {
    prune: async () => { calls.push("prune"); },
    claim: async () => { calls.push("claim"); return [job]; },
    prepare: async () => { calls.push("prepare"); return { action: "delete", path }; },
    remove: async (value) => { calls.push(`remove:${value}`); },
    finish: async (_, complete) => { calls.push(`finish:${complete}`); return true; },
    ...overrides,
  };
  return { gateway, calls };
}

test("photo cleanup requires enabled worker, POST and a dedicated secret before touching storage", async () => {
  const { gateway, calls } = fixture();
  const disabled = createPhotoCleanupHandler(gateway, false, "s".repeat(32));
  assert.equal((await disabled(new Request("https://worker.invalid", { method: "POST" }))).status, 503);
  const enabled = createPhotoCleanupHandler(gateway, true, "s".repeat(32));
  assert.equal((await enabled(new Request("https://worker.invalid"))).status, 405);
  assert.equal((await enabled(new Request("https://worker.invalid", { method: "POST" }))).status, 401);
  assert.deepEqual(calls, []);
});

test("claims and revalidates before exact Storage removal, then requires confirmed absence", async () => {
  const { gateway, calls } = fixture();
  assert.deepEqual(await cleanupProfilePhotos(gateway), { claimed: 1, complete: 1, retry: 0, deferred: 0 });
  assert.deepEqual(calls, ["prune", "claim", "prepare", `remove:${path}`, "finish:true"]);
});

test("expired lease cannot start deletion and a stale finish cannot complete another claim", async () => {
  const before = fixture({ prepare: async () => { throw Error("Lease expired"); } });
  assert.equal((await cleanupProfilePhotos(before.gateway)).retry, 1);
  assert.ok(!before.calls.some((value) => value.startsWith("remove:")));
  const during = fixture({ finish: async () => false });
  assert.equal((await cleanupProfilePhotos(during.gateway)).retry, 1);
  assert.equal(during.calls.filter((value) => value.startsWith("remove:")).length, 1);
});

test("lost Storage reply retries by reading absence, without an unnecessary second delete", async () => {
  let exists = true;
  let deletes = 0;
  const { gateway } = fixture({
    prepare: async () => exists ? { action: "delete", path } : { action: "absent" },
    remove: async () => { deletes++; exists = false; throw Error("Reply lost"); },
  });
  assert.equal((await cleanupProfilePhotos(gateway)).retry, 1);
  assert.equal((await cleanupProfilePhotos(gateway)).complete, 1);
  assert.equal(deletes, 1);
});

test("Storage failure stays retryable and does not complete; account deletion owns its remaining files", async () => {
  const failure = fixture({ remove: async () => { throw Error("Private upstream failure"); } });
  assert.equal((await cleanupProfilePhotos(failure.gateway)).retry, 1);
  assert.ok(!failure.calls.includes("finish:true"));
  const deleting = fixture({ prepare: async () => ({ action: "account-deletion" }) });
  assert.equal((await cleanupProfilePhotos(deleting.gateway)).deferred, 1);
  assert.ok(!deleting.calls.some((value) => value.startsWith("remove:")));
});

test("server paths cannot escape the claimed account; caller body does not select paths", async () => {
  for (const unsafe of ["someone-else/photo.jpg", `${job.userId}/../photo.jpg`, `${job.userId}/`]) {
    const { gateway, calls } = fixture({ prepare: async () => ({ action: "delete", path: unsafe }) });
    assert.equal((await cleanupProfilePhotos(gateway)).retry, 1);
    assert.ok(!calls.some((value) => value.startsWith("remove:")));
  }
  const { gateway, calls } = fixture();
  const handler = createPhotoCleanupHandler(gateway, true, "s".repeat(32));
  const response = await handler(new Request("https://worker.invalid", {
    method: "POST", headers: { Authorization: `Bearer ${"s".repeat(32)}` },
    body: JSON.stringify({ path: "someone-else/photo.jpg" }),
  }));
  assert.equal(response.status, 200);
  assert.ok(calls.includes(`remove:${path}`));
  assert.ok(!(await response.text()).includes(job.userId));
});

test("gateway uses service-only lease RPCs and Storage HTTP with a timeout", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (input: string | URL | Request, init: RequestInit) => {
    requests.push({ url: String(input), init });
    return Response.json(true);
  }) as typeof fetch;
  const gateway = profilePhotoCleanupGateway("https://fixture.invalid", "server-fixture-key", fetcher);
  await gateway.prepare(job);
  await gateway.remove(path);
  await gateway.finish(job, true);
  assert.equal(requests[0].url, "https://fixture.invalid/rest/v1/rpc/prepare_orphan_profile_photo");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { p_job: job.jobId, p_lease: job.leaseId });
  assert.equal(requests[1].url, "https://fixture.invalid/storage/v1/object/profile-photos");
  assert.equal(requests[1].init.method, "DELETE");
  assert.deepEqual(JSON.parse(String(requests[1].init.body)), { prefixes: [path] });
  assert.ok(requests.every(({ init }) => init.signal instanceof AbortSignal));
  assert.equal(requests[2].url, "https://fixture.invalid/rest/v1/rpc/finish_orphan_profile_photo");
});

test("upstream bodies and identifiers are not exposed by unavailable responses", async () => {
  const { gateway } = fixture({ claim: async () => { throw Error("Private upstream response"); } });
  const response = await createPhotoCleanupHandler(gateway, true, "s".repeat(32))(new Request("https://worker.invalid", {
    method: "POST", headers: { Authorization: `Bearer ${"s".repeat(32)}` },
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Photo cleanup unavailable" });
});
