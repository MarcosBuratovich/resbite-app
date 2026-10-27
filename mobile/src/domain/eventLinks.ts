import { timeRange } from "./eventTime";

/**
 * GI1: the event's one link. What the app says when reading, turning off or joining by a link, or removing a
 * guest, fails. The database's codes: 42501 is "not the organizer of an upcoming, active resbite" for the
 * organizer's calls and "no longer active, started or cancelled" for joining; 22023 is "the organizer can't be
 * removed" (and, for a per-person link from before GI1, "the organizer can't claim it"). Link codes are never
 * part of a message.
 */
const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

export type LinkAction = "link" | "rotate" | "remove";

const closed: Record<LinkAction, string> = {
  link: "Only the organizer of an upcoming resbite can share its link. It may have started or been cancelled.",
  rotate: "Only the organizer of an upcoming resbite can turn its link off. It may have started or been cancelled.",
  remove: "Only the organizer of an upcoming resbite can remove guests. It may have started or been cancelled.",
};
const offline: Record<LinkAction, string> = {
  link: "Couldn’t load the link. Check your connection and try again.",
  rotate: "Couldn’t confirm the link was turned off. Check your connection and try again.",
  remove: "Couldn’t confirm this guest was removed. Check your connection and try again.",
};

export function linkErrorMessage(action: LinkAction, error: unknown): string {
  const code = errorCode(error);
  if (code === "42501" || code === "PGRST301") return closed[action];
  if (action === "remove" && code === "22023") return "The organizer can’t be removed from their own resbite.";
  return offline[action];
}

export const inactiveInvitation =
  "This invitation is no longer active, or the event has started or was cancelled.";
export const incompleteInvitation = "This invitation link is incomplete.";
/** A per-person link (before GI1) opened by its own organizer. An event link just opens their event. */
export const ownInvitation = "You organize this resbite. Open it from My resbites.";

/**
 * Joining by an event link or a per-person link. The organizer opening their own event link lands on their
 * event (no error).
 */
export function claimLinkErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "42501") return inactiveInvitation;
  if (code === "22023") return ownInvitation;
  return "This invitation could not be opened. Check your connection and try again.";
}

/**
 * A claim refused for good: the link is turned off, the event started or was cancelled, the link is malformed,
 * or it is the organizer's own. The invite screen then drops the kept link, so a restart opens the app as
 * usual. Anything else (a lost connection or a timeout) keeps it for a retry.
 */
export function isClaimRefusal(message: string): boolean {
  return message === inactiveInvitation || message === incompleteInvitation || message === ownInvitation;
}

/** The question before the organizer removes a guest: removing is not a ban (P8). */
export function removeGuestQuestion(name: string): string {
  return `Remove ${name} from this resbite? They can ask to join again with the event link, and you’ll decide.`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Fri 23 Oct, 19:30 – 22:00" (no end: "Fri 23 Oct, 19:30"), as the link's web page writes it; "" without a start. */
export function linkDate(startIso: string | null, endIso?: string | null): string {
  const start = startIso ? new Date(startIso) : null;
  if (!start || !Number.isFinite(start.getTime())) return "";
  return `${DAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}, ${timeRange(startIso, endIso)}`;
}

/** What Share sends: "<Title>, <date>. RSVP: <link>". */
export function shareMessage(
  plan: { title: string; starts_at: string; ends_at?: string | null },
  link: string,
): string {
  const date = linkDate(plan.starts_at, plan.ends_at);
  return `${plan.title.trim()}${date ? `, ${date}` : ""}. RSVP: ${link}`;
}

export const TURN_OFF_TITLE = "Turn off this link?";
export const TURN_OFF_MESSAGE =
  "People with the old link will see that it’s no longer active. You’ll get a new link.";

/** The ⓘ "Invitation links" sheet. */
export const LINK_INFO = [
  "Each resbite has one invitation link. Share it anywhere: messages, email or a group chat.",
  "Anyone with the link sees the basics: who invited them, the name, the time, the area, how many are going and the picture.",
  "The exact place and Meeting details show only after they reply.",
  "Turn the link off to stop it working. You’ll get a new link to share.",
  "Turning the link off also stops any older per-person links you shared.",
  "Answers through the link wait for your approval. You’ll see them in Waiting for you on the event page.",
  "Someone you remove can ask to join again with the link, and you’ll decide.",
] as const;
