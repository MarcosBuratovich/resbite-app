import { createReceiptPurgeHandler } from "../_shared/deletion-receipt-retention.ts";
import { ACCOUNT_DELETION_RELEASE_APPROVED, DELETION_RECEIPT_PURGE_RELEASE_APPROVED } from "../_shared/deletion-release.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(
  createReceiptPurgeHandler(
    async () => {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const response = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/purge_completed_deletion_receipts`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_limit: 100 }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw Error("Receipt purge failed");
      return await response.json();
    },
    ACCOUNT_DELETION_RELEASE_APPROVED && DELETION_RECEIPT_PURGE_RELEASE_APPROVED &&
      Deno.env.get("ACCOUNT_DELETION_ENABLED") === "true" &&
      Deno.env.get("ACCOUNT_RECEIPT_PURGE_ENABLED") === "true",
    Deno.env.get("ACCOUNT_RECEIPT_PURGE_SECRET") || "",
  ),
);
