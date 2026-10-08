import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  defaultStart,
  joinLocal,
  localDay,
  pickedValue,
  pickerSeed,
  quickDays,
  quickTimes,
  splitLocal,
  spokenDateTime,
  zoneLabel,
} from "./schedule.ts";
import { localDateTime } from "./plans.ts";

// Day boundaries are the device's: every test pins a zone (Node applies TZ changes at runtime).
function inZone<T>(zone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
const tiles = (now: Date) => quickDays(now).map((d) => [d.key, d.day, d.text]);

test("the weekend tile is the next Saturday that is neither today nor tomorrow, or Sunday when tomorrow is Saturday", () =>
  inZone("Europe/London", () => {
    assert.deepEqual(tiles(new Date("2026-10-07T12:00:00+01:00")), [
      ["today", "2026-10-07", "Today"],
      ["tomorrow", "2026-10-08", "Tomorrow"],
      ["weekend", "2026-10-10", "Sat 10"],
    ]);
    assert.deepEqual(tiles(new Date("2026-10-08T12:00:00+01:00"))[2], ["weekend", "2026-10-10", "Sat 10"]);
    assert.deepEqual(tiles(new Date("2026-10-09T12:00:00+01:00"))[2], ["weekend", "2026-10-11", "Sun 11"]);
    assert.deepEqual(tiles(new Date("2026-10-10T12:00:00+01:00"))[2], ["weekend", "2026-10-17", "Sat 17"]);
    assert.deepEqual(tiles(new Date("2026-10-11T12:00:00+01:00"))[2], ["weekend", "2026-10-17", "Sat 17"]);
    assert.equal(quickDays(new Date("2026-10-09T12:00:00+01:00"))[1].label, "Tomorrow, Saturday 10 October");
  }));

test("days are calendar days in the device's zone, across midnight and clock changes", () => {
  inZone("Europe/London", () => {
    // 23:30 on Saturday 27 March 2027. The clocks go forward that night, so "now + 24 h" would be Monday.
    const night = new Date("2027-03-27T23:30:00Z");
    assert.deepEqual(tiles(night), [
      ["today", "2027-03-27", "Today"],
      ["tomorrow", "2027-03-28", "Tomorrow"],
      ["weekend", "2027-04-03", "Sat 3"],
    ]);
    assert.equal(localDay(addDays(night, 1)), "2027-03-28");
    // One minute after midnight it is the next day.
    assert.equal(quickDays(new Date("2027-03-28T00:01:00Z"))[0].day, "2027-03-28");
    // 23:30 on Saturday 24 October 2026. The clocks go back that night.
    assert.equal(quickDays(new Date("2026-10-24T22:30:00Z"))[1].day, "2026-10-25");
  });
  inZone("America/Los_Angeles", () => {
    // 05:30 UTC on Saturday is still Friday evening in Los Angeles.
    assert.deepEqual(tiles(new Date("2026-10-10T05:30:00Z")), [
      ["today", "2026-10-09", "Today"],
      ["tomorrow", "2026-10-10", "Tomorrow"],
      ["weekend", "2026-10-11", "Sun 11"],
    ]);
  });
});

test("time chips at or before now are disabled, exactly as validatePlan refuses them", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-09T10:30:00+01:00");
    assert.deepEqual(
      quickTimes("2026-10-09", now).map((t) => [t.time, t.disabled]),
      [
        ["09:00", true],
        ["10:00", true],
        ["13:00", false],
        ["18:00", false],
      ],
    );
    assert.ok(quickTimes("2026-10-10", now).every((t) => !t.disabled));
    assert.ok(quickTimes(null, now).every((t) => t.disabled), "No day chosen yet");
    assert.equal(quickTimes("2026-10-09", new Date("2026-10-09T13:00:00+01:00"))[2].disabled, true);
    assert.ok(quickTimes("2026-10-09", new Date("2026-10-09T23:59:00+01:00")).every((t) => t.disabled));
    assert.equal(quickTimes("2026-10-10", now)[1].label, "Saturday 10 October at 10:00");
  }));

