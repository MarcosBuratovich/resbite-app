import test from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_ADDED_NOTE,
  CALENDAR_UPDATED_NOTE,
  calendarEventDetails,
  calendarRecordOf,
  canAddToCalendar,
  needsCalendarUpdate,
} from "./calendarEvent.ts";

const plan = {
  title: " Picnic in the park ",
  starts_at: "2099-10-16T09:00:00.000Z",
  ends_at: null as string | null,
  place_label: " Riverside park ",
};

test("the calendar form gets the name, times and place, an hour without an end, no alert and no private text", () => {
  const details = calendarEventDetails(plan);
  assert.deepEqual(details, {
    title: "Picnic in the park",
    startDate: new Date("2099-10-16T09:00:00.000Z"),
    endDate: new Date("2099-10-16T10:00:00.000Z"),
    location: "Riverside park",
    notes: CALENDAR_ADDED_NOTE,
    alarms: [],
  });
  assert.deepEqual(calendarEventDetails({ ...plan, ends_at: "2099-10-16T11:30:00.000Z" }).endDate, new Date("2099-10-16T11:30:00.000Z"));
  assert.equal(calendarEventDetails(plan, true).notes, CALENDAR_UPDATED_NOTE);
  // Even if a plan object carried Meeting details or a link, they never reach the form.
  const leaky = { ...plan, note: "Gate 4512", url: "https://link.resbite.com/invite#token=x" } as typeof plan;
  assert.ok(!JSON.stringify(calendarEventDetails(leaky)).includes("4512"));
  assert.ok(!JSON.stringify(calendarEventDetails(leaky)).includes("token"));
});

test("Update calendar shows only after a new start, end or place on an event added here", () => {
  const record = calendarRecordOf(plan);
  assert.equal(needsCalendarUpdate(undefined, plan), false);
  assert.equal(needsCalendarUpdate(record, plan), false);
  assert.equal(needsCalendarUpdate(record, { ...plan, starts_at: "2099-10-16T09:00:00Z" }), false);
  assert.equal(needsCalendarUpdate(record, { ...plan, title: "Renamed" }), false);
  assert.equal(needsCalendarUpdate(record, { ...plan, starts_at: "2099-10-16T10:00:00.000Z" }), true);
  assert.equal(needsCalendarUpdate(record, { ...plan, ends_at: "2099-10-16T11:00:00.000Z" }), true);
  assert.equal(needsCalendarUpdate(record, { ...plan, place_label: "Old mill" }), true);
});

test("who sees Add to calendar", () => {
  const active = { status: "active", starts_at: "2099-10-16T09:00:00Z" };
  const now = Date.parse("2099-10-01T00:00:00Z");
  assert.equal(canAddToCalendar(active, { owner: true, response: null }, now), true);
  assert.equal(canAddToCalendar(active, { owner: false, response: "accepted" }, now), true);
  assert.equal(canAddToCalendar(active, { owner: false, response: "maybe" }, now), true);
  for (const response of [null, "pending", "declined", "withdrawn"])
    assert.equal(canAddToCalendar(active, { owner: false, response }, now), false, String(response));
  assert.equal(canAddToCalendar({ ...active, status: "cancelled" }, { owner: true, response: null }, now), false);
  assert.equal(canAddToCalendar(active, { owner: true, response: null }, Date.parse("2099-10-16T09:00:00Z")), false);
});
