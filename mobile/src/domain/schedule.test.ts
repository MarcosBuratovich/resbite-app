import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  joinLocal,
  localDay,
  quickDays,
  quickTimes,
  splitLocal,
  spokenDateTime,
} from "./schedule.ts";

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
