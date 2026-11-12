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

test("bringing someone: the row, its hints and bring mode's lines are the design's, with curly apostrophes (CO-05, CO-06)", () => {
  assert.equal(CIRCLE_COPY.bringSomeone, "Bring someone");
  assert.equal(CIRCLE_COPY.bringHint("Ana", 1), "Ana trusts you to bring 1 person. They’re in, no approval needed.");
  assert.equal(CIRCLE_COPY.bringHint("Ana", 2), "Ana trusts you to bring 2 people. They’re in, no approval needed.");
  assert.equal(CIRCLE_COPY.bringHintMore("Ana", 1), "Ana trusts you to bring 1 more person. They’re in, no approval needed.");
  assert.equal(CIRCLE_COPY.bringHintMore("Ana", 2), "Ana trusts you to bring 2 more people. They’re in, no approval needed.");
  assert.equal(CIRCLE_COPY.youBrought(["Clara"]), "You brought Clara");
  assert.equal(CIRCLE_COPY.youBrought(["Clara", "Martín"]), "You brought Clara and Martín");
  assert.equal(CIRCLE_COPY.youBrought(["Clara", "Martín", "Sol"]), "You brought Clara, Martín and Sol");
  assert.equal(CIRCLE_COPY.bringLine("Ana", 1, "Board game night"), "Ana trusts you to bring 1 person to Board game night.");
  assert.equal(CIRCLE_COPY.bringLine("Ana", 3, "Board game night"), "Ana trusts you to bring 3 people to Board game night.");
  assert.equal(CIRCLE_COPY.notAllowed, "You can’t bring anyone to this resbite now.");
  assert.equal(CIRCLE_COPY.noneLeft, "You’ve used all your invites for this resbite.");
});

test("a batch refused for one person, while bringing is still allowed, asks the bringer to ask the host (C5)", () => {
  assert.equal(CIRCLE_COPY.oneRefused, "One of these people can’t be brought here. Ask the host.");
});

test("bring mode's cap, count and used-all lines (C20, C23)", () => {
  assert.equal(CIRCLE_COPY.overCap, "That’s more than you can bring now. Untick someone to continue.");
  assert.equal(CIRCLE_COPY.cantAddMore, "You can’t bring more people now.");
  assert.equal(CIRCLE_COPY.cappedHint, "No invites left");
  assert.equal(CIRCLE_COPY.sendAgainHint, "To send an invitation again, open it on the people list.");
  assert.equal(CIRCLE_COPY.left(1), "1 left");
  assert.equal(CIRCLE_COPY.left(2), "2 left");
  assert.equal(CIRCLE_COPY.left(3), "3 left");
  assert.equal(CIRCLE_COPY.left(0), "None left");
  assert.equal(CIRCLE_COPY.left(-1), "None left");
});

test("a bringer taking back an invitation the server no longer lets them (C14)", () => {
  assert.equal(CIRCLE_COPY.cantTakeBack, "You can’t take this invitation back any more.");
});
