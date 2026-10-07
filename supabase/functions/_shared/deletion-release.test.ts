import test from "node:test";
import assert from "node:assert/strict";

// Exercise the deployed entry points, not just their injectable handlers: even
// an environment with every activation flag set must remain inert pre-release.
test("destructive entry points stay disabled with all environment flags enabled", async () => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env: { get(name: string): string }; serve(handler: (request: Request) => Promise<Response>): void };
  };
  const originalDeno = runtime.Deno;
  const originalFetch = globalThis.fetch;
  const secret = "fixture-only-secret-".repeat(3);
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let networkCalls = 0;
  runtime.Deno = {
    env: { get: (name) => name === "SUPABASE_URL" ? "https://fixture.invalid" : name.endsWith("_ENABLED") ? "true" : secret },
    serve: (value) => { handler = value; },
  };
  globalThis.fetch = async () => { networkCalls++; throw Error("No backend call allowed before release"); };
  try {
    for (const entry of ["delete-account", "cleanup-account", "purge-deletion-receipts", "cleanup-profile-photos"]) {
      handler = undefined;
      await import(`../${entry}/index.ts`);
      assert.ok(handler, `${entry} registered its handler`);
      const response = await handler(new Request(`https://fixture.invalid/${entry}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", requestId: "44000000-0000-4000-8000-000000000001", recoveryToken: "a".repeat(64), proof: "fixture" }),
      }));
      assert.equal(response.status, 503, entry);
      assert.equal(networkCalls, 0, `${entry} must not contact Auth, SQL or Storage`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDeno === undefined) delete runtime.Deno;
    else runtime.Deno = originalDeno;
  }
});
