import { categoryLabels, type CategoryKey } from "./categories";
import type { Plan } from "./plans";
import { spokenDateTime } from "./schedule";
import type { PlanDraft } from "../services/draftStore";

// Wording and grouping for cover cards, Review, My resbites and the event page (UX1).
const BADGE_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const parse = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** "SAT / 12" on a card; read as part of the card's label, never on its own. */
export function dateBadgeParts(iso: string | null): { weekday: string; day: string } | null {
  const date = parse(iso);
  return date ? { weekday: BADGE_DAYS[date.getDay()], day: String(date.getDate()) } : null;
}

/** Local 24-hour start time, or "" when there is none yet. */
export function timeText(iso: string | null): string {
  const date = parse(iso);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

/** An invitee's stored answer as a status chip. UX2 adds Maybe and "Can’t make it now". */
export function responseText(response: string | null | undefined): string {
  if (response === "accepted") return "Going";
  if (response === "declined" || response === "withdrawn") return "Can’t make it";
  return "Not answered";
}

/** Chips on a My resbites card: Cancelled first, then the role, then guests (host) or the answer (invitee). */
export function cardChips(card: { owner: boolean; status: string; response?: string | null; going?: number }): string[] {
  const cancelled = card.status === "cancelled";
  const chips = cancelled ? ["Cancelled"] : [];
  chips.push(card.owner ? "Hosting" : "Invited");
  if (cancelled) return chips;
  if (!card.owner) chips.push(responseText(card.response));
  else if (card.going) chips.push(`${card.going} going`);
  return chips;
}

/** The single label a pressable card reads as: title, full date and time, place, chips. */
export function cardLabel(
  card: { title: string; startsAt: string | null; place: string; chips: readonly string[] },
  now: Date,
): string {
  const date = parse(card.startsAt);
  return [
    card.title.trim() || "Your resbite",
    date ? spokenDateTime(date, now) : "date not set",
    card.place.trim(),
    ...card.chips,
  ]
    .filter(Boolean)
    .join(", ");
}

/** "Natural and Community". */
export function vibeText(categories: readonly CategoryKey[]): string {
  return categories.map((key) => categoryLabels[key]).join(" and ");
}

export type CoverCardPart = "picture" | "title" | "date" | "place" | "chips";

/** Review card parts: each is a button that jumps to its step (benchmark row 4). */
export function reviewLabels(
  event: { title: string; startsAt: string | null; place: string; categories: readonly CategoryKey[] },
  now: Date,
): Record<CoverCardPart, string> {
  const date = parse(event.startsAt);
  const orNotSet = (value: string) => value.trim() || "not set";
  return {
    picture: "Edit photo",
    title: `Edit name, ${orNotSet(event.title)}`,
    date: `Edit date and time, ${date ? spokenDateTime(date, now) : "not set"}`,
    place: `Edit place, ${orNotSet(event.place)}`,
    chips: `Edit vibe, ${orNotSet(vibeText(event.categories))}`,
  };
}

/** Upcoming: active and still ahead, soonest first. Past: started or cancelled, latest first (benchmark row 15). */
export function groupPlans<T extends { status: string; starts_at: string }>(
  plans: readonly T[],
  now: number,
): { upcoming: T[]; past: T[] } {
  const at = (plan: T) => Date.parse(plan.starts_at);
  const ahead = (plan: T) => plan.status === "active" && at(plan) > now;
  return {
    upcoming: plans.filter(ahead).sort((a, b) => at(a) - at(b)),
    past: plans.filter((plan) => !ahead(plan)).sort((a, b) => at(b) - at(a)),
  };
}

const TYPED_COORDINATES = /^\s*(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Apple Maps link (benchmark row 6). Opens only when tapped. */
export function mapsUrl(place: { place_label: string; latitude?: number | null; longitude?: number | null }): string | null {
  const label = place.place_label.trim();
  if (!label) return null;
  const query = `q=${encodeURIComponent(label)}`;
  if (typeof place.latitude === "number" && typeof place.longitude === "number")
    return `https://maps.apple.com/?ll=${place.latitude},${place.longitude}&${query}`;
  // "Use my location" writes "lat, lon" when no address is found.
  const typed = TYPED_COORDINATES.exec(label);
  if (typed && Math.abs(Number(typed[1])) <= 90 && Math.abs(Number(typed[2])) <= 180)
    return `https://maps.apple.com/?ll=${typed[1]},${typed[2]}&${query}`;
  return `https://maps.apple.com/?${query}`;
}

/** An all-empty baseline: such a draft stays dirty until every field is cleared. Order: title, description, categories, start, place, note. */
export const BLANK_DRAFT_BASELINE = JSON.stringify(["", "", [], "", "", ""]);

/**
 * "Do this again" (benchmark row 5): a new blank-type draft (key "new") with the title,
 * description, categories, place and note copied. It never copies the date, guests or
 * cover, and it has no source idea (activityId null), so it opens at When.
 */
export function againDraft(
  plan: Plan,
  options: { scope: string; requestId: string; zone: string; now: Date },
): PlanDraft {
  return {
    schema: 1,
    scope: options.scope,
    key: "new",
    activityId: null,
    requestId: options.requestId,
    original: null,
    initial: BLANK_DRAFT_BASELINE,
    title: plan.title,
    description: plan.description,
    categories: [...plan.categories],
    start: "",
    place: plan.place_label,
    note: plan.note,
    zone: options.zone,
    pending: null,
    updatedAt: options.now.toISOString(),
  };
}

/** An unconfirmed new save must never be overwritten; an unfinished new draft is replaced only after asking. */
export function againConflict(drafts: readonly PlanDraft[]): "none" | "replace" | "blocked" {
  const existing = drafts.find((draft) => draft.key === "new");
  if (!existing) return "none";
  return existing.pending ? "blocked" : "replace";
}

/** Route params that reopen the editor that wrote a draft (its key is derived from them). */
export function draftRoute(draft: Pick<PlanDraft, "key" | "planId" | "activityId">): { plan?: string; activity?: string } {
  if (draft.planId) return { plan: draft.planId };
  if (draft.key === "new" || !draft.activityId) return {};
  return { activity: draft.activityId };
}

/** Cover failure notices keep their wording because they ask for action. */
export function coverNotice(outcome: string | string[] | undefined): string | null {
  if (outcome === "pending")
    return "Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry.";
  if (outcome === "failed")
    return "Your resbite is saved, but its cover photo couldn’t be prepared. Open Edit plan to add it again.";
  return null;
}
