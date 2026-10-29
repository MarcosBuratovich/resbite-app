import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FORM, applyDuration, detailsFromForm, formForAgain, formFromIdea, formFromPlan, formInstants,
  missingItems, missingLine, moveStart, notifyBanner, notifyCount, rowMessage, saveLabel,
  timeOrPlaceChanged, whenRowText, type PlanForm,
} from "./planForm.ts";
import type { Plan } from "./plans.ts";

const L = "Europe/London";
const full: PlanForm = {
  ...EMPTY_FORM, title: "Walk", categories: ["natural"], date: "2026-10-24", start: "19:00", end: "22:00", place: "Park",
};
const plan: Plan = {
  id: "p", activity_id: null, title: "Walk", description: "d", categories: ["natural"],
  starts_at: "2026-10-24T18:00:00.000Z", ends_at: "2026-10-24T21:00:00.000Z", place_label: "Park", note: "gate",
  status: "active", version: 1, time_zone: L, area: "Hyde", guest_note: "hi", repeat_weeks: 2,
  place_tbd: false, series_id: "s", repeats_from: null, admins: [],
};

test("the empty form pre-fills nothing", () => {
  assert.deepEqual([EMPTY_FORM.date, EMPTY_FORM.start, EMPTY_FORM.end, EMPTY_FORM.place], [null, null, null, ""]);
  assert.deepEqual(missingItems(EMPTY_FORM), ["name", "when", "place", "categories"]);
});

test("missingItems", () => {
  assert.deepEqual(missingItems(full), []);
  assert.deepEqual(missingItems({ ...full, end: null }), ["when"]);
  assert.deepEqual(missingItems({ ...full, place: "  ", placeTbd: true }), []);
  assert.deepEqual(missingItems({ ...full, place: "  ", title: " " }), ["name", "place"]);
  assert.deepEqual(missingItems({ ...full, categories: ["natural", "mindful", "creative"] }), ["categories"]);
});

test("missingLine for every count", () => {
  assert.equal(missingLine([]), null);
  assert.equal(missingLine(["place"]), "One thing is missing: a place.");
  assert.equal(missingLine(["when", "place"]), "Two things are missing: a date and time, and a place.");
  assert.equal(missingLine(["name", "when", "place"]), "Three things are missing: a name, a date and time, and a place.");
  assert.equal(
    missingLine(["name", "when", "place", "categories"]),
    "Four things are missing: a name, a date and time, a place, and one or two categories.",
  );
});

test("rowMessage", () => {
  assert.equal(rowMessage("name"), "Add a name");
  assert.equal(rowMessage("when"), "Add a date and time");
  assert.equal(rowMessage("place"), "Add a place or choose “To be decided”");
  assert.equal(rowMessage("categories"), "Choose one or two categories");
});

test("formInstants", () => {
  assert.equal(formInstants(EMPTY_FORM, L), null);
  assert.deepEqual(formInstants(full, L), { starts_at: "2026-10-24T18:00:00.000Z", ends_at: "2026-10-24T21:00:00.000Z" });
  // The clocks go back at 02:00 on 25 Oct 2026, so 02:00 that morning is already GMT.
  const night = formInstants({ ...full, start: "22:00", end: "02:00" }, L);
  assert.equal(night?.starts_at, "2026-10-24T21:00:00.000Z");
  assert.equal(night?.ends_at, "2026-10-25T02:00:00.000Z");
  // An end equal to the start is the next day.
  assert.equal(formInstants({ ...full, end: "19:00" }, L)?.ends_at, "2026-10-25T19:00:00.000Z");
  assert.equal(formInstants({ ...full, start: "10:00", end: "11:00" }, "America/New_York")?.starts_at, "2026-10-24T14:00:00.000Z");
});

test("whenRowText", () => {
  assert.equal(whenRowText(EMPTY_FORM, L), null);
  assert.deepEqual(whenRowText(full, L), { line: "Sat 24 Oct · 19:00 to 22:00", repeat: null });
  assert.deepEqual(whenRowText({ ...full, repeatWeeks: 2 }, L), { line: "Sat 24 Oct · 19:00 to 22:00", repeat: "Every 2 weeks" });
  assert.equal(whenRowText({ ...full, repeatWeeks: 1 }, L)?.repeat, "Every week");
  // Made before ends existed: the start only, and `when` stays missing until an end is chosen.
  assert.deepEqual(whenRowText({ ...full, end: null }, L), { line: "Sat 24 Oct · 19:00", repeat: null });
  assert.equal(whenRowText({ ...full, start: null }, L), null);
});

test("applyDuration", () => {
  assert.equal(applyDuration({ ...full, start: "23:00" }, 180).end, "02:00");
  assert.equal(applyDuration({ ...full, start: "10:00" }, 30).end, "10:30");
  assert.equal(applyDuration({ ...full, start: "10:00" }, 60).end, "11:00");
  assert.equal(applyDuration({ ...full, start: "10:00" }, 120).end, "12:00");
  const all = applyDuration(EMPTY_FORM, "allDay");
  assert.deepEqual([all.start, all.end], ["00:00", "23:59"]);
  assert.equal(applyDuration(EMPTY_FORM, 60).end, null);
});

test("moveStart", () => {
  assert.equal(moveStart(full, "23:00").end, "02:00");
  assert.equal(moveStart(full, "20:00").end, "22:00");
  assert.equal(moveStart(full, "23:00").start, "23:00");
  assert.equal(moveStart({ ...EMPTY_FORM, date: "2026-10-24" }, "09:00").end, null);
});

