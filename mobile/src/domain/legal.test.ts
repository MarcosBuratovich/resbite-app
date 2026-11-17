import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY, LEGAL_COPY, PRIVACY_ADDRESS, httpsUrl, legalUrls, termsRuns } from "./legal";

test("httpsUrl trims a good https link and refuses everything else", () => {
  assert.equal(httpsUrl(" https://legal.example.test/terms "), "https://legal.example.test/terms");
  for (const bad of [
    undefined,
    "",
    "   ",
    "http://legal.example.test/terms",
    "terms",
    "https://legal example.test/terms",
    "https://localhost/terms",
    "https://legal.example.test/te​rms",
  ])
    assert.equal(httpsUrl(bad), null, String(bad));
});

test("legalUrls uses the canonical pages unless an https override is given", () => {
  assert.deepEqual(legalUrls({ terms: undefined, privacy: undefined }), {
    privacy: "https://link.resbite.com/privacy",
    terms: "https://link.resbite.com/terms",
    communityRules: "https://link.resbite.com/terms#community-rules",
    support: "https://link.resbite.com/support",
  });
  const urls = legalUrls({ terms: "https://legal.example.test/t#old", privacy: "http://legal.example.test/p" });
  assert.equal(urls.terms, "https://legal.example.test/t#old");
  assert.equal(urls.communityRules, "https://legal.example.test/t#community-rules");
  assert.equal(urls.privacy, "https://link.resbite.com/privacy");
  assert.equal(urls.support, "https://link.resbite.com/support");
});

test("termsRuns links each whole document name and nothing else", () => {
  const urls = { terms: "T", privacy: "P" };
  assert.deepEqual(termsRuns("I agree to the Terms and Privacy Policy.", urls), [
    { text: "I agree to the " },
    { text: "Terms", url: "T" },
    { text: " and " },
    { text: "Privacy Policy", url: "P" },
    { text: "." },
  ]);
  assert.deepEqual(termsRuns("Read the Terms of Use. Our Privacy Policy explains how we use your data.", urls), [
    { text: "Read the " },
    { text: "Terms of Use", url: "T" },
    { text: ". Our " },
    { text: "Privacy Policy", url: "P" },
    { text: " explains how we use your data." },
  ]);
  assert.deepEqual(termsRuns("I’m 18 or over and I accept the Terms of Use.", urls), [
    { text: "I’m 18 or over and I accept the " },
    { text: "Terms of Use", url: "T" },
    { text: "." },
  ]);
  assert.deepEqual(termsRuns("Termsheet and Privacy Policyholder", urls), [{ text: "Termsheet and Privacy Policyholder" }]);
  assert.deepEqual(termsRuns("Nothing to link.", urls), [{ text: "Nothing to link." }]);
});

test("the company particulars are AS-D1's, word for word", () => {
  assert.deepEqual(COMPANY, {
    name: "Resbite Ltd",
    number: "12450334",
    office: "86-90 Paul Street, London EC2A 4NE, United Kingdom",
  });
  assert.deepEqual(LEGAL_COPY.companyLines, [
    "Resbite is provided by Resbite Ltd, a private limited company registered in England and Wales.",
    "Company number: 12450334",
    "Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom",
  ]);
  assert.equal(PRIVACY_ADDRESS, "privacy@resbite.com");
  assert.equal(LEGAL_COPY.requestData, "Request a copy of my data");
  assert.equal(LEGAL_COPY.opensEmail("a@x.example"), "Opens an email to a@x.example");
});

const mobile = fileURLToPath(new URL("../../", import.meta.url));
const source = (path: string) => readFileSync(join(mobile, path), "utf8");

test("the two link overrides are read with dot notation, the one form inlined when the bundle is built", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(join(mobile, "app"));
  walk(join(mobile, "src"));
  let readers = 0;
  // releaseChecks.ts reads a plain env object handed to it by the build-time check, never the bundle's process.env.
  for (const f of files.filter((file) => !file.endsWith("releaseChecks.ts")))
    for (const line of readFileSync(f, "utf8").split("\n"))
      for (const name of ["EXPO_PUBLIC_TERMS_URL", "EXPO_PUBLIC_PRIVACY_URL"])
        if (line.includes(name) && !/^\s*(\*|\/\/|\/\*)/.test(line)) {
          readers++;
          assert.match(line, new RegExp(`process\\.env\\.${name}\\b`), `${relative(mobile, f)}: ${line.trim()}`);
        }
  assert.ok(readers >= 2);
});

test(".env.example documents both overrides, unset", () => {
  const env = source(".env.example");
  assert.match(env, /^# EXPO_PUBLIC_TERMS_URL=$/m);
  assert.match(env, /^# EXPO_PUBLIC_PRIVACY_URL=$/m);
});

test("the tick line splits with termsRuns and opens links through openExternal", () => {
  const tick = source("src/design/TickRow.tsx");
  assert.ok(tick.includes("termsRuns("));
  assert.equal(tick.includes("Linking.openURL"), false);
});
