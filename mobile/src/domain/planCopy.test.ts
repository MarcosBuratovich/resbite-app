import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_COPY, createdNotice } from "./planCopy.ts";

test("the copy keeps its curly apostrophes and quotes", () => {
  assert.equal(PLAN_COPY.descriptionPlaceholder, "What you’ll do together (optional)");
  assert.equal(PLAN_COPY.discardCreateBody, "Your resbite isn’t created yet. If you close it now, what you entered will be lost.");
  assert.equal(PLAN_COPY.itsOn, "It’s on!");
  assert.equal(PLAN_COPY.noRepeat, "Doesn’t repeat");
  assert.equal(PLAN_COPY.videoLink, "Resbite is for meeting in person. Take out the video-call link.");
  assert.equal(PLAN_COPY.placeRowMessage, "Add a place or choose “To be decided”");
});

test("titles, buttons and durations", () => {
  assert.equal(PLAN_COPY.newTitle, "New resbite");
  assert.equal(PLAN_COPY.editTitle, "Edit resbite");
  assert.equal(PLAN_COPY.loading, "Loading");
  assert.deepEqual(
    [PLAN_COPY.d30, PLAN_COPY.d60, PLAN_COPY.d120, PLAN_COPY.d180, PLAN_COPY.allDay],
    ["30 min", "1 h", "2 h", "3 h", "All day"],
  );
  assert.equal(PLAN_COPY.chatCloses, "The chat closes 7 days after the end time.");
  assert.equal(PLAN_COPY.placeSearch, "A café, a park, your place…");
});

test("no string uses a straight apostrophe", () => {
  for (const [key, value] of Object.entries(PLAN_COPY)) assert.ok(!value.includes("'"), key);
});

test("the Create tab copy", () => {
  assert.equal(PLAN_COPY.createHeading, "What do you want to do?");
  assert.equal(PLAN_COPY.startFromScratch, "Start from scratch");
  assert.equal(PLAN_COPY.orStartFromIdea, "Or start from an idea");
});

test("the line after a create with an unknown outcome", () => {
  assert.equal(
    PLAN_COPY.uncertainCreate,
    "Your resbite may already be created. Check your connection and tap Create to find out.",
  );
});

test("the notice for a create that went through", () => {
  assert.equal(createdNotice("Coffee together"), "Coffee together is created.");
});

test("the past start and the withdrawn idea", () => {
  assert.equal(PLAN_COPY.whenInFuture, "Choose a date and time in the future.");
  assert.equal(PLAN_COPY.ideaGone, "That idea is no longer available. Create the resbite on its own.");
});

test("the words the plan screen builds its lines from", () => {
  assert.deepEqual(
    [PLAN_COPY.oneMissing, PLAN_COPY.twoMissing, PLAN_COPY.threeMissing, PLAN_COPY.fourMissing, PLAN_COPY.and],
    ["One thing is missing", "Two things are missing", "Three things are missing", "Four things are missing", "and"],
  );
  assert.deepEqual([PLAN_COPY.person, PLAN_COPY.people], ["person", "people"]);
});

test("the notices and errors of saving and loading", () => {
  assert.equal(PLAN_COPY.changesSaved, "Changes saved");
  assert.equal(PLAN_COPY.resbiteCreated, "Resbite created");
  assert.equal(PLAN_COPY.loadFailed, "We couldn’t load this resbite. Check your connection and try again.");
  assert.equal(PLAN_COPY.notEditable, "Only the organizer can edit an upcoming, active plan.");
  assert.equal(PLAN_COPY.ideaUnavailable, "This idea isn’t available right now.");
  assert.equal(PLAN_COPY.notProtected, "Couldn’t protect this save on your device. Nothing was sent; try again.");
  assert.equal(PLAN_COPY.unconfirmed, "We couldn’t confirm the save. Retry when you’re connected.");
});

test("the fields' names, as the mockup labels them", () => {
  assert.equal(PLAN_COPY.titleLabel, "Title");
  assert.equal(PLAN_COPY.descriptionLabel, "Description (optional)");
  assert.equal(PLAN_COPY.noteLabel, "Note to guests (optional)");
  assert.equal(PLAN_COPY.categoriesLabel, "Categories · choose one or two");
});

test("an edit that met a newer save", () => {
  assert.equal(PLAN_COPY.editConflict, "The saved details changed and are shown now. Make your change again.");
});
