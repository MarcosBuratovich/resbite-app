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
        components: [
          { "/": "/invite", comment: "Resbite invitations only; auth setup remains separate." },
          { "/": "/r/*", comment: "Event links (GI1): the app opens on the invitation." },
        ],
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
    assert.equal(vercel.rewrites[0].source, "/invite");
  } finally {
    await cleanup();
  }
});

test("a bad team ID or origin is refused before anything is written", async () => {
  await assert.rejects(generate("https://link.resbite.com", "short", "com.resbite.app", "/tmp/never"), /Usage/);
  await assert.rejects(generate("http://link.resbite.com", "ABCDE12345", "com.resbite.app", "/tmp/never"), /HTTPS/);
});

test("the event page's functions, assets and routes are part of the site (GI1)", async () => {
  const { out, cleanup } = await site();
  try {
    for (const name of ["api/page.mjs", "api/image.mjs", "lib/render.mjs", "lib/supabase.mjs", "page.css", "page.js", "api/personal.mjs", "lib/personal.mjs", "lib/options.mjs", "personal.js", "personal-flow.mjs", "personal.css", "activities/coffee-together.png"])
      assert.ok((await readFile(join(out, name))).length > 0, name);
    const vercel = JSON.parse(await readFile(join(out, "vercel.json"), "utf8"));
    // Any /r/<code> reaches the functions, which render a malformed or truncated code as inactive (with the
    // page's headers) rather than leaving it to Vercel's bare 404.
    assert.deepEqual(vercel.rewrites, [
      { source: "/invite", destination: "/invite.html" },
      { source: "/r/:code/image", destination: "/api/image?code=:code" },
      { source: "/r/:code", destination: "/api/page?code=:code" },
      { source: "/i/:code/image", destination: "/api/image?kind=personal&code=:code" },
      { source: "/i/:code", destination: "/api/personal?code=:code" },
    ]);
    assert.deepEqual(vercel.functions, { "api/image.mjs": { includeFiles: "{resbite-mark.png,activities/**}" } });
    // /i/ is web-only: Apple's file lists neither it nor anything beyond /invite and /r/*.
    const aasa = await readFile(join(out, ".well-known/apple-app-site-association"), "utf8");
    assert.deepEqual(JSON.parse(aasa).applinks.details[0].components.map((c) => c["/"]), ["/invite", "/r/*"]);
    assert.ok(!aasa.includes("/i/"));
    assert.match(await readFile(join(out, "hosting-requirements.txt"), "utf8"), /SUPABASE_SECRET_KEY \(cover photos only\)/);
    // The deployed folder carries no key: the functions read them from the environment.
    for (const name of ["api/page.mjs", "api/image.mjs", "api/personal.mjs", "lib/personal.mjs", "lib/options.mjs", "lib/supabase.mjs"])
      assert.ok(!/sb_(secret|publishable)_[A-Za-z0-9]/.test(await readFile(join(out, name), "utf8")), name);
  } finally {
    await cleanup();
  }
});
