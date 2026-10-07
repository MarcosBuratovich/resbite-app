import type {
  CleanupGateway,
  DeletionGateway,
  DeletionJob,
  VerifiedIdentity,
} from "./account-deletion.ts";
import { ledgerBackedDeletionRequest, type DeletionAdmissionBackend, type IntentRecorder } from "./deletion-admission.ts";
/** Server-only adapter. Never import this module from the mobile app. */
export function accountDeletionGateway(
  url: string,
  serviceKey: string,
  fetcher: typeof fetch = fetch,
) {
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
      return {
        userId: user.id,
        sessionId: claims.session_id,
        amr: Array.isArray(claims.amr) ? claims.amr : [],
      } as VerifiedIdentity;
    },
    request: async () => {
      throw Error("Independent recovery ledger is not configured");
    },
    status: (requestId, recoveryToken) =>
      rpc("account_deletion_status", {
        p_request: requestId,
        p_recovery: recoveryToken,
      }),
    revoke: async (token) => {
      await call("/auth/v1/logout?scope=global", "POST", undefined, token);
    },
  };
  const lease = (job: DeletionJob) => ({
    p_request: job.requestId,
    p_lease: job.leaseId,
  });
  const cleanup: CleanupGateway = {
    claim: () => rpc("claim_account_deletions", { p_limit: 2 }),
    photoPaths: (job) => rpc("deletion_photo_paths", lease(job)),
    removePhotos: async (paths) => {
      await call("/storage/v1/object/profile-photos", "DELETE", {
        prefixes: paths,
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
  function admission(project: string): DeletionAdmissionBackend {
    return {
      prepare: (input) => rpc("prepare_deletion_intent", {
        p_user: input.userId, p_session: input.sessionId,
        p_request: input.requestId, p_recovery: input.recoveryToken,
        p_project: project,
      }),
      activate: (intent, recoveryToken) => rpc("activate_deletion_intent", {
        p_user: intent.userId, p_request: intent.requestId,
        p_recovery: recoveryToken, p_project: intent.project,
        p_requested_at: intent.requestedAt,
      }),
    };
  }
  const withLedger = (project: string, ledger: IntentRecorder): DeletionGateway => ({
    ...request,
    request: ledgerBackedDeletionRequest(project, admission(project), ledger),
  });
  return { request, cleanup, admission, withLedger };
}