test("forms from an idea, a plan and a plan again", () => {
  const idea = formFromIdea({ title: "T", description: "D", categories: ["creative"] });
  assert.deepEqual(idea, { ...EMPTY_FORM, title: "T", description: "D", categories: ["creative"] });
  const edit = formFromPlan(plan);
  assert.deepEqual([edit.date, edit.start, edit.end, edit.repeatWeeks], ["2026-10-24", "19:00", "22:00", 2]);
  assert.deepEqual([edit.place, edit.placeTbd, edit.area, edit.meetingDetails, edit.guestNote], ["Park", false, "Hyde", "gate", "hi"]);
  assert.equal(formFromPlan({ ...plan, ends_at: null }).end, null);
  assert.equal(formFromPlan({ ...plan, ends_at: undefined }).end, null);
  const tbd = formFromPlan({ ...plan, place_label: "To be decided", place_tbd: true });
  assert.deepEqual([tbd.place, tbd.placeTbd], ["", true]);
  const again = formForAgain({ ...plan, repeat_weeks: 1 });
  assert.deepEqual([again.date, again.start, again.end, again.repeatWeeks], [null, null, null, null]);
  // The note to guests belongs to the original occurrence; the copy starts without one.
  assert.deepEqual([again.title, again.place, again.area, again.meetingDetails, again.guestNote], ["Walk", "Park", "Hyde", "gate", ""]);
});

test("detailsFromForm and timeOrPlaceChanged", () => {
  const d = detailsFromForm({ ...full, title: " Walk ", place: " Park ", meetingDetails: "gate", area: "Hyde", repeatWeeks: 1 }, L);
  assert.deepEqual(d, {
    title: "Walk", description: "", categories: ["natural"], starts_at: "2026-10-24T18:00:00.000Z",
    ends_at: "2026-10-24T21:00:00.000Z", place_label: "Park", place_tbd: false, repeat_weeks: 1,
    note: "gate", area: "Hyde", time_zone: L,
  });
  const spaced = detailsFromForm({ ...full, meetingDetails: "  \nGate 9 \n\n", area: "  Near Old Street " }, L);
  assert.deepEqual([spaced.note, spaced.area], ["Gate 9", "Near Old Street"]);
  const tbd = detailsFromForm({ ...full, place: "x", placeTbd: true }, L);
  assert.deepEqual([tbd.place_label, tbd.place_tbd], ["To be decided", true]);
  assert.equal(timeOrPlaceChanged(d, { ...d, title: "Other", note: "z", area: "q" }), false);
  assert.equal(timeOrPlaceChanged(d, { ...d, starts_at: "2026-10-24T19:00:00.000Z" }), true);
  assert.equal(timeOrPlaceChanged(d, { ...d, ends_at: "2026-10-24T22:00:00.000Z" }), true);
  assert.equal(timeOrPlaceChanged(d, { ...d, time_zone: "UTC" }), true);
  assert.equal(timeOrPlaceChanged(d, { ...d, place_label: "Pub" }), true);
  assert.equal(timeOrPlaceChanged(d, { ...d, place_tbd: true }), true);
});

test("timeOrPlaceChanged compares instants, not the way they are written", () => {
  const form = detailsFromForm(full, L);
  // As the server sends them back: the same instants written with +00:00.
  const saved = { ...form, starts_at: "2026-10-24T18:00:00+00:00", ends_at: "2026-10-24T21:00:00+00:00" };
  assert.equal(form.starts_at, "2026-10-24T18:00:00.000Z");
  assert.equal(timeOrPlaceChanged(saved, form), false);
  assert.equal(timeOrPlaceChanged(saved, { ...form, title: "Night walk" }), false);
  assert.equal(timeOrPlaceChanged(saved, { ...form, ends_at: "2026-10-24T22:00:00.000Z" }), true);
  assert.equal(timeOrPlaceChanged(saved, { ...form, starts_at: "2026-10-24T18:30:00.000Z" }), true);
  // A resbite saved before ends existed: adding an end is a change; none on either side is not.
  assert.equal(timeOrPlaceChanged({ ...saved, ends_at: "" }, form), true);
  assert.equal(timeOrPlaceChanged({ ...saved, ends_at: "" }, { ...form, ends_at: "" }), false);
});

test("detailsFromForm refuses an incomplete form", () => {
  assert.throws(() => detailsFromForm(EMPTY_FORM, L), /missingItems/);
  assert.throws(() => detailsFromForm({ ...full, end: null }, L), /missingItems/);
});

test("formInstants on the London clock-change nights", () => {
  const spring = formInstants({ ...full, date: "2026-03-29", start: "01:30", end: "03:00" }, L);
  assert.equal(Date.parse(spring!.starts_at), Date.parse("2026-03-29T01:30:00.000Z"));
  const autumn = formInstants({ ...full, date: "2026-10-25", start: "01:30", end: "03:00" }, L);
  assert.equal(Date.parse(autumn!.starts_at), Date.parse("2026-10-25T01:30:00.000Z"));
});

test("notify count, save label and banner", () => {
  const guests = ["accepted", "maybe", "pending", "declined", "withdrawn"].map((response) => ({ response }));
  assert.equal(notifyCount(guests), 3);
  assert.equal(saveLabel(6, false), "Save");
  assert.equal(saveLabel(0, true), "Save");
  assert.equal(saveLabel(1, true), "Save and notify 1 person");
  assert.equal(saveLabel(6, true), "Save and notify 6 people");
  assert.equal(notifyBanner(0), null);
  assert.equal(notifyBanner(1), "1 person will be told about changes to the date, time or place.");
  assert.equal(notifyBanner(6), "6 people will be told about changes to the date, time or place.");
});
