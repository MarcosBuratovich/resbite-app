import {
  detailsFromForm,
  missingItems,
  timeOrPlaceChanged,
  type MissingItem,
  type PlanForm,
} from "../domain/planForm";
import type { Plan, PlanDetails, PlanWrite } from "../domain/plans";
import { videoLinkFields, type PlanFormField } from "../domain/videoLinks";

export type PlanFormMode = "idea" | "blank" | "edit" | "again";

/** Which way the plan screen was opened: a plan to edit, one to do again, an idea, or nothing (blank). */
export function modeFor(params: { activity?: string; plan?: string; again?: string }): PlanFormMode {
  if (params.plan) return "edit";
  if (params.again) return "again";
  if (params.activity) return "idea";
  return "blank";
}

/** What stops a save: missing items and fields that carry a video-call link. A save runs only when both are empty. */
export function submitCheck(form: PlanForm): { missing: MissingItem[]; videoFields: PlanFormField[] } {
  return { missing: missingItems(form), videoFields: videoLinkFields(form) };
}

/** The create of a complete form; `requestId` is the new plan's id, so a retry is the same create. */
export function createWrite(
  form: PlanForm,
  zone: string,
  requestId: string,
  activityId: string | null = null,
): PlanWrite {
  return { id: requestId, activityId, details: detailsFromForm(form, zone) };
}

/**
 * The edit of a complete form. The form shows the plan's times in the plan's own zone, so an unchanged start
 * keeps that zone (an edit from another zone is not a time change); a changed start is read in the device zone.
 */
export function editWrite(form: PlanForm, zone: string, original: Plan): PlanWrite {
  const own = original.time_zone ?? zone;
  const kept = detailsFromForm(form, own);
  const details = Date.parse(kept.starts_at) === Date.parse(original.starts_at) ? kept : detailsFromForm(form, zone);
  return { id: original.id, activityId: original.activity_id, version: original.version, details };
}

/** The notice the next screen shows after a save. */
export function afterSaveNotice(mode: PlanFormMode): string {
  return mode === "edit" ? "Changes saved" : "Resbite created";
}

/** The details a plan is saved with now, for comparing against an edit. */
function savedDetails(plan: Plan, zone: string): PlanDetails {
  return {
    title: plan.title,
    description: plan.description,
    categories: plan.categories,
    starts_at: plan.starts_at,
    ends_at: plan.ends_at ?? "",
    place_label: plan.place_label,
    place_tbd: plan.place_tbd ?? false,
    repeat_weeks: plan.repeat_weeks ?? null,
    note: plan.note,
    area: plan.area ?? "",
    time_zone: plan.time_zone ?? zone,
  };
}

/** Whether saving this edit changes the start, end, zone or place; false while the form is incomplete. */
export function editChangesTimeOrPlace(form: PlanForm, zone: string, original: Plan): boolean {
  if (missingItems(form).length > 0) return false;
  return timeOrPlaceChanged(savedDetails(original, zone), editWrite(form, zone, original).details);
}
