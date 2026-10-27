import { foldGateway, handleFold } from "../_shared/phone-fold.ts";
import { PHONE_FOLD_RELEASE_APPROVED } from "../_shared/fold-release.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const gateway = foldGateway(
  Deno.env.get("SUPABASE_URL") || "https://unconfigured.invalid",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);
Deno.serve((request) => handleFold(request, { approved: PHONE_FOLD_RELEASE_APPROVED, ...gateway }));
