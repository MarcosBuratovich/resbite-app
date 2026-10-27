import test from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_OPEN_FAILED, reminderChip } from "./eventDevice.ts";

const chip = (permission: Parameters<typeof reminderChip>[0]["permission"], enabled = true, muted = false) =>
  reminderChip({ permission, allowed: permission === "granted" || permission === "provisional", enabled, muted });

test("the reminders chip is on only with permission, the switch on and the event not muted", () => {
  assert.deepEqual(chip("granted"), {
    on: true,
    text: "Reminders on",
    label: "Reminders on, 1 day and 1 hour before",
    hint: "Turns reminders off for this resbite",
    action: "mute",
  });
  assert.equal(chip("provisional").on, true);
  assert.deepEqual(
    [chip("granted", true, true), chip("undetermined"), chip("denied"), chip("unknown"), chip("ephemeral")].map((c) => [
      c.on,
      c.text,
      c.label,
      c.action,
    ]),
    [
      [false, "Reminders off", "Reminders off", "unmute"],
      [false, "Reminders off", "Reminders off", "ask"],
      [false, "Reminders off", "Reminders off", "settings"],
      [false, "Reminders off", "Reminders off", "settings"],
      [false, "Reminders off", "Reminders off", "settings"],
    ],
  );
});

test("switched off on Notifications, the chip reads Reminders off and opens Notifications, whatever the permission", () => {
  for (const permission of ["granted", "undetermined", "denied"] as const) {
    const off = chip(permission, false);
    assert.equal(off.on, false);
    assert.equal(off.text, "Reminders off");
    assert.equal(off.action, "notifications");
  }
});

test("the calendar failure keeps its wording", () => {
  assert.equal(CALENDAR_OPEN_FAILED, "We couldn’t open your calendar. Add to calendar needs iOS 17 or later.");
});
