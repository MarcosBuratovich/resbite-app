import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_COPY } from "./planCopy.ts";

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
