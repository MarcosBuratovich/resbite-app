import { validatePlan } from "./rules";
export type PlanRecord = {
  id: string;
  activity_id: string;
  starts_at: string;
  time_zone: string;
  place_label: string;
  note: string;
  status: string;
  version: number;
  owner_id?: string;
};
export type PlanDraft = Pick<
  PlanRecord,
  "starts_at" | "time_zone" | "place_label" | "note"
>;
export function canEditPlan(
  plan: PlanRecord,
  actor: string,
  now = Date.now(),
): boolean {
  return (
    Boolean(actor) &&
    plan.owner_id === actor &&
    plan.status === "active" &&
    Date.parse(plan.starts_at) > now
  );
}
export function preparePlanEdit(
  plan: PlanRecord,
  draft: PlanDraft,
  actor: string,
  now = Date.now(),
) {
  if (!canEditPlan(plan, actor, now))
    throw new Error("Only the organiser can change a future, active plan.");
  const invalid = validatePlan(draft.starts_at, draft.place_label, now);
  if (invalid) throw new Error(invalid);
  if (draft.place_label.trim().length > 300 || draft.note.length > 2000)
    throw new Error("The meeting place or note is too long.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: draft.time_zone });
  } catch {
    throw new Error("Choose a valid time zone.");
  }
  return {
    p_plan: plan.id,
    p_version: plan.version,
    p_start: draft.starts_at,
    p_zone: draft.time_zone,
    p_place: draft.place_label.trim(),
    p_note: draft.note,
    p_cancel: false,
  };
}
// Every screen load gets a generation; old requests cannot update a newer view.
export function latestRequest() {
  let generation = 0;
  return {
    start() {
      const current = ++generation;
      return () => generation === current;
    },
    invalidate() {
      generation++;
    },
  };
}
