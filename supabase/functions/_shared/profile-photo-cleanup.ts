export type PhotoCleanupJob = {
  jobId: string;
  userId: string;
  leaseId: string;
  attempts: number;
};
export type PhotoCleanupAction =
  | { action: "delete"; path: string }
  | { action: "absent" | "account-deletion" };
export type PhotoCleanupGateway = {
  prune: () => Promise<void>;
  claim: () => Promise<PhotoCleanupJob[]>;
  prepare: (job: PhotoCleanupJob) => Promise<PhotoCleanupAction>;
  remove: (path: string) => Promise<void>;
  finish: (job: PhotoCleanupJob, complete: boolean) => Promise<boolean>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The database permanently fences a path before returning it. Lease expiry
 * alone never releases the fence: a paused HTTP DELETE cannot hit a reused path. */
export async function cleanupProfilePhotos(gateway: PhotoCleanupGateway) {
  await gateway.prune();
  const jobs = await gateway.claim();
  if (!Array.isArray(jobs) || jobs.length > 20) throw Error("Invalid cleanup batch");
  const summary = { claimed: jobs.length, complete: 0, retry: 0, deferred: 0 };
  for (const job of jobs) {
    if (!uuid.test(job.jobId) || !uuid.test(job.userId) || !uuid.test(job.leaseId))
      throw Error("Invalid cleanup identity");
    try {
      const prepared = await gateway.prepare(job);
      if (prepared.action === "account-deletion") {
        if (!(await gateway.finish(job, false))) throw Error("Lease changed");
        summary.deferred++;
        continue;
      }
      if (prepared.action === "delete") {
        if (typeof prepared.path !== "string" ||
          !prepared.path.startsWith(`${job.userId}/`) ||
          prepared.path.length > 1024 || prepared.path.includes("..") ||
          prepared.path.length <= job.userId.length + 1)
          throw Error("Invalid photo path");
        await gateway.remove(prepared.path);
      } else if (prepared.action !== "absent") {
        throw Error("Invalid cleanup action");
      }
      // Successful HTTP is not proof of removal. SQL checks metadata absence and
      // current lease before accepting completion. Unknown replies retry safely.
      if (!(await gateway.finish(job, true))) throw Error("Lease changed");
      summary.complete++;
    } catch {
      await gateway.finish(job, false).catch(() => false);
      summary.retry++;
    }
  }
  return summary;
}

export function createPhotoCleanupHandler(
  gateway: PhotoCleanupGateway,
  enabled: boolean,
  secret: string,
) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
    if (!enabled || secret.length < 32)
      return Response.json({ error: "Photo cleanup disabled" }, { status: 503, headers });
    if (request.headers.get("Authorization") !== `Bearer ${secret}`)
      return new Response(null, { status: 401, headers });
    // There is intentionally no caller-selected account/path or request payload.
    try {
      return Response.json(await cleanupProfilePhotos(gateway), { headers });
    } catch {
      return Response.json({ error: "Photo cleanup unavailable" }, { status: 503, headers });
    }
  };
}
