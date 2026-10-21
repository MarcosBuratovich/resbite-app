import { localDay, shortDay } from "./schedule";

// UX3 Meeting details and Note to guests on the event page (spec "Event details", UX3-D5, UX3-D6).

export type MeetingDetailsView = { kind: "shown"; text: string } | { kind: "locked" } | { kind: "none" };

/**
 * What the event page shows for Meeting details. The organizer and Going or Maybe guests see the text (the
 * database only sends it to them); anyone else sees a locked line when some exist, and nothing otherwise.
 */
export function meetingDetailsView(view: {
  owner: boolean;
  response: string | null;
  hasDetails: boolean;
  text: string;
}): MeetingDetailsView {
  const insider = view.owner || view.response === "accepted" || view.response === "maybe";
  if (insider) return view.text.trim() ? { kind: "shown", text: view.text.trim() } : { kind: "none" };
  return view.hasDetails ? { kind: "locked" } : { kind: "none" };
}

export const MEETING_DETAILS_LOCKED = "Meeting details appear after you answer Going or Maybe.";
export const MEETING_DETAILS_HINT = "Only people who answer Going or Maybe see this.";

// GI1-D5: the optional area, shown to anyone with the event's link before they reply; the place is the exact one.
export const AREA_MAX = 80;
export const AREA_LABEL = "Area, shown before people reply";
export const AREA_PLACEHOLDER = "Near Old Street";
export const AREA_HINT = "Anyone with the link sees this. The exact place shows after they reply.";
/** Review's line for a set area, or null when there is none. */
export function areaLine(area: string | null | undefined): string | null {
  const text = (area ?? "").trim();
  return text ? `Area · ${text}` : null;
}

export const GUEST_NOTE_MAX = 280;

/**
 * The note sheet's check: up to 280 characters after trimming, counted as the database does (code points, so an
 * emoji counts once). An empty note removes it.
 */
export function guestNoteError(text: string): string | null {
  return [...text.trim()].length > GUEST_NOTE_MAX ? `Keep the note to ${GUEST_NOTE_MAX} characters.` : null;
}

/** The posted time on the note card: "9:41" today, "Fri 16 9:41" on another day, or "" when unknown. */
export function guestNoteTime(iso: string | null | undefined, now: Date): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  return localDay(date) === localDay(now) ? time : `${shortDay(date)} ${time}`;
}

/**
 * Whether the organizer may post or change the note: an active event until it ends (its end time, or an
 * hour after the start), as the database enforces.
 */
export function canPostGuestNote(plan: { status: string; starts_at: string; ends_at?: string | null }, now: number): boolean {
  if (plan.status !== "active") return false;
  const start = Date.parse(plan.starts_at);
  const end = plan.ends_at ? Date.parse(plan.ends_at) : start + 60 * 60 * 1000;
  return Number.isFinite(end) && now < end;
}
