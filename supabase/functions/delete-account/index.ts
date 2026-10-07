import { createDeletionHandler } from "../_shared/account-deletion.ts";
import { accountDeletionGateway } from "../_shared/account-deletion-gateway.ts";
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
);
Deno.serve(createDeletionHandler(gateway.request, enabled));
