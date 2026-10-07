export type DeletionStatus = {
  requestId: string;
  status: "queued" | "processing" | "complete";
};
export type DeletionJob = {
  requestId: string;
  userId: string;
  leaseId: string;
  attempts: number;
};
export type VerifiedIdentity = {
  userId: string;
  sessionId: string;
  amr: { method: string; timestamp: number }[];
};
export type DeletionGateway = {
  verify: (accessToken: string) => Promise<VerifiedIdentity>;
  request: (
    userId: string,
    sessionId: string,
    requestId: string,
    recoveryToken: string,
  ) => Promise<DeletionStatus>;
  status: (
    requestId: string,
    recoveryToken: string,
  ) => Promise<DeletionStatus | null>;
  revoke: (accessToken: string) => Promise<void>;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function freshIdentity(identity: VerifiedIdentity, now: number) {
  return (
    uuid.test(identity.userId) &&
    uuid.test(identity.sessionId) &&
    identity.amr.some(
      ({ method, timestamp }) =>
        ["password", "otp"].includes(method) &&
        Number.isFinite(timestamp) &&
        timestamp <= now + 30 &&
        timestamp >= now - 300,
    )
  );
}
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
export function createDeletionHandler(
  gateway: DeletionGateway,
  enabled: boolean,
  now = () => Date.now() / 1000,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed" });
    if (!enabled)
      return reply(503, { error: "Account deletion is not enabled" });
    // Bound memory before JSON parsing, including chunked requests.
    let body: Record<string, unknown>;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { error: "Invalid request" });
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16384) {
          await reader.cancel();
          return reply(413, { error: "Request too large" });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (!body || Array.isArray(body))
        return reply(400, { error: "Invalid request" });
    } catch {
      return reply(400, { error: "Invalid request" });
    }
    const { action, requestId, recoveryToken } = body;
    if (
      typeof requestId !== "string" ||
      !uuid.test(requestId) ||
      typeof recoveryToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(recoveryToken)
    )
      return reply(400, { error: "Invalid recovery receipt" });
    if (action === "status") {
      try {
        const status = await gateway.status(requestId, recoveryToken);
        return status
          ? reply(200, status)
          : reply(404, { error: "Request not found" });
      } catch {
        return reply(503, {
          error: "Status unavailable; keep your receipt and retry",
        });
      }
    }
    if (action !== "request") return reply(400, { error: "Unknown action" });
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer ([^\s]+)$/)?.[1];
    if (!token || typeof body.proof !== "string" || body.proof.length > 10000)
      return reply(401, { error: "Fresh authentication required" });
    let identity: VerifiedIdentity;
    try {
      const [session, proof] = await Promise.all([
        gateway.verify(token),
        gateway.verify(body.proof),
      ]);
      if (session.userId !== proof.userId || !freshIdentity(proof, now()))
        return reply(401, {
          error: "Fresh authentication for the same account required",
        });
      identity = proof;
    } catch {
      return reply(401, { error: "Fresh authentication required" });
    }
    try {
      const result = await gateway.request(
        identity.userId,
        identity.sessionId,
        requestId,
        recoveryToken,
      );
      // SQL access block is already durable. Revocation failure must not hide an accepted request.
      await gateway.revoke(body.proof).catch(() => {});
      return reply(202, result);
    } catch {
      return reply(503, {
        error: "Request unconfirmed; check the saved receipt before retrying",
      });
    }
  };
}
export type CleanupGateway = {
  claim: () => Promise<DeletionJob[]>;
  photoPaths: (job: DeletionJob) => Promise<string[]>;
  removePhotos: (paths: string[]) => Promise<void>;
  deleteAuth: (userId: string) => Promise<void>;
  finish: (job: DeletionJob, complete: boolean) => Promise<boolean>;
};
export async function cleanupAccounts(gateway: CleanupGateway) {
  const jobs = await gateway.claim();
  const summary = { claimed: jobs.length, complete: 0, retry: 0 };
  for (const job of jobs) {
    try {
      if (!uuid.test(job.userId)) throw Error("Invalid cleanup identity");
      let exhausted = false;
      for (let batch = 0; batch < 10; batch++) {
        const paths = await gateway.photoPaths(job); // also fences an expired worker lease
        if (!paths.length) {
          exhausted = true;
          break;
        }
        if (
          paths.some(
            (path) => !path.startsWith(`${job.userId}/`) || path.includes(".."),
          )
        )
          throw Error("Invalid photo prefix");
        await gateway.removePhotos(paths);
      }
      if (!exhausted) throw Error("More photos remain");
      await gateway.deleteAuth(job.userId); // successful hard deletion cascades profile/endpoints
      if (!(await gateway.finish(job, true))) throw Error("Lease changed");
      summary.complete++;
    } catch {
      // No user data, secrets or upstream error bodies in logs or responses.
      await gateway.finish(job, false).catch(() => false);
      summary.retry++;
    }
  }
  return summary;
}
export function createCleanupHandler(
  gateway: CleanupGateway,
  enabled: boolean,
  secret: string,
) {
  return async (request: Request) => {
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed" });
    if (!enabled || secret.length < 32)
      return reply(503, { error: "Cleanup disabled" });
    if (request.headers.get("Authorization") !== `Bearer ${secret}`)
      return reply(401, { error: "Unauthorized" });
    try {
      return reply(200, await cleanupAccounts(gateway));
    } catch {
      return reply(503, { error: "Cleanup unavailable" });
    }
  };
}
