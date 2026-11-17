import { createDeletionHandler } from "../_shared/account-deletion.ts";
import { accountDeletionGateway } from "../_shared/account-deletion-gateway.ts";
import { appleRevocationConfig } from "../_shared/apple-revocation.ts";
import { ACCOUNT_DELETION_RELEASE_APPROVED } from "../_shared/deletion-release.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const enabled = ACCOUNT_DELETION_RELEASE_APPROVED && Deno.env.get("ACCOUNT_DELETION_ENABLED") === "true";
const url = Deno.env.get("SUPABASE_URL") || "https://unconfigured.invalid";
const gateway = accountDeletionGateway(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  fetch,
  // Null, so Apple revocation is skipped, until APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID and APPLE_PRIVATE_KEY are set.
  appleRevocationConfig((name) => Deno.env.get(name)),
);
Deno.serve(createDeletionHandler(gateway.request, enabled));
