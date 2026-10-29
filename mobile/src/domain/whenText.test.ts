import test from "node:test";
import assert from "node:assert/strict";
import { clockTime, repeatChoice, repeatLine, shortDate, whenLine } from "./whenText.ts";

const L = "Europe/London";

test("shortDate and clockTime read in the plan's zone", () => {
  assert.equal(shortDate("2026-10-24T18:00:00Z", L), "Sat 24 Oct");
  assert.equal(clockTime("2026-10-24T18:00:00Z", L), "19:00");
  assert.equal(clockTime("2026-10-24T18:00:00Z", "America/New_York"), "14:00");
});

test("whenLine has four shapes", () => {
  assert.equal(whenLine("2026-10-24T18:00:00Z", null, L), "Sat 24 Oct · 19:00");
  assert.equal(whenLine("2026-10-24T18:00:00Z", "2026-10-24T21:00:00Z", L), "Sat 24 Oct · 19:00 to 22:00");
  assert.equal(whenLine("2026-10-23T23:00:00Z", "2026-10-24T22:59:00Z", L), "Sat 24 Oct · All day");
  assert.equal(
    whenLine("2026-10-24T21:00:00Z", "2026-10-25T02:00:00Z", L),
    "Sat 24 Oct · 22:00 to Sun 25 Oct 02:00",
  );
});

test("repeatLine and repeatChoice", () => {
  assert.equal(repeatLine("2026-10-29T19:00:00Z", L, 2), "Every other Thursday");
  assert.equal(repeatLine("2026-10-29T19:00:00Z", L, 1), "Every Thursday");
  assert.equal(repeatLine("2026-10-29T19:00:00Z", L, null), null);
  assert.equal(repeatChoice(null), "Doesn’t repeat");
  assert.equal(repeatChoice(1), "Every week");
  assert.equal(repeatChoice(2), "Every 2 weeks");
});
