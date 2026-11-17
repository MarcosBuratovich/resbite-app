import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  ACCOUNT_DELETION_RELEASE_APPROVED,
  DELETION_RECEIPT_PURGE_RELEASE_APPROVED,
} from "./deletion-release.ts";

// Exercise the deployed entry points, not just their injectable handlers. The test holds whichever way the
// checked-in source gates stand, so it stays green after Rollout step 5 flips the deletion gates and after
// plan 6's rollout flips the photo worker's.
const entries = ["delete-account", "cleanup-account", "purge-deletion-receipts", "cleanup-profile-photos"];
// The photo worker's gate is not exported: read it from its source.
const photoGate = readFileSync(new URL("../cleanup-profile-photos/index.ts", import.meta.url), "utf8")
  .match(/PHOTO_CLEANUP_RELEASE_APPROVED = (true|false);/)?.[1];
assert.ok(photoGate, "cleanup-profile-photos declares PHOTO_CLEANUP_RELEASE_APPROVED");
const gates = [
  { approved: ACCOUNT_DELETION_RELEASE_APPROVED, entries: ["delete-account", "cleanup-account", "purge-deletion-receipts"] },
  { approved: DELETION_RECEIPT_PURGE_RELEASE_APPROVED, entries: ["purge-deletion-receipts"] },
  { approved: photoGate === "true", entries: ["cleanup-profile-photos"] },
];

const secret = "fixture-only-secret-".repeat(3);
const localRequire = createRequire(import.meta.url);
type Handler = (request: Request) => Promise<Response>;

// Each entry reads its environment when it loads, so each case loads it afresh: its own query string makes a new
// module in native ESM (and Deno). Under the tsx loader these .ts files run as CommonJS, whose cache is keyed by
// the path alone, so the entry is dropped from that cache first.
async function answers(load: string[], flags: "off" | "on", get: (name: string) => string | undefined) {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env: { get(name: string): string | undefined }; serve(handler: Handler): void };
  };
  const originalDeno = runtime.Deno;
  const originalFetch = globalThis.fetch;
  let handler: Handler | undefined;
  let networkCalls = 0;
  const results: { entry: string; status: number; networkCalls: number }[] = [];
  runtime.Deno = { env: { get }, serve: (value) => { handler = value; } };
  globalThis.fetch = async () => { networkCalls++; throw Error("No backend call allowed before release"); };
  try {
    for (const entry of load) {
      handler = undefined;
      networkCalls = 0;
      delete localRequire.cache[localRequire.resolve(`../${entry}/index.ts`)];
      await import(`../${entry}/index.ts?flags=${flags}`);
      // Assigned by Deno.serve during the import, which the compiler can't see.
      const registered = handler as Handler | undefined;
      assert.ok(registered, `${entry} registered its handler`);
      const response = await registered(new Request(`https://fixture.invalid/${entry}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", requestId: "44000000-0000-4000-8000-000000000001", recoveryToken: "a".repeat(64), proof: "fixture" }),
      }));
      results.push({ entry, status: response.status, networkCalls });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDeno === undefined) delete runtime.Deno;
    else runtime.Deno = originalDeno;
  }
  return results;
}

test("with every *_ENABLED flag unset, each entry point answers 503 and makes no network call", async () => {
  const results = await answers(entries, "off", (name) =>
    name === "SUPABASE_URL" ? "https://fixture.invalid" : name.endsWith("_ENABLED") ? undefined : secret);
  assert.deepEqual(results, entries.map((entry) => ({ entry, status: 503, networkCalls: 0 })));
});

test("an entry point whose source gate is false stays disabled with every environment flag enabled", async (t) => {
  const gated = entries.filter((entry) => gates.some((gate) => !gate.approved && gate.entries.includes(entry)));
  if (!gated.length) {
    t.skip("every source gate is approved");
    return;
  }
  // Only the gated entries load: an approved one is never run with every flag on.
  const results = await answers(gated, "on", (name) =>
    name === "SUPABASE_URL" ? "https://fixture.invalid" : name.endsWith("_ENABLED") ? "true" : secret);
  // fold-phone-account was gated the same way until its release (PHONE_FOLD_RELEASE_APPROVED, 28 October 2026).
  assert.deepEqual(
    results,
    gated.map((entry) => ({ entry, status: 503, networkCalls: 0 })),
    "must not contact Auth, SQL or Storage",
  );
});
