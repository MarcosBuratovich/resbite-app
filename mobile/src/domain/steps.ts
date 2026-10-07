import type { CategoryKey } from "./categories";
import { validateEventFields, type EventFields } from "./events";
import { parseLocalDateTime } from "./plans";
import { validatePlan } from "./rules";

// UX1 creation steps (UX-D2). Each step wraps the existing validators with valid
// stand-ins for the other answers, so the messages stay exactly as they are.
export const QUESTION_STEPS = ["what", "when", "where", "vibe"] as const;
export type QuestionStep = (typeof QUESTION_STEPS)[number];
export type Step = QuestionStep | "review";
export const STEP_ORDER: readonly Step[] = [...QUESTION_STEPS, "review"];
export type StepAnswers = EventFields & { start: string; place: string };

const VALID_TITLE = "Resbite";
const VALID_CATEGORIES: CategoryKey[] = ["community"];

export function stepProblem(step: Step, answers: StepAnswers, now = Date.now()): string | null {
  switch (step) {
    case "what":
      return validateEventFields({ title: answers.title, description: "", categories: VALID_CATEGORIES });
    case "when":
      return validatePlan(parseLocalDateTime(answers.start)?.toISOString() ?? "", "place", now);
    case "where":
      return validatePlan(new Date(now + 86_400_000).toISOString(), answers.place, now);
    case "vibe":
      return validateEventFields({ title: VALID_TITLE, description: "", categories: answers.categories });
    case "review":
      // The description is added on Review ("+ Description").
      return validateEventFields({ title: VALID_TITLE, description: answers.description, categories: VALID_CATEGORIES });
  }
}

/** Review re-checks everything and names the first incomplete step (benchmark row 2). */
export function firstMissingStep(answers: StepAnswers, now = Date.now()): Step | null {
  return STEP_ORDER.find((step) => stepProblem(step, answers, now) !== null) ?? null;
}

export function nextStep(step: Step): Step {
  return STEP_ORDER[Math.min(STEP_ORDER.indexOf(step) + 1, STEP_ORDER.length - 1)];
}

export function previousStep(step: Step): Step | null {
  const index = STEP_ORDER.indexOf(step);
  return index > 0 ? STEP_ORDER[index - 1] : null;
}

/**
 * Where the editor opens (UX-D3):
 * - a restored unconfirmed save opens at Review, where Retry save is;
 * - a restored draft opens at Review when complete, else at its first missing step;
 * - a blank event opens at What, and an idea or an edit at Review.
 */
export function entryStep(input: {
  mode: "edit" | "idea" | "blank";
  restored: boolean;
  pending: boolean;
  answers: StepAnswers;
  now?: number;
}): Step {
  if (input.pending) return "review";
  if (input.restored) return firstMissingStep(input.answers, input.now) ?? "review";
  return input.mode === "blank" ? "what" : "review";
}

/** 1–4 for the question steps; Review has no progress. */
export function stepNumber(step: Step): number | null {
  const index = (QUESTION_STEPS as readonly string[]).indexOf(step);
  return index < 0 ? null : index + 1;
}

export function progressLabel(step: number, total: number = QUESTION_STEPS.length): string {
  return `Step ${step} of ${total}`;
}
