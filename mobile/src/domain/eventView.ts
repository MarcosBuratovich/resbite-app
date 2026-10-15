import { categoryLabels, type CategoryKey } from "./categories";
import type { Plan } from "./plans";
import { spokenDate, spokenDateTime } from "./schedule";
import { spokenRange } from "./eventTime";
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

/** An invitee's stored answer as a status chip (UX2: Maybe; UX3-D7: "Can’t go", and "Can’t go now" after Going). */
export function responseText(response: string | null | undefined): string {
  if (response === "accepted") return "Going";
  if (response === "maybe") return "Maybe";
  if (response === "declined") return "Can’t go";
  if (response === "withdrawn") return "Can’t go now";
  return "Not answered";
}

export type GuestRow = { userId: string; name: string; response: string };
export type GuestArea =
  | { kind: "none" }
  | { kind: "hidden"; organizer: string }
  | { kind: "list"; names: string[]; label: string };

/**
 * The event page's guest area (UX-P5). The server already returns only an unanswered invitee's own row;
 * this says what to show: the organizer and "Answer to see who’s coming" until they answer, then the list.
 */
export function guestArea(view: {
  owner: boolean;
  response: string | null;
  organizer: string | null;
  guests: readonly GuestRow[];
}): GuestArea {
  if (!view.owner && (view.response === null || view.response === "pending"))
    return { kind: "hidden", organizer: view.organizer?.trim() || "Tester" };
  if (view.guests.length === 0) return { kind: "none" };
  const going = view.guests.filter((g) => g.response === "accepted");
  const maybe = view.guests.filter((g) => g.response === "maybe").length;
  return {
    kind: "list",
    names: going.map((g) => g.name),
    label: maybe > 0 ? `${going.length} going, ${maybe} maybe` : `${going.length} going`,
  };
}

export type GuestGroup = { title: string; guests: { userId: string; name: string; note: string | null }[] };
const GUEST_GROUPS: readonly { title: string; responses: readonly string[] }[] = [
  { title: "Going", responses: ["accepted"] },
  { title: "Maybe", responses: ["maybe"] },
  { title: "Can’t go", responses: ["declined", "withdrawn"] },
  { title: "Not answered yet", responses: ["pending"] },
];

/** The guest sheet, grouped by answer; "Can’t go now" marks someone who backed out after Going. */
export function guestGroups(guests: readonly GuestRow[]): GuestGroup[] {
  return GUEST_GROUPS.map(({ title, responses }) => ({
    title,
    guests: guests
      .filter((g) => responses.includes(g.response))
      .map((g) => ({ userId: g.userId, name: g.name, note: g.response === "withdrawn" ? "Can’t go now" : null })),
  })).filter((group) => group.guests.length > 0);
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

/**
 * How a card's date and time read to VoiceOver: "Saturday 10 October at 10:00", or with an end (UX3)
 * "Saturday 10 October, from 10:00 to 12:00". "" when there is no valid start.
 */
export function spokenWhen(startIso: string | null, endIso: string | null | undefined, now: Date): string {
  const date = parse(startIso);
  if (!date) return "";
  const range = spokenRange(startIso, endIso, now);
  return range ? `${spokenDate(date, now)}, ${range}` : spokenDateTime(date, now);
}

/** The single label a pressable card reads as: title, full date and time (with the end, if any), place, chips. */
export function cardLabel(
  card: {
    title: string;
    startsAt: string | null;
    endsAt?: string | null;
    place: string;
    chips: readonly string[];
    photo?: string;
  },
  now: Date,
): string {
  return [
    card.title.trim() || "Your resbite",
    spokenWhen(card.startsAt, card.endsAt, now) || "date not set",
    card.place.trim(),
    ...card.chips,
    card.photo?.trim() ? `Photo: ${card.photo.trim()}` : "",
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
  event: {
    title: string;
    startsAt: string | null;
    endsAt?: string | null;
    place: string;
    categories: readonly CategoryKey[];
    photo?: string;
  },
  now: Date,
): Record<CoverCardPart, string> {
  const orNotSet = (value: string) => value.trim() || "not set";
  return {
    picture: event.photo?.trim() ? `Edit photo, ${event.photo.trim()}` : "Edit photo",
    title: `Edit name, ${orNotSet(event.title)}`,
    date: `Edit date and time, ${orNotSet(spokenWhen(event.startsAt, event.endsAt, now))}`,
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
 * description, categories, place and Meeting details (`note`) copied. It never copies the date,
 * the end time (UX3), the Note to guests, guests or cover, and it has no source idea
 * (activityId null), so it opens at When.
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
  if (outcome === "description")
    return "Your resbite is saved, but the photo description didn’t save. Open Edit to add it again.";
  return null;
}
