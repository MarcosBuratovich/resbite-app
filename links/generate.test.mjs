// The invitation-link site (UX3): Apple's link file is scoped to invitations, and the page and its preview
// never carry event details. Run from mobile/: node --import tsx ../links/generate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate, INVITE_CSP } from "./generate.mjs";

async function site() {
  const dir = await mkdtemp(join(tmpdir(), "resbite-links-"));
  await generate("https://link.resbite.com", "ABCDE12345", "com.resbite.app", join(dir, "out"));
  return { out: join(dir, "out"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("Apple's link file names this app and only the invitation path", async () => {
  const { out, cleanup } = await site();
  try {
    const aasa = JSON.parse(await readFile(join(out, ".well-known/apple-app-site-association"), "utf8"));
    assert.deepEqual(aasa.applinks.details, [
      {
        appIDs: ["ABCDE12345.com.resbite.app"],
        components: [{ "/": "/invite", comment: "Resbite invitations only; auth setup remains separate." }],
      },
    ]);
    const fragment = JSON.parse(await readFile(join(out, "expo-ios-config.fragment.json"), "utf8"));
    assert.deepEqual(fragment, { ios: { associatedDomains: ["applinks:link.resbite.com"] } });
  } finally {
    await cleanup();
  }
});

test("the preview says only “You’re invited to a resbite”, and the page is accessible", async () => {
  const { out, cleanup } = await site();
  try {
    const page = await readFile(join(out, "invite.html"), "utf8");
    assert.match(page, /<meta property="og:title" content="You’re invited to a resbite" \/>/);
    assert.match(page, /<meta property="og:image" content="https:\/\/link\.resbite\.com\/resbite-mark\.png" \/>/);
    assert.ok(!page.includes("{{"), "Every placeholder is filled");
    assert.ok(!/og:description/.test(page), "No description that could carry details");
    assert.match(page, /<html lang="en">/);
    assert.match(page, /<main>/);
    assert.equal(page.match(/<h1>/g)?.length, 1);
    assert.ok(!/maximum-scale|user-scalable/.test(page), "Zoom is never blocked");
    assert.ok(!/https?:\/\/(?!link\.resbite\.com)/.test(page), "No third-party resources");
    const script = await readFile(join(out, "invite.js"), "utf8");
    assert.match(script, /\^#token=\[a-f0-9\]\{64\}\$/);
    assert.match(script, /resbite:\/\/invite\?token=/);
  } finally {
    await cleanup();
  }
});

test("the host serves the link file as JSON and the page with private headers", async () => {
  const { out, cleanup } = await site();
  try {
    const vercel = JSON.parse(await readFile(join(out, "vercel.json"), "utf8"));
    const headers = (source) =>
      Object.fromEntries(vercel.headers.find((h) => h.source === source).headers.map((h) => [h.key, h.value]));
    assert.equal(headers("/.well-known/apple-app-site-association")["Content-Type"], "application/json");
    for (const source of ["/invite", "/invite.html"]) {
      assert.equal(headers(source)["Referrer-Policy"], "no-referrer");
      assert.equal(headers(source)["Cache-Control"], "no-store");
      assert.equal(headers(source)["Content-Security-Policy"], INVITE_CSP);
    }
    assert.deepEqual(vercel.rewrites, [{ source: "/invite", destination: "/invite.html" }]);
  } finally {
    await cleanup();
  }
});

test("a bad team ID or origin is refused before anything is written", async () => {
  await assert.rejects(generate("https://link.resbite.com", "short", "com.resbite.app", "/tmp/never"), /Usage/);
  await assert.rejects(generate("http://link.resbite.com", "ABCDE12345", "com.resbite.app", "/tmp/never"), /HTTPS/);
});
