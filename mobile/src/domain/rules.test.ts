import test from "node:test";
import assert from "node:assert/strict";
import {
  filterActivities,
  validateRegistration,
  validatePlan,
  safeAuthCode,
  motionPolicy,
} from "./rules.ts";
const entries = [
  {
    id: "paint",
    title: "Painting together",
    category: "Creative",
    description: "",
    tips: [],
    durationMinutes: null,
    artwork: "",
    sourceIds: [],
  },
  {
    id: "cycle",
    title: "Cycling together",
    category: "Physical",
    description: "",
    tips: [],
    durationMinutes: null,
    artwork: "",
    sourceIds: [],
  },
];
test("search is case-insensitive and intersects category", () => {
  assert.deepEqual(
    filterActivities(entries, " PAINT ", "All").map((x) => x.id),
    ["paint"],
  );
  assert.equal(filterActivities(entries, "paint", "Physical").length, 0);
  assert.equal(filterActivities(entries, "", "All").length, 2);
});
test("registration rejects invalid email and short password without changing valid input", () => {
  assert.ok(validateRegistration("bad", "longpassword"));
  assert.ok(validateRegistration("a@example.com", "123"));
  assert.equal(validateRegistration("a@example.com", "longpassword"), null);
});
test("planning rejects invalid or past date and empty place", () => {
  assert.ok(validatePlan("no date", "Park", 0));
  assert.ok(
    validatePlan("2026-01-01T12:00:00Z", "Park", Date.parse("2026-01-02")),
  );
  assert.ok(validatePlan("2027-01-01T12:00:00Z", " ", 0));
  assert.equal(validatePlan("2027-01-01T12:00:00Z", "Park", 0), null);
});
test("auth router accepts only the app auth callback, never foreign or invitation codes", () => {
  assert.equal(safeAuthCode("resbite://auth/callback?code=abc"), "abc");
  assert.equal(
    safeAuthCode("https://evil.example/auth/callback?code=abc"),
    null,
  );
  assert.equal(safeAuthCode("resbite://invite?code=abc"), null);
});
test("reduce motion removes displacement and scaling but retains feedback", () => {
  assert.equal(motionPolicy(true).enterOffset, 0);
  assert.equal(motionPolicy(true).pressScale, 1);
  assert.ok(motionPolicy(true).duration <= 150);
});
