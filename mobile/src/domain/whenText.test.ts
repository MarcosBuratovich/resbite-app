import test from "node:test";
import assert from "node:assert/strict";
import { clockTime, localParts, repeatChoice, repeatLine, shortDate, whenLine } from "./whenText.ts";

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

// On the iPhone the app runs on Hermes, whose iOS Intl answers formatToParts with the whole string as one literal part,
// with no hour, minute, year, month or day parts: the When line read "Wed 25 Nov undefined:undefined to
// undefined:undefined" (12 Nov 2026, TestFlight). Every time and date must read right without those parts.
test("times and dates read right when formatToParts gives no parts (Hermes on iOS)", () => {
  const real = Intl.DateTimeFormat.prototype.formatToParts;
  Intl.DateTimeFormat.prototype.formatToParts = function (this: Intl.DateTimeFormat, date?: Date | number) {
    return [{ type: "literal", value: this.format(date) }] as Intl.DateTimeFormatPart[];
  };
  try {
    assert.equal(clockTime("2026-10-24T18:00:00Z", L), "19:00");
    assert.equal(clockTime("2026-10-24T18:00:00Z", "America/New_York"), "14:00");
    assert.equal(clockTime("2026-11-25T00:05:00Z", "UTC"), "00:05", "midnight reads 00, never 24");
    assert.deepEqual(localParts("2026-10-24T18:00:00Z", L), { date: "2026-10-24", time: "19:00" });
    assert.deepEqual(localParts("2026-10-24T23:30:00Z", "Asia/Tokyo"), { date: "2026-10-25", time: "08:30" });
    assert.equal(whenLine("2026-11-25T18:00:00Z", "2026-11-25T21:00:00Z", L), "Wed 25 Nov · 18:00 to 21:00");
    assert.equal(whenLine("2026-10-23T23:00:00Z", "2026-10-24T22:59:00Z", L), "Sat 24 Oct · All day");
    assert.equal(
      whenLine("2026-10-24T21:00:00Z", "2026-10-25T02:00:00Z", L),
      "Sat 24 Oct · 22:00 to Sun 25 Oct 02:00",
    );
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = real;
  }
});
