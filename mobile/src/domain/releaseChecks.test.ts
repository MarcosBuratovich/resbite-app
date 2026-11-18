import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { releaseProblems } from "./releaseChecks";

const SUPPORT = "EXPO_PUBLIC_SUPPORT_ADDRESS must be the support email address.";
const SUPABASE_URL = "EXPO_PUBLIC_SUPABASE_URL must be the project's https URL.";
const SUPABASE_KEY = "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.";
const PUSH = 'EXPO_PUBLIC_PUSH_ENABLED must be "true".';
const DELETION = 'EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED must be "true".';
// A made-up project and key: the release check never needs the real ones, and never prints a key.
const KEY = "sb_publishable_fixture0000000000000000";
const GOOD = {
  EXPO_PUBLIC_SUPPORT_ADDRESS: "help@x.example",
  EXPO_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
  EXPO_PUBLIC_PUSH_ENABLED: "true",
  EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: "true",
};
const mobile = fileURLToPath(new URL("../..", import.meta.url));

test("a complete production environment has no problems", () => {
  assert.deepEqual(releaseProblems(GOOD), []);
});

test("an empty environment names the support address, the Supabase URL and key, push and deletion, in that order", () => {
  assert.deepEqual(releaseProblems({}), [SUPPORT, SUPABASE_URL, SUPABASE_KEY, PUSH, DELETION]);
});

test("the Supabase URL must be the project's https URL, and not the example's placeholder", () => {
  const { EXPO_PUBLIC_SUPABASE_URL: _url, ...noUrl } = GOOD;
  assert.deepEqual(releaseProblems(noUrl), [SUPABASE_URL]);
  for (const value of [
    "",
    "  ",
    "http://abcdefghijklmnopqrst.supabase.co",
    "abcdefghijklmnopqrst.supabase.co",
    "https://YOUR_PROJECT.supabase.co",
    "https://unconfigured.supabase.co",
    "https://example.com",
    "https://supabase.co",
    "https://x.supabase.co.example.com",
  ])
    assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_SUPABASE_URL: value }), [SUPABASE_URL], JSON.stringify(value));
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_SUPABASE_URL: " https://abcdefghijklmnopqrst.supabase.co " }), []);
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co/" }), []);
});

test("the Supabase publishable key must be set, and not the example's placeholder", () => {
  const { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: _key, ...noKey } = GOOD;
  assert.deepEqual(releaseProblems(noKey), [SUPABASE_KEY]);
  for (const value of ["", "   ", "YOUR_PUBLISHABLE_KEY", "unconfigured"])
    assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value }), [SUPABASE_KEY], JSON.stringify(value));
  for (const problem of releaseProblems({ ...GOOD, EXPO_PUBLIC_SUPABASE_URL: "nope", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "YOUR_PUBLISHABLE_KEY" }))
    assert.ok(!problem.includes("nope") && !problem.includes("YOUR_PUBLISHABLE_KEY"), "a problem names the variable, never its value");
});

test("a support address that is not an address is a problem", () => {
  for (const value of ["help", " ", "a b@x.example"])
    assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_SUPPORT_ADDRESS: value }), [SUPPORT], JSON.stringify(value));
});

test("push and deletion must be exactly true", () => {
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_PUSH_ENABLED: "TRUE" }), [PUSH]);
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: "false" }), [DELETION]);
});

test("a legal-link override must be https when it is set", () => {
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_TERMS_URL: "http://legal.example.test/t" }), [
    "EXPO_PUBLIC_TERMS_URL is set but is not an https link.",
  ]);
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_TERMS_URL: "  " }), []);
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_PRIVACY_URL: "https://legal.example.test/p" }), []);
  assert.deepEqual(releaseProblems({ ...GOOD, EXPO_PUBLIC_PRIVACY_URL: "legal" }), [
    "EXPO_PUBLIC_PRIVACY_URL is set but is not an https link.",
  ]);
});

function run(env: Record<string, string>) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-release.mjs"], {
    cwd: mobile,
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}`, stdout: result.stdout };
}

test("the runner skips a build profile that is not production", () => {
  const r = run({ EAS_BUILD_PROFILE: "preview" });
  assert.equal(r.status, 0);
  assert.ok(r.out.includes('Release check skipped: build profile "preview" is not production.'));
});

test("the runner stops a production build that lacks the required values", () => {
  const r = run({ EAS_BUILD_PROFILE: "production" });
  assert.equal(r.status, 1);
  for (const line of [SUPPORT, SUPABASE_URL, SUPABASE_KEY, PUSH, DELETION]) assert.ok(r.out.includes(line), line);
  assert.ok(r.out.includes("Release check failed:"));
});

test("the runner stops a production build with no Supabase URL or key, and never prints the key", () => {
  const { EXPO_PUBLIC_SUPABASE_URL: _url, ...noUrl } = GOOD;
  const a = run({ EAS_BUILD_PROFILE: "production", ...noUrl });
  assert.equal(a.status, 1);
  assert.ok(a.out.includes(SUPABASE_URL));
  assert.ok(!a.out.includes("PASS"));
  assert.ok(!a.out.includes(KEY));
  const { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: _key, ...noKey } = GOOD;
  const b = run({ EAS_BUILD_PROFILE: "production", ...noKey });
  assert.equal(b.status, 1);
  assert.ok(b.out.includes(SUPABASE_KEY));
  assert.ok(!b.out.includes("PASS"));
});

test("the runner passes a complete production build, shows the links and never the address or the key", () => {
  const r = run({ EAS_BUILD_PROFILE: "production", ...GOOD });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.startsWith("PASS release check:"));
  assert.ok(r.out.includes("Supabase URL and key set"));
  assert.ok(r.out.includes("https://link.resbite.com/terms"));
  assert.ok(!r.out.includes("help@x.example"));
  assert.ok(!r.out.includes(KEY));
  assert.ok(!r.out.includes("abcdefghijklmnopqrst"));
});

test("EAS runs the release check after install", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["eas-build-post-install"], "npm run check:release");
  assert.equal(pkg.scripts["check:release"], "node --import tsx scripts/check-release.mjs");
});