test("values keep the editor's local YYYY-MM-DD HH:mm format", () =>
  inZone("Europe/London", () => {
    assert.deepEqual(splitLocal("2026-10-10 18:00"), { day: "2026-10-10", time: "18:00" });
    assert.deepEqual(splitLocal(""), { day: null, time: null });
    assert.deepEqual(splitLocal("2099-02-30 12:00"), { day: null, time: null });
    assert.equal(joinLocal("2026-10-10", "09:00"), "2026-10-10 09:00");
    assert.equal(
      spokenDateTime(new Date(2099, 2, 1, 15, 0), new Date("2026-10-07T12:00:00Z")),
      "Sunday 1 March 2099 at 15:00",
    );
  }));

test("a new resbite starts tomorrow at 10:00, a calendar day ahead in the device's zone", () =>
  inZone("Europe/London", () => {
    // Not "now + 24 hours" at the current minute (iPhone check: "Tomorrow" with a 22:56 chip).
    assert.equal(defaultStart(new Date("2026-10-07T22:56:00+01:00")), "2026-10-08 10:00");
    assert.equal(defaultStart(new Date("2026-10-07T00:01:00+01:00")), "2026-10-08 10:00");
    // 23:30 the night the clocks go forward: now + 24 h would be Monday.
    assert.equal(defaultStart(new Date("2027-03-27T23:30:00Z")), "2027-03-28 10:00");
    // It is one of the quick chips on the Tomorrow tile, so both read as selected.
    const now = new Date("2026-10-07T22:56:00+01:00");
    const { day, time } = splitLocal(defaultStart(now));
    assert.equal(day, quickDays(now)[1].day);
    assert.ok(quickTimes(day, now).some((t) => t.time === time && !t.disabled));
  }));

test("the native picker opens on the chosen day, else on the current value, else tomorrow at 10:00", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-07T22:56:00+01:00");
    const seed = (value: string, day: string | null) => localDateTime(pickerSeed(value, day, now));
    // Do this again: the start is empty and a day tile is chosen, so "⋯" opens on that day.
    assert.equal(seed("", "2026-10-10"), "2026-10-10 10:00");
    // A chosen day keeps its chosen time.
    assert.equal(seed("2026-10-10 18:00", "2026-10-10"), "2026-10-10 18:00");
    assert.equal(seed("2099-02-30 12:00", "2026-10-10"), "2026-10-10 10:00");
    // No chosen day: the current value, then tomorrow at 10:00 (never the current minute).
    assert.equal(seed("2026-10-12 13:00", null), "2026-10-12 13:00");
    assert.equal(seed("", null), "2026-10-08 10:00");
    assert.equal(seed("2099-02-30 12:00", null), "2026-10-08 10:00");
  }));

test("a picked time never changes the chosen day, and a picked date keeps the chosen time", () =>
  inZone("Europe/London", () => {
    const seed = new Date(2026, 9, 10, 10, 0);
    assert.equal(pickedValue("time", new Date(2026, 9, 10, 18, 30), seed), "2026-10-10 18:30");
    // Even if a picker hands back the time on another day, the chosen day stays.
    assert.equal(pickedValue("time", new Date(2026, 9, 8, 18, 30), seed), "2026-10-10 18:30");
    assert.equal(pickedValue("date", new Date(2026, 9, 14, 10, 0), seed), "2026-10-14 10:00");
    // A date picked with another time of day keeps the chosen time.
    assert.equal(pickedValue("date", new Date(2026, 9, 14, 22, 56), seed), "2026-10-14 10:00");
    assert.equal(pickedValue("date", new Date(2026, 9, 14, 7, 5), new Date(2026, 9, 10, 18, 0)), "2026-10-14 18:00");
  }));

test("the zone line names the zone's city, with spaces for underscores", () => {
  assert.equal(zoneLabel("America/Argentina/Buenos_Aires"), "Buenos Aires time");
  assert.equal(zoneLabel("Europe/London"), "London time");
  assert.equal(zoneLabel("America/Port_of_Spain"), "Port of Spain time");
  assert.equal(zoneLabel("UTC"), "UTC time");
  assert.equal(zoneLabel(""), "Local time");
});
