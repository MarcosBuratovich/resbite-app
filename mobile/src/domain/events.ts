import { validCategories, type CategoryKey } from "./categories";
import { artworkKeys } from "./catalogue";
import type { Activity } from "./rules";

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;

export type EventFields = {
  title: string;
  description: string;
  categories: CategoryKey[];
};

/** First problem in the organizer's own wording, matching the server rules; null when valid. */
export function validateEventFields(fields: EventFields): string | null {
  const title = fields.title.trim();
  if (!title) return "Give your resbite a name.";
  if (title.length > TITLE_MAX)
    return `Keep the name to ${TITLE_MAX} characters.`;
  if (fields.description.length > DESCRIPTION_MAX)
    return `Keep the description to ${DESCRIPTION_MAX} characters.`;
  if (!validCategories(fields.categories))
    return "Choose one or two categories.";
  return null;
}

/** An idea is an editable template (CE-D3): it prefills, everything stays changeable. */
export function fieldsFromActivity(activity: Activity): EventFields {
  return {
    title: activity.title.slice(0, TITLE_MAX).trim(),
    description: activity.description.slice(0, DESCRIPTION_MAX),
    categories: [...activity.categories],
  };
}

/** Drafts from before custom events lack event fields; saved values always win. */
export function completeEventFields(
  saved: Partial<EventFields>,
  fallback: EventFields | null,
): EventFields {
  return {
    title: saved.title ?? fallback?.title ?? "",
    description: saved.description ?? fallback?.description ?? "",
    categories: saved.categories ?? fallback?.categories ?? [],
  };
}

export type EventPicture =
  | { kind: "artwork"; key: string }
  | { kind: "placeholder"; category: CategoryKey };

/** Cover photos arrive in CE2. Until then: the idea's bundled artwork, else the primary category. */
export function eventPicture(plan: {
  activity_id: string | null;
  categories: readonly CategoryKey[];
}): EventPicture {
  if (plan.activity_id && (artworkKeys as readonly string[]).includes(plan.activity_id))
    return { kind: "artwork", key: plan.activity_id };
  return { kind: "placeholder", category: plan.categories[0] ?? "community" };
}
