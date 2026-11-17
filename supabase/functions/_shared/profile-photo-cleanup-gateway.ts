import type { PhotoCleanupGateway, PhotoCleanupJob } from "./profile-photo-cleanup.ts";

/** One store the worker cleans: its Storage bucket and its four service-only lease RPCs. */
export type CleanupTarget = {
  bucket: "profile-photos" | "plan-covers";
  prune: string;
  claim: string;
  prepare: string;
  finish: string;
};
export const PROFILE_PHOTOS: CleanupTarget = {
  bucket: "profile-photos",
  prune: "prune_profile_photo_cleanup",
  claim: "claim_orphan_profile_photos",
  prepare: "prepare_orphan_profile_photo",
  finish: "finish_orphan_profile_photo",
};
export const PLAN_COVERS: CleanupTarget = {
  bucket: "plan-covers",
  prune: "prune_plan_cover_cleanup",
  claim: "claim_orphan_plan_covers",
  prepare: "prepare_orphan_plan_cover",
  finish: "finish_orphan_plan_cover",
};

/** Server-only Storage HTTP and service-role RPC adapter. No SQL metadata delete. */
export function profilePhotoCleanupGateway(
  url: string,
  serviceKey: string,
  fetcher: typeof fetch = fetch,
  target: CleanupTarget = PROFILE_PHOTOS,
): PhotoCleanupGateway {
  if (!url.startsWith("https://") && !url.startsWith("http://127.0.0.1:") && !url.startsWith("http://localhost:"))
    throw Error("Invalid service URL");
  async function call(path: string, body: unknown, method = "POST") {
    const response = await fetcher(`${url}${path}`, {
      method,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("Backend operation failed");
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (name: string, body: unknown) => call(`/rest/v1/rpc/${name}`, body);
  const lease = (job: PhotoCleanupJob) => ({ p_job: job.jobId, p_lease: job.leaseId });
  return {
    prune: async () => { await rpc(target.prune, {}); },
    claim: () => rpc(target.claim, { p_limit: 5 }),
    prepare: (job) => rpc(target.prepare, lease(job)),
    remove: async (path) => { await call(`/storage/v1/object/${target.bucket}`, { prefixes: [path] }, "DELETE"); },
    finish: (job, complete) => rpc(target.finish, { ...lease(job), p_complete: complete }),
  };
}
