import type {
  CleanupGateway,
  DeletionGateway,
  DeletionJob,
  DeletionStatus,
  VerifiedIdentity,
} from "./account-deletion.ts";
import {
  revokeAppleAuthorization,
  type AppleRevocationConfig,
} from "./apple-revocation.ts";
const statuses: DeletionStatus["status"][] = ["queued", "processing", "complete"];
/** Server-only adapter. Never import this module from the mobile app. */
export function accountDeletionGateway(
  url: string,
  serviceKey: string,
  fetcher: typeof fetch = fetch,
  apple: AppleRevocationConfig | null = null,
): { request: DeletionGateway; cleanup: CleanupGateway } {
  if (
    !url.startsWith("https://") &&
    !url.startsWith("http://127.0.0.1:") &&
    !url.startsWith("http://localhost:")
  )
    throw Error("Invalid service URL");
  async function call(
    path: string,
    method: string,
    body?: unknown,
    bearer = serviceKey,
    allowMissing = false,
  ): Promise<any> {
    const response = await fetcher(`${url}${path}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw Error("Backend operation failed");
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (name: string, body: unknown) =>
    call(`/rest/v1/rpc/${name}`, "POST", body);
  const request: DeletionGateway = {
    async verify(token) {
      const user = await call("/auth/v1/user", "GET", undefined, token);
      // Auth has verified the token before claims are decoded. Never authorize from
      // user_metadata or JWT iat: refresh is not fresh authentication.
      const parts = token.split(".");
      if (parts.length !== 3) throw Error("Invalid token");
      const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(
        atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")),
      );
      if (
        claims.sub !== user.id ||
        claims.role !== "authenticated" ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= Date.now() / 1000
      )
        throw Error("Invalid identity");
      // ASR2-2: freshIdentity reads the sign-in providers (an account with Apple linked may confirm with Apple).
      const providers = claims.app_metadata?.providers;
      return {
        userId: user.id,
        sessionId: claims.session_id,
        amr: Array.isArray(claims.amr) ? claims.amr : [],
        providers: Array.isArray(providers)
          ? providers.filter((p: unknown): p is string => typeof p === "string")
          : [],
      } as VerifiedIdentity;
    },
    // D-4: one request path. request_account_deletion closes and erases the account in one
    // transaction, and answers an existing request first, so a retry gets its receipt back.
    async request(userId, sessionId, requestId, recoveryToken) {
      const answer = await rpc("request_account_deletion", {
        p_user: userId,
        p_session: sessionId,
        p_request: requestId,
        p_recovery: recoveryToken,
      });
      if (answer?.requestId !== requestId || !statuses.includes(answer?.status))
        throw Error("Unexpected deletion answer");
      return { requestId: answer.requestId, status: answer.status };
    },
    status: (requestId, recoveryToken) =>
      rpc("account_deletion_status", {
        p_request: requestId,
        p_recovery: recoveryToken,
      }),
    revoke: async (token) => {
      await call("/auth/v1/logout?scope=global", "POST", undefined, token);
    },
    // ASR2-8: best effort, and a no-op until the four Apple secrets are set.
    // revokeAppleAuthorization never throws and has its own 5-second timeouts.
    revokeApple: async (authorizationCode) => {
      if (!apple) return;
      await revokeAppleAuthorization(authorizationCode, apple, fetcher);
    },
  };
  const lease = (job: DeletionJob) => ({
    p_request: job.requestId,
    p_lease: job.leaseId,
  });
  const cleanup: CleanupGateway = {
    claim: () => rpc("claim_account_deletions", { p_limit: 2 }),
    // ASR2-9: both buckets under the account's folder, at most 100 per page.
    storageObjects: (job) => rpc("deletion_storage_objects", lease(job)),
    removeObjects: async (bucket, names) => {
      await call(`/storage/v1/object/${bucket}`, "DELETE", {
        prefixes: names,
      });
    },
    deleteAuth: async (userId) => {
      await call(
        `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        "DELETE",
        { should_soft_delete: false },
        serviceKey,
        true,
      );
    },
    finish: (job, complete) =>
      rpc("finish_account_deletion", { ...lease(job), p_complete: complete }),
  };
  return { request, cleanup };
}
