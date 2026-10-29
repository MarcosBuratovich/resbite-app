import test from "node:test";
import assert from "node:assert/strict";
import { afterSaveNotice, createWrite, editChangesTimeOrPlace, editWrite, modeFor, submitCheck } from "./planFormModel";
import { EMPTY_FORM, type PlanForm } from "../domain/planForm";
import type { Plan } from "../domain/plans";

const complete: PlanForm = {
  ...EMPTY_FORM,
  title: " Coffee ",
  categories: ["community"],
  date: "2099-03-10",
  start: "10:00",
  end: "11:00",
  place: "Café",
};

const original: Plan = {
  id: "plan-1",
  activity_id: "coffee",
  title: "Coffee",
  description: "",
  categories: ["community"],
  starts_at: "2099-03-10T10:00:00.000Z",
  ends_at: "2099-03-10T11:00:00.000Z",
  place_label: "Café",
  note: "",
  status: "active",
  version: 3,
  time_zone: "UTC",
  area: "",
  place_tbd: false,
  repeat_weeks: null,
  series_id: "s",
  repeats_from: null,
};

test("modeFor reads the params in order: plan, again, activity, else blank", () => {
  assert.equal(modeFor({ plan: "p" }), "edit");
  assert.equal(modeFor({ again: "p" }), "again");
  assert.equal(modeFor({ activity: "a" }), "idea");
  assert.equal(modeFor({}), "blank");
  assert.equal(modeFor({ plan: "p", activity: "a" }), "edit");
  assert.equal(modeFor({ again: "p", activity: "a" }), "again");
});

test("submitCheck lists what is missing and which fields carry a video link", () => {
  const empty = { ...complete, date: null, start: null, end: null, place: "" };
  assert.deepEqual(submitCheck(empty), { missing: ["when", "place"], videoFields: [] });
  assert.deepEqual(submitCheck(complete), { missing: [], videoFields: [] });
  const zoom = { ...complete, meetingDetails: "https://zoom.us/j/123" };
  assert.deepEqual(submitCheck(zoom), { missing: [], videoFields: ["meetingDetails"] });
});

test("createWrite uses the request id and the idea", () => {
  const write = createWrite(complete, "UTC", "req-1", "coffee");
  assert.equal(write.id, "req-1");
  assert.equal(write.activityId, "coffee");
  assert.equal(write.version, undefined);
  assert.equal(write.details.title, "Coffee");
  assert.equal(write.details.starts_at, "2099-03-10T10:00:00.000Z");
  assert.equal(createWrite(complete, "UTC", "req-2", null).activityId, null);
});

test("editWrite keeps the plan's zone while the start is unchanged", () => {
  const write = editWrite(complete, "America/New_York", original);
  assert.equal(write.id, "plan-1");
  assert.equal(write.version, 3);
  assert.equal(write.activityId, "coffee");
  // 10:00 in the plan's own zone (UTC) is the plan's start, so the zone stays UTC.
  assert.equal(write.details.time_zone, "UTC");
  assert.equal(write.details.starts_at, original.starts_at);
});

test("editWrite uses the device zone once the start changed", () => {
  const moved = { ...complete, start: "12:00", end: "13:00" };
  const write = editWrite(moved, "America/New_York", original);
  assert.equal(write.details.time_zone, "America/New_York");
  assert.equal(write.details.starts_at, "2099-03-10T16:00:00.000Z");
});

test("afterSaveNotice", () => {
  assert.equal(afterSaveNotice("edit"), "Changes saved");
  assert.equal(afterSaveNotice("blank"), "Resbite created");
  assert.equal(afterSaveNotice("again"), "Resbite created");
  assert.equal(afterSaveNotice("idea"), "Resbite created");
});

test("editChangesTimeOrPlace is true for a moved start or place, false for other edits and incomplete forms", () => {
  assert.equal(editChangesTimeOrPlace(complete, "UTC", original), false);
  assert.equal(editChangesTimeOrPlace({ ...complete, title: "Tea" }, "UTC", original), false);
  assert.equal(editChangesTimeOrPlace({ ...complete, start: "12:00", end: "13:00" }, "UTC", original), true);
  assert.equal(editChangesTimeOrPlace({ ...complete, place: "Park" }, "UTC", original), true);
  assert.equal(editChangesTimeOrPlace({ ...complete, placeTbd: true }, "UTC", original), true);
  assert.equal(editChangesTimeOrPlace({ ...complete, date: null }, "UTC", original), false);
});
