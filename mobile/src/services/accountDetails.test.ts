import test from "node:test";
import assert from "node:assert/strict";
import { accountDetailsAdapter } from "./accountDetails";

// Plan 4 (D-9): the optional details are gone, so the adapter only reads the account; it has no write.
test("the read sends the captured bearer token and refuses a reply without an id", async () => {
  const original = globalThis.fetch;
  const seen: string[] = [],
    urls: string[] = [];
  const replies: unknown[] = [{ id: "u1" }, {}];
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      seen.push((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify(replies.shift()));
    }) as typeof fetch;
    assert.equal((await accountDetailsAdapter("tok").read(new AbortController().signal)).id, "u1");
    assert.equal(seen[0], "Bearer tok");
    await assert.rejects(accountDetailsAdapter("tok").read(new AbortController().signal), /could not be verified/);
    assert.deepEqual(seen, ["Bearer tok", "Bearer tok"]);
    assert.ok(urls.every((url) => url.endsWith("/auth/v1/user")), urls.join(", "));
    assert.equal("update" in accountDetailsAdapter("tok"), false);
  } finally {
    globalThis.fetch = original;
  }
});
