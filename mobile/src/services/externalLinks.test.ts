import test from "node:test";
import assert from "node:assert/strict";
import { openExternal } from "./externalLinks";

test("openExternal answers true when the link opens", async () => {
  const seen: string[] = [];
  assert.equal(
    await openExternal("https://x.example/a", async (url) => {
      seen.push(url);
    }),
    true,
  );
  assert.deepEqual(seen, ["https://x.example/a"]);
});

test("openExternal answers false when opening rejects or throws", async () => {
  assert.equal(await openExternal("https://x.example/a", async () => Promise.reject(new Error("no"))), false);
  assert.equal(
    await openExternal("https://x.example/a", () => {
      throw new Error("no");
    }),
    false,
  );
});
