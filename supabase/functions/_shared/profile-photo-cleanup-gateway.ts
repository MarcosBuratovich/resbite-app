import type { PhotoCleanupGateway, PhotoCleanupJob } from "./profile-photo-cleanup.ts";

/** Server-only Storage HTTP and service-role RPC adapter. No SQL metadata delete. */
export function profilePhotoCleanupGateway(
  url: string,
  serviceKey: string,
  fetcher: typeof fetch = fetch,
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
    prune: async () => { await rpc("prune_profile_photo_cleanup", {}); },
    claim: () => rpc("claim_orphan_profile_photos", { p_limit: 5 }),
    prepare: (job) => rpc("prepare_orphan_profile_photo", lease(job)),
    remove: async (path) => { await call("/storage/v1/object/profile-photos", { prefixes: [path] }, "DELETE"); },
    finish: (job, complete) => rpc("finish_orphan_profile_photo", { ...lease(job), p_complete: complete }),
  };
}
