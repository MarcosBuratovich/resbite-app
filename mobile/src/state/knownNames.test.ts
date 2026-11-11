import test from "node:test";
import assert from "node:assert/strict";
import { forgetNames, knownName, rememberName } from "./knownNames";

test("a name read on one screen is known on the next, for the same account only", () => {
  rememberName("pedro", "ana", "Ana Host");
  assert.equal(knownName("pedro", "ana"), "Ana Host");
  assert.equal(knownName("someone-else", "ana"), null, "another account knows nothing");
  assert.equal(knownName("pedro", "leo"), null);
  assert.equal(knownName(undefined, "ana"), null);
  assert.equal(knownName("pedro", undefined), null);
});

test("a newer name replaces the old; a missing or blank one changes nothing", () => {
  rememberName("pedro", "sol", "Sol Vega");
  rememberName("pedro", "sol", "Sol V");
  assert.equal(knownName("pedro", "sol"), "Sol V");
  rememberName("pedro", "sol", null);
  rememberName("pedro", "sol", "   ");
  rememberName("pedro", "sol", undefined);
  assert.equal(knownName("pedro", "sol"), "Sol V");
  rememberName("pedro", "marta", "  Marta M  ");
  assert.equal(knownName("pedro", "marta"), "Marta M");
});

test("the event page remembers the organizer's name it read, and bring mode looks there before reading it again (C23)", async () => {
  const { readFileSync } = await import("node:fs");
  const event = readFileSync(new URL("./useEvent.ts", import.meta.url), "utf8");
  assert.match(event, /rememberName\(userId, next\.plan\.owner_id, next\.organizer\)/);
  const screen = readFileSync(new URL("../../app/invitations.tsx", import.meta.url), "utf8");
  assert.match(screen, /knownName\(userId, found\.owner_id\)/);
  assert.match(screen, /account\.displayName/);
});

test("signing out or deleting the account forgets the names it read, and only its own (C25)", () => {
  rememberName("leaving", "ana", "Ana Host");
  rememberName("leaving", "sol", "Sol Vega");
  rememberName("staying", "ana", "Ana H");
  forgetNames("leaving");
  assert.equal(knownName("leaving", "ana"), null);
  assert.equal(knownName("leaving", "sol"), null);
  assert.equal(knownName("staying", "ana"), "Ana H", "another account's names stay");
  // An account whose id begins like another's is a different account.
  rememberName("leaving-2", "leo", "Leo Paz");
  forgetNames("leaving");
  assert.equal(knownName("leaving-2", "leo"), "Leo Paz");
  forgetNames("");
  assert.equal(knownName("staying", "ana"), "Ana H", "a blank scope forgets nothing");
});

test("the app's session lifecycle forgets the names on sign-out and deletion (C25)", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("./AppState.tsx", import.meta.url), "utf8");
  assert.match(app, /clearKnownNames: forgetNames/);
});
