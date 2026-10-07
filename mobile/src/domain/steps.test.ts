import test from "node:test";
import assert from "node:assert/strict";
import {
  entryStep,
  firstMissingStep,
  nextStep,
  previousStep,
  progressLabel,
  stepNumber,
  stepProblem,
  type StepAnswers,
} from "./steps.ts";

const now = Date.parse("2026-10-07T12:00:00Z");
const complete: StepAnswers = {
  title: "Garden picnic",
  description: "",
  categories: ["natural"],
  start: "2099-03-01 15:00",
  place: "Riverside park",
};

test("each step reports only its own problem, in the existing wording", () => {
  const empty: StepAnswers = { title: " ", description: "d".repeat(1001), categories: [], start: "", place: "  " };
  assert.equal(stepProblem("what", empty, now), "Give your resbite a name.");
  assert.equal(stepProblem("when", empty, now), "Choose a date and time in the future.");
  assert.equal(stepProblem("where", empty, now), "Add a meeting place.");
  assert.equal(stepProblem("vibe", empty, now), "Choose one or two categories.");
  assert.equal(stepProblem("review", empty, now), "Keep the description to 1000 characters.");
  assert.equal(stepProblem("what", { ...complete, title: "x".repeat(81) }, now), "Keep the name to 80 characters.");
  assert.equal(stepProblem("when", { ...complete, start: "2020-01-01 09:00" }, now), "Choose a date and time in the future.");
  assert.equal(stepProblem("when", { ...complete, start: "2099-02-30 12:00" }, now), "Choose a date and time in the future.");
  assert.equal(
    stepProblem("vibe", { ...complete, categories: ["natural", "community", "creative"] }, now),
    "Choose one or two categories.",
  );
  for (const step of ["what", "when", "where", "vibe", "review"] as const)
    assert.equal(stepProblem(step, complete, now), null, step);
});

test("Review re-checks everything in flow order", () => {
  assert.equal(firstMissingStep(complete, now), null);
  assert.equal(firstMissingStep({ ...complete, place: "", categories: [] }, now), "where");
  assert.equal(firstMissingStep({ ...complete, start: "", place: "" }, now), "when");
  assert.equal(firstMissingStep({ ...complete, description: "d".repeat(1001) }, now), "review");
});

test("entry: blank at What, idea and edit at Review, restored drafts at Review when complete or else at the first missing step", () => {
  const entry = (mode: "edit" | "idea" | "blank", restored: boolean, answers: StepAnswers) =>
    entryStep({ mode, restored, pending: false, answers, now });
  assert.equal(entry("blank", false, { ...complete, title: "" }), "what");
  assert.equal(entry("idea", false, { ...complete, place: "" }), "review");
  assert.equal(entry("edit", false, complete), "review");
  assert.equal(entry("blank", true, complete), "review");
  assert.equal(entry("idea", true, { ...complete, place: "" }), "where");
  // "Do this again": everything is copied except the date.
  assert.equal(entry("blank", true, { ...complete, start: "" }), "when");
});

test("a restored unconfirmed save always opens at Review, even when its time has passed", () => {
  assert.equal(
    entryStep({ mode: "blank", restored: true, pending: true, answers: { ...complete, start: "2020-01-01 09:00" }, now }),
    "review",
  );
  assert.equal(
    entryStep({ mode: "edit", restored: true, pending: true, answers: { ...complete, place: "" }, now }),
    "review",
  );
});

test("step order, numbers and progress wording", () => {
  assert.equal(nextStep("what"), "when");
  assert.equal(nextStep("vibe"), "review");
  assert.equal(nextStep("review"), "review");
  assert.equal(previousStep("what"), null);
  assert.equal(previousStep("review"), "vibe");
  assert.equal(stepNumber("where"), 3);
  assert.equal(stepNumber("review"), null);
  assert.equal(progressLabel(2), "Step 2 of 4");
});
