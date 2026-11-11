import test from "node:test";
import assert from "node:assert/strict";
import { CIRCLE_COPY } from "./circleCopy";

test("the circle card's words are the design's, with curly apostrophes", () => {
  assert.equal(CIRCLE_COPY.heading, "Circle of trust");
  assert.equal(
    CIRCLE_COPY.hint,
    "Let the people you invite bring someone you don’t know. Whoever they bring is in, without your OK.",
  );
  assert.equal(CIRCLE_COPY.eachBrings, "Each person can bring");
  assert.equal(CIRCLE_COPY.nobody, "Nobody");
  assert.equal(CIRCLE_COPY.howFar, "How far it goes");
  assert.equal(CIRCLE_COPY.accountsOnly, "Only people with a Resbite account.");
  assert.equal(CIRCLE_COPY.saveFailed, "Couldn’t save the circle. Try again.");
  assert.equal(CIRCLE_COPY.eachGuest, "Each guest");
});

test("How far it goes names one level and more", () => {
  assert.equal(CIRCLE_COPY.levels(1), "1 level");
  assert.equal(CIRCLE_COPY.levels(2), "2 levels");
  assert.equal(CIRCLE_COPY.levels(3), "3 levels");
});

test("the options 1, 2 and 3 are spoken as people each", () => {
  assert.equal(CIRCLE_COPY.bringsLabel(1), "1 person each");
  assert.equal(CIRCLE_COPY.bringsLabel(2), "2 people each");
  assert.equal(CIRCLE_COPY.bringsLabel(3), "3 people each");
});

test("the people list's line spells the levels out (CO-07)", () => {
  assert.equal(CIRCLE_COPY.listLine(1, 2), "Circle of trust: each person brings 1, two levels.");
  assert.equal(CIRCLE_COPY.listLine(3, 1), "Circle of trust: each person brings 3, one level.");
  assert.equal(CIRCLE_COPY.listLine(2, 3), "Circle of trust: each person brings 2, three levels.");
});
