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
