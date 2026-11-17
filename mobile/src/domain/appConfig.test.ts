import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) =>
  JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const appJson = read("../../app.json").expo;
const packageJson = read("../../package.json");

const CONTACTS_STRING =
  "Choose contacts to invite. Resbite checks only the numbers you pick to see who already uses it.";

test("the location and unused storage libraries are not dependencies (B8)", () => {
  assert.equal(packageJson.dependencies["expo-location"], undefined);
  assert.equal(
    packageJson.dependencies["@react-native-async-storage/async-storage"],
    undefined,
  );
});

test("app.json has no location plugin, and names no location anywhere (PERM-2)", () => {
  const names = appJson.plugins.map((p: string | [string]) =>
    Array.isArray(p) ? p[0] : p,
  );
  assert.ok(!names.includes("expo-location"));
  assert.doesNotMatch(JSON.stringify(appJson), /location/i);
});

test("the contacts permission string says what Resbite does with the numbers (PERM-1)", () => {
  const entry = appJson.plugins.find(
    (p: string | [string]) => Array.isArray(p) && p[0] === "expo-contacts",
  );
  assert.equal(entry[1].contactsPermission, CONTACTS_STRING);
});

test("Android asks only to read contacts (PERM-6)", () => {
  assert.deepEqual(appJson.android.permissions, [
    "android.permission.READ_CONTACTS",
  ]);
});

// ---- Version and privacy manifest (B13, CON-8, PRV-16) ----

import { readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

const manifests = appJson.ios.privacyManifests;

test("the version is 1.0.0 (CON-8)", () => {
  assert.equal(appJson.version, "1.0.0");
});

test("the app does not track, and names no tracking domain", () => {
  assert.equal(manifests.NSPrivacyTracking, false);
  assert.deepEqual(manifests.NSPrivacyTrackingDomains, []);
});

test("every collected type is linked, not tracking, and for App Functionality only", () => {
  const types = manifests.NSPrivacyCollectedDataTypes;
  assert.ok(types.length > 0);
  for (const t of types) {
    assert.equal(t.NSPrivacyCollectedDataTypeLinked, true, t.NSPrivacyCollectedDataType);
    assert.equal(t.NSPrivacyCollectedDataTypeTracking, false, t.NSPrivacyCollectedDataType);
    assert.deepEqual(t.NSPrivacyCollectedDataTypePurposes, [
      "NSPrivacyCollectedDataTypePurposeAppFunctionality",
    ]);
  }
});

const PACK_NAMES: Record<string, string> = {
  Name: "NSPrivacyCollectedDataTypeName",
  "Email Address": "NSPrivacyCollectedDataTypeEmailAddress",
  "Phone Number": "NSPrivacyCollectedDataTypePhoneNumber",
  Contacts: "NSPrivacyCollectedDataTypeContacts",
  "Emails or Text Messages": "NSPrivacyCollectedDataTypeEmailsOrTextMessages",
  "Photos or Videos": "NSPrivacyCollectedDataTypePhotosorVideos",
  "Customer Support": "NSPrivacyCollectedDataTypeCustomerSupport",
  "Other User Content": "NSPrivacyCollectedDataTypeOtherUserContent",
  "User ID": "NSPrivacyCollectedDataTypeUserID",
  "Device ID": "NSPrivacyCollectedDataTypeDeviceID",
  "Product Interaction": "NSPrivacyCollectedDataTypeProductInteraction",
  "Other Data Types": "NSPrivacyCollectedDataTypeOtherDataTypes",
};

test("the collected types are exactly the Yes rows of the App Privacy table (Review Focus 3)", () => {
  const pack = readFileSync(
    new URL("../../../qa/app-store-release/app-store-connect-pack.md", import.meta.url),
    "utf8",
  );
  const start = pack.indexOf("## 6. App Privacy answers");
  assert.ok(start >= 0, "section 6 not found");
  const rest = pack.slice(start + 5);
  const end = rest.indexOf("\n## ");
  const section = end >= 0 ? rest.slice(0, end) : rest;
  const expected: string[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // cells[0] is empty (before the first pipe): 1 category, 2 data type, 3 collected
    if (!cells[3] || !cells[3].includes("**Yes**")) continue;
    const name = cells[2];
    const constant = PACK_NAMES[name];
    assert.ok(constant, `add ${name} to the mapping and the manifest`);
    expected.push(constant);
  }
  const actual = manifests.NSPrivacyCollectedDataTypes.map(
    (t: { NSPrivacyCollectedDataType: string }) => t.NSPrivacyCollectedDataType,
  );
  assert.deepEqual([...actual].sort(), [...expected].sort());
  assert.equal(new Set(actual).size, actual.length, "no type is listed twice");
});

const SKIP = new Set(["android", ".bin", "__tests__", ".cache"]);

function findManifests(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findManifests(full, found);
    else if (entry.name === "PrivacyInfo.xcprivacy") found.push(full);
  }
  return found;
}

test("the manifest lists every required reason the installed SDKs declare, and none tracks (Review Focus 3)", () => {
  const root = realpathSync(new URL("../../node_modules", import.meta.url));
  const files = findManifests(root);
  assert.ok(files.length >= 8, `only ${files.length} SDK manifests found`);

  const declared = new Set<string>();
  for (const m of manifests.NSPrivacyAccessedAPITypes) {
    for (const r of m.NSPrivacyAccessedAPITypeReasons) {
      declared.add(`${m.NSPrivacyAccessedAPIType} ${r}`);
    }
  }
  const pair =
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  for (const file of files) {
    const xml = readFileSync(file, "utf8");
    assert.doesNotMatch(
      xml,
      /<key>NSPrivacyTracking<\/key>\s*<true\/>/,
      `${file} sets NSPrivacyTracking to true, and nothing plans an App Tracking Transparency prompt`,
    );
    for (const m of xml.matchAll(pair)) {
      for (const r of m[2].matchAll(/<string>([^<]+)<\/string>/g)) {
        assert.ok(
          declared.has(`${m[1]} ${r[1]}`),
          `${file} declares ${m[1]} ${r[1]}: add it to ios.privacyManifests`,
        );
      }
    }
  }
});
