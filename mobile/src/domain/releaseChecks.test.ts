import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { releaseProblems } from "./releaseChecks";

const SUPPORT = "EXPO_PUBLIC_SUPPORT_ADDRESS must be the support email address.";
const PUSH = 'EXPO_PUBLIC_PUSH_ENABLED must be "true".';
const DELETION = 'EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED must be "true".';
const GOOD = {
  EXPO_PUBLIC_SUPPORT_ADDRESS: "help@x.example",
  EXPO_PUBLIC_PUSH_ENABLED: "true",
  EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: "true",
};
const mobile = fileURLToPath(new URL("../..", import.meta.url));

test("a complete production environment has no problems", () => {
  assert.deepEqual(releaseProblems(GOOD), []);
});

test("an empty environment names the support address, push and deletion, in that order", () => {
  assert.deepEqual(releaseProblems({}), [SUPPORT, PUSH, DELETION]);
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
  for (const line of [SUPPORT, PUSH, DELETION]) assert.ok(r.out.includes(line), line);
  assert.ok(r.out.includes("Release check failed:"));
});

test("the runner passes a complete production build, shows the links and never the address", () => {
  const r = run({ EAS_BUILD_PROFILE: "production", ...GOOD });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.startsWith("PASS release check:"));
  assert.ok(r.out.includes("https://link.resbite.com/terms"));
  assert.ok(!r.out.includes("help@x.example"));
});

test("EAS runs the release check after install", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["eas-build-post-install"], "npm run check:release");
  assert.equal(pkg.scripts["check:release"], "node --import tsx scripts/check-release.mjs");
});
