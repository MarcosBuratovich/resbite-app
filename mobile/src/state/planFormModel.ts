import {
  detailsFromForm,
  missingItems,
  timeOrPlaceChanged,
  type MissingItem,
  type PlanForm,
} from "../domain/planForm";
import { PLAN_COPY } from "../domain/planCopy";
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

export type SubmitCheck = {
  missing: MissingItem[];
  videoFields: PlanFormField[];
  /** The start is not in the future: `when` is in `missing`, and its row says so in its own words. */
  past: boolean;
};

const SCREEN_ORDER: MissingItem[] = ["name", "when", "place", "categories"];

/**
 * What stops a save: missing items, a start that is not after `now`, and fields that carry a video-call link.
 * A save runs only when `missing` and `videoFields` are both empty. A past start counts as the `when` item
 * (All day today starts at 00:00, so it is past). An edit's start is read as `editWrite` would save it.
 */
export function submitCheck(form: PlanForm, zone: string, now = Date.now(), original: Plan | null = null): SubmitCheck {
  const missing = missingItems(form);
  const videoFields = videoLinkFields(form);
  if (missing.includes("when")) return { missing, videoFields, past: false };
  const starts = original ? editWrite(form, zone, original).details.starts_at : detailsFromForm(form, zone).starts_at;
  const past = Date.parse(starts) <= now;
  return { missing: past ? SCREEN_ORDER.filter((item) => item === "when" || missing.includes(item)) : missing, videoFields, past };
}

/**
 * The create of a complete form; `requestId` is the new plan's id, so a retry is the same create. Only a create
 * from an idea carries the idea: Do this again and Start from scratch start on their own.
 */
export function createWrite(
  form: PlanForm,
  zone: string,
  requestId: string,
  mode: PlanFormMode,
  ideaId: string | null = null,
): PlanWrite {
  return { id: requestId, activityId: mode === "idea" ? ideaId : null, details: detailsFromForm(form, zone) };
}

/**
 * Whether closing the screen would lose something: a changed field, or, before the resbite exists, a chosen
 * photo or a typed photo description (`cover` is the photo chosen on this screen, not an inherited one).
 * An existing resbite saves its photo at once, so for an edit only the fields count.
 */
export function hasUnsavedChanges(
  mode: PlanFormMode,
  form: PlanForm,
  initial: PlanForm,
  cover: { uri: string | null; description: string },
): boolean {
  if (JSON.stringify(form) !== JSON.stringify(initial)) return true;
  return mode !== "edit" && (cover.uri !== null || cover.description.trim() !== "");
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
  return mode === "edit" ? PLAN_COPY.changesSaved : PLAN_COPY.resbiteCreated;
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
