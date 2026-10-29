import test from "node:test";
import assert from "node:assert/strict";
import {
  afterSaveNotice,
  createWrite,
  editChangesTimeOrPlace,
  editWrite,
  hasUnsavedChanges,
  modeFor,
  submitCheck,
} from "./planFormModel";
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

const NOW = Date.parse("2026-10-29T12:00:00.000Z");

test("submitCheck lists what is missing and which fields carry a video link", () => {
  const empty = { ...complete, date: null, start: null, end: null, place: "" };
  assert.deepEqual(submitCheck(empty, "UTC", NOW), { missing: ["when", "place"], videoFields: [], past: false });
  assert.deepEqual(submitCheck(complete, "UTC", NOW), { missing: [], videoFields: [], past: false });
  const zoom = { ...complete, meetingDetails: "https://zoom.us/j/123" };
  assert.deepEqual(submitCheck(zoom, "UTC", NOW), { missing: [], videoFields: ["meetingDetails"], past: false });
});

test("submitCheck counts a start that is not in the future as the when item", () => {
  const yesterday = { ...complete, date: "2026-10-28" };
  assert.deepEqual(submitCheck(yesterday, "UTC", NOW), { missing: ["when"], videoFields: [], past: true });
  // In screen order with the others.
  assert.deepEqual(submitCheck({ ...yesterday, title: "", place: "" }, "UTC", NOW).missing, ["name", "when", "place"]);
  // Exactly now is not in the future; a minute later is.
  const noon = { ...complete, date: "2026-10-29", start: "12:00", end: "13:00" };
  assert.equal(submitCheck(noon, "UTC", NOW).past, true);
  assert.equal(submitCheck({ ...noon, start: "12:01" }, "UTC", NOW).past, false);
  // All day today starts at 00:00, which has passed.
  const allDay = { ...complete, date: "2026-10-29", start: "00:00", end: "23:59" };
  assert.deepEqual(submitCheck(allDay, "UTC", NOW), { missing: ["when"], videoFields: [], past: true });
  // The device's zone decides the instant: 13:30 in Tokyo on the 29th was 04:30 UTC.
  assert.equal(submitCheck({ ...noon, start: "13:30", end: "14:00" }, "Asia/Tokyo", NOW).past, true);
  // An incomplete when is just missing.
  assert.equal(submitCheck({ ...yesterday, end: null }, "UTC", NOW).past, false);
});

test("submitCheck reads an edit's start in the plan's own zone while it is unchanged", () => {
  const soon: Plan = { ...original, starts_at: "2026-10-29T12:30:00+00:00", ends_at: "2026-10-29T13:30:00+00:00" };
  const form = { ...complete, date: "2026-10-29", start: "12:30", end: "13:30" };
  // From Tokyo the wall clock 12:30 would be 03:30 UTC (past); the plan's own zone keeps it at 12:30 UTC.
  assert.equal(submitCheck(form, "Asia/Tokyo", NOW, soon).past, false);
  assert.equal(submitCheck(form, "Asia/Tokyo", NOW).past, true);
});

test("createWrite uses the request id, and only an idea's create carries the idea", () => {
  const write = createWrite(complete, "UTC", "req-1", "idea", "coffee");
  assert.equal(write.id, "req-1");
  assert.equal(write.activityId, "coffee");
  assert.equal(write.version, undefined);
  assert.equal(write.details.title, "Coffee");
  assert.equal(write.details.starts_at, "2099-03-10T10:00:00.000Z");
  // Do this again never carries the original's idea, so a withdrawn idea cannot block the copy.
  assert.equal(createWrite(complete, "UTC", "req-2", "again", "coffee").activityId, null);
  assert.equal(createWrite(complete, "UTC", "req-3", "blank", "coffee").activityId, null);
  // An idea dropped after the server said it was withdrawn.
  assert.equal(createWrite(complete, "UTC", "req-4", "idea", null).activityId, null);
});

test("hasUnsavedChanges: a field, or before the resbite exists a chosen photo or a typed description", () => {
  const none = { uri: null, description: "" };
  assert.equal(hasUnsavedChanges("blank", complete, complete, none), false);
  assert.equal(hasUnsavedChanges("blank", { ...complete, title: "Tea" }, complete, none), true);
  for (const mode of ["blank", "idea", "again"] as const) {
    assert.equal(hasUnsavedChanges(mode, complete, complete, { uri: "data:image/jpeg;base64,AA", description: "" }), true, mode);
    assert.equal(hasUnsavedChanges(mode, complete, complete, { uri: null, description: "Two mugs" }), true, mode);
    assert.equal(hasUnsavedChanges(mode, complete, complete, { uri: null, description: "  " }), false, mode);
  }
  // An edit saves its photo at once: only the fields count.
  assert.equal(hasUnsavedChanges("edit", complete, complete, { uri: "https://signed/cover.jpg", description: "Two mugs" }), false);
  assert.equal(hasUnsavedChanges("edit", { ...complete, place: "Park" }, complete, none), true);
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

test("editChangesTimeOrPlace reads the server's +00:00 times as the same instants as the form's", () => {
  // As the server sends a plan: +00:00, not the app's .000Z.
  const fromServer: Plan = { ...original, starts_at: "2099-03-10T10:00:00+00:00", ends_at: "2099-03-10T11:00:00+00:00" };
  assert.equal(editChangesTimeOrPlace({ ...complete, title: "Tea" }, "UTC", fromServer), false);
  assert.equal(editChangesTimeOrPlace(complete, "Asia/Tokyo", fromServer), false);
  assert.equal(editChangesTimeOrPlace({ ...complete, end: "12:00" }, "UTC", fromServer), true);
  assert.equal(editChangesTimeOrPlace({ ...complete, start: "09:00" }, "UTC", fromServer), true);
});

test("editChangesTimeOrPlace is true for a moved start or place, false for other edits and incomplete forms", () => {
  assert.equal(editChangesTimeOrPlace(complete, "UTC", original), false);
  assert.equal(editChangesTimeOrPlace({ ...complete, title: "Tea" }, "UTC", original), false);
  assert.equal(editChangesTimeOrPlace({ ...complete, start: "12:00", end: "13:00" }, "UTC", original), true);
  assert.equal(editChangesTimeOrPlace({ ...complete, place: "Park" }, "UTC", original), true);
  assert.equal(editChangesTimeOrPlace({ ...complete, placeTbd: true }, "UTC", original), true);
  assert.equal(editChangesTimeOrPlace({ ...complete, date: null }, "UTC", original), false);
});
