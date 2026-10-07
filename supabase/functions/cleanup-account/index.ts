import { createCleanupHandler } from "../_shared/account-deletion.ts";
import { accountDeletionGateway } from "../_shared/account-deletion-gateway.ts";
import { ACCOUNT_DELETION_RELEASE_APPROVED } from "../_shared/deletion-release.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const gateway = accountDeletionGateway(
  Deno.env.get("SUPABASE_URL") || "https://unconfigured.invalid",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);
Deno.serve(
  createCleanupHandler(
    gateway.cleanup,
    ACCOUNT_DELETION_RELEASE_APPROVED && Deno.env.get("ACCOUNT_DELETION_ENABLED") === "true",
    Deno.env.get("ACCOUNT_CLEANUP_SECRET") || "",
  ),
);
