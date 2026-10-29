import { PLAN_COPY } from "./planCopy";
import type { PlanForm } from "./planForm";

export type PlanFormField = "title" | "description" | "guestNote" | "place" | "area" | "meetingDetails";

/** Resbite is for meeting in person: the text shown beside a field that holds a video-call link. */
export const VIDEO_CALL_MESSAGE = PLAN_COPY.videoLink;

/**
 * A video-call host (zoom.us with any subdomain, meet.google.com, teams.microsoft.com, teams.live.com),
 * with or without a scheme or a subdomain. A host character (letter, digit, hyphen) just before it, or a
 * longer host just after it (zoom.useful.com, zoom.us.example.com), is not a match.
 */
const VIDEO_CALL_HOST = /(?<![a-z0-9-])(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)(?![a-z0-9-]|\.[a-z0-9])/i;

export const hasVideoCallLink = (text: string): boolean => VIDEO_CALL_HOST.test(text);

/** The text fields that hold a video-call link, in screen order. */
export function videoLinkFields(form: PlanForm): PlanFormField[] {
  const fields: PlanFormField[] = ["title", "description", "place", "area", "meetingDetails", "guestNote"];
  return fields.filter((field) => hasVideoCallLink(form[field]));
}
