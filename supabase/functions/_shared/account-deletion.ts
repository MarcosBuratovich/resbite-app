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
  /** The verified token's app_metadata.providers (`[]` when absent). */
  providers: string[];
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
  /** Best effort; resolves whether or not Apple answered. */
  revokeApple: (authorizationCode: string) => Promise<void>;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Apple's authorisation code, as apple-revocation.ts accepts it. */
const appleCode = /^[A-Za-z0-9._-]{1,1024}$/;
export function freshIdentity(identity: VerifiedIdentity, now: number) {
  // ASR2-2: a password or a code (Supabase records an email or SMS code as `otp`) proves any account.
  // An account with Apple linked may also prove itself with a fresh Sign in with Apple (`oauth`), the
  // only way to get the code that revokes its Apple tokens. A Google account without Apple proves
  // itself with an email code, so `oauth` never counts for it.
  const providers = Array.isArray(identity.providers) ? identity.providers : [];
  const methods = providers.includes("apple")
    ? ["password", "otp", "oauth"]
    : ["password", "otp"];
  return (
    uuid.test(identity.userId) &&
    uuid.test(identity.sessionId) &&
    identity.amr.some(
      ({ method, timestamp }) =>
        methods.includes(method) &&
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
    const { action, requestId, recoveryToken, appleAuthorizationCode } = body;
    // The app sends Apple's one-time authorisation code only after an Apple re-authentication.
    if (
      appleAuthorizationCode !== undefined &&
      (typeof appleAuthorizationCode !== "string" ||
        !appleCode.test(appleAuthorizationCode))
    )
      return reply(400, { error: "Invalid request" });
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
    const proofToken = body.proof;
    if (!token || typeof proofToken !== "string" || proofToken.length > 10000)
      return reply(401, { error: "Fresh authentication required" });
    let identity: VerifiedIdentity;
    try {
      const [session, proof] = await Promise.all([
        gateway.verify(token),
        gateway.verify(proofToken),
      ]);
      if (session.userId !== proof.userId || !freshIdentity(proof, now()))
        return reply(401, {
          error: "Fresh authentication for the same account required",
        });
      identity = proof;
    } catch {
      return reply(401, { error: "Fresh authentication required" });
    }
    let result: DeletionStatus;
    try {
      result = await gateway.request(
        identity.userId,
        identity.sessionId,
        requestId,
        recoveryToken,
      );
    } catch {
      return reply(503, {
        error: "Request unconfirmed; check the saved receipt before retrying",
      });
    }
    // The deletion is durable now (D-4: one transaction). Neither the logout nor Apple can undo
    // it, and neither failing may hide it: the deletion, then the Supabase logout, then Apple.
    try {
      await gateway.revoke(proofToken);
    } catch {
      // Best effort.
    }
    // ASR2-8: the code is used only when the verified proof's account has Apple linked.
    const providers = Array.isArray(identity.providers) ? identity.providers : [];
    if (typeof appleAuthorizationCode === "string" && providers.includes("apple")) {
      try {
        await gateway.revokeApple(appleAuthorizationCode);
      } catch {
        // Best effort: a failure never fails the deletion.
      }
    }
    return reply(202, result);
  };
}
export type DeletionBucket = "profile-photos" | "plan-covers";
export type StoredObject = { bucket: DeletionBucket; name: string };
export type CleanupGateway = {
  claim: () => Promise<DeletionJob[]>;
  storageObjects: (job: DeletionJob) => Promise<StoredObject[]>;
  removeObjects: (bucket: DeletionBucket, names: string[]) => Promise<void>;
  deleteAuth: (userId: string) => Promise<void>;
  finish: (job: DeletionJob, complete: boolean) => Promise<boolean>;
};
/** ASR2-9: the two buckets that keep files under the account's folder, `<bucket>/<uid>/`. */
const deletionBuckets: DeletionBucket[] = ["plan-covers", "profile-photos"];
export async function cleanupAccounts(gateway: CleanupGateway) {
  const jobs = await gateway.claim();
  const summary = { claimed: jobs.length, complete: 0, retry: 0 };
  for (const job of jobs) {
    try {
      if (!uuid.test(job.userId)) throw Error("Invalid cleanup identity");
      let exhausted = false;
      for (let page = 0; page < 10; page++) {
        // Also fences an expired worker lease, and refuses while a legal hold names the account.
        const objects = await gateway.storageObjects(job);
        if (!Array.isArray(objects)) throw Error("Invalid storage listing");
        if (!objects.length) {
          exhausted = true;
          break;
        }
        // The whole page is checked before anything is removed.
        if (
          objects.some(
            (object) =>
              !deletionBuckets.includes(object?.bucket) ||
              typeof object.name !== "string" ||
              !object.name.startsWith(`${job.userId}/`) ||
              object.name.includes(".."),
          )
        )
          throw Error("Invalid storage object");
        for (const bucket of deletionBuckets) {
          const names = objects
            .filter((object) => object.bucket === bucket)
            .map((object) => object.name);
          if (names.length) await gateway.removeObjects(bucket, names);
        }
      }
      if (!exhausted) throw Error("More files remain");
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
