import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanupProfilePhotos, cleanupStoredImages, createPhotoCleanupHandler, type PhotoCleanupGateway, type PhotoCleanupJob } from "./profile-photo-cleanup.ts";
import { PLAN_COVERS, PROFILE_PHOTOS, profilePhotoCleanupGateway } from "./profile-photo-cleanup-gateway.ts";

const job: PhotoCleanupJob = {
  jobId: "81000000-0000-4000-8000-000000000001",
  userId: "82000000-0000-4000-8000-000000000001",
  leaseId: "83000000-0000-4000-8000-000000000001",
  attempts: 1,
};
const path = `${job.userId}/photo.jpg`;
// A cover lives at <owner id>/<plan id>/<name>.jpg; the claim's userId is the owner folder's id.
const coverPath = `${job.userId}/84000000-0000-4000-8000-000000000001/c.jpg`;
function fixture(overrides: Partial<PhotoCleanupGateway> = {}, calls: string[] = []) {
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

test("a held job is deferred without touching storage", async () => {
  const { gateway, calls } = fixture({ prepare: async () => { calls.push("prepare"); return { action: "held" }; } });
  assert.deepEqual(await cleanupProfilePhotos(gateway), { claimed: 1, complete: 0, retry: 0, deferred: 1 });
  assert.deepEqual(calls, ["prune", "claim", "prepare", "finish:false"]);
});

test("the cover target calls the cover RPCs and removes from plan-covers", async () => {
  assert.deepEqual(PROFILE_PHOTOS, {
    bucket: "profile-photos", prune: "prune_profile_photo_cleanup", claim: "claim_orphan_profile_photos",
    prepare: "prepare_orphan_profile_photo", finish: "finish_orphan_profile_photo",
  });
  assert.deepEqual(PLAN_COVERS, {
    bucket: "plan-covers", prune: "prune_plan_cover_cleanup", claim: "claim_orphan_plan_covers",
    prepare: "prepare_orphan_plan_cover", finish: "finish_orphan_plan_cover",
  });
  // A recording fetcher: the URLs, methods and bodies, in order, with the replies the database would give.
  const requests: { url: string; method: string; body: unknown }[] = [];
  const replies: Record<string, unknown> = {
    "/rest/v1/rpc/prune_plan_cover_cleanup": 0,
    "/rest/v1/rpc/claim_orphan_plan_covers": [job],
    "/rest/v1/rpc/prepare_orphan_plan_cover": { action: "delete", path: coverPath },
    "/storage/v1/object/plan-covers": [],
    "/rest/v1/rpc/finish_orphan_plan_cover": true,
  };
  const fetcher = (async (input: string | URL | Request, init: RequestInit) => {
    const route = String(input).replace("https://fixture.invalid", "");
    requests.push({ url: route, method: String(init.method), body: JSON.parse(String(init.body)) });
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(replies[route] ?? null);
  }) as typeof fetch;
  const gateway = profilePhotoCleanupGateway("https://fixture.invalid", "server-fixture-key", fetcher, PLAN_COVERS);
  assert.deepEqual(await cleanupProfilePhotos(gateway), { claimed: 1, complete: 1, retry: 0, deferred: 0 });
  assert.deepEqual(requests, [
    { url: "/rest/v1/rpc/prune_plan_cover_cleanup", method: "POST", body: {} },
    { url: "/rest/v1/rpc/claim_orphan_plan_covers", method: "POST", body: { p_limit: 5 } },
    { url: "/rest/v1/rpc/prepare_orphan_plan_cover", method: "POST", body: { p_job: job.jobId, p_lease: job.leaseId } },
    { url: "/storage/v1/object/plan-covers", method: "DELETE", body: { prefixes: [coverPath] } },
    { url: "/rest/v1/rpc/finish_orphan_plan_cover", method: "POST", body: { p_job: job.jobId, p_lease: job.leaseId, p_complete: true } },
  ]);
  assert.ok(!requests.some(({ url }) => url.includes("profile")), "the cover target never calls a photo RPC or bucket");
});

test("the handler runs photos, then covers, and sums the two", async () => {
  const calls: string[] = [];
  const photos = fixture({ prune: async () => { calls.push("photos:prune"); } }, calls);
  const covers = fixture({
    prune: async () => { calls.push("covers:prune"); },
    prepare: async () => { calls.push("prepare"); return { action: "delete", path: coverPath }; },
  }, calls);
  const handler = createPhotoCleanupHandler([photos.gateway, covers.gateway], true, "s".repeat(32));
  const response = await handler(new Request("https://worker.invalid", {
    method: "POST", headers: { Authorization: `Bearer ${"s".repeat(32)}` },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { claimed: 2, complete: 2, retry: 0, deferred: 0 });
  assert.deepEqual(calls, [
    "photos:prune", "claim", "prepare", `remove:${path}`, "finish:true",
    "covers:prune", "claim", "prepare", `remove:${coverPath}`, "finish:true",
  ]);
});

test("every count is summed across the stores, and a held job in one store does not stop the next", async () => {
  // Each store claims three jobs: one removed, one held, one whose Storage call fails.
  const jobs = ["1", "2", "3"].map((n) => ({ ...job, jobId: `81000000-0000-4000-8000-00000000000${n}` }));
  const outcomes = (base: string) => fixture({
    claim: async () => jobs,
    prepare: async (claimed) => claimed.jobId === jobs[1].jobId ? { action: "held" } : { action: "delete", path: `${base}${claimed.jobId}.jpg` },
    remove: async (value) => { if (value.includes(jobs[2].jobId)) throw Error("Storage unavailable"); },
  });
  const photos = outcomes(`${job.userId}/`);
  const covers = outcomes(`${job.userId}/84000000-0000-4000-8000-000000000001/`);
  assert.deepEqual(await cleanupStoredImages([photos.gateway, covers.gateway]), { claimed: 6, complete: 2, retry: 2, deferred: 2 });
  assert.deepEqual(await cleanupStoredImages([]), { claimed: 0, complete: 0, retry: 0, deferred: 0 });
});

test("both targets are served, and the source gate is a literal the rollout flips", () => {
  const source = readFileSync(new URL("../cleanup-profile-photos/index.ts", import.meta.url), "utf8");
  // Plan 2's deletion-release.test.ts reads the same literal and checks the entry is inert while it is false.
  assert.match(source, /PHOTO_CLEANUP_RELEASE_APPROVED = (true|false);/);
  assert.ok(source.includes("PROFILE_PHOTOS"), "the entry serves the photo target");
  assert.ok(source.includes("PLAN_COVERS"), "the entry serves the cover target");
  assert.ok(source.indexOf("PROFILE_PHOTOS)") < source.indexOf("PLAN_COVERS)"), "photos are served before covers");
});
