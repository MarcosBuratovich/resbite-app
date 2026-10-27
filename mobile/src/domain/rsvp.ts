import type { Plan as LocalPlan } from "./plans";
export type Response = "accepted" | "maybe" | "declined" | "withdrawn";
export type RsvpSnapshot = {
  plan: LocalPlan;
  attendee: { version: number; response: string };
};
export type RsvpAttempt = {
  planId: string;
  planVersion: number;
  version: number;
  response: Response;
};
export function canRespond(snapshot: RsvpSnapshot, now = Date.now()) {
  return (
    snapshot.plan.status === "active" &&
    Date.parse(snapshot.plan.starts_at) > now
  );
}
export function canReadSample(snapshot: RsvpSnapshot, now = Date.now()) {
  return canRespond(snapshot, now) && snapshot.attendee.response === "accepted";
}
export function reconcileRsvp(
  attempt: RsvpAttempt,
  snapshot: RsvpSnapshot,
  now = Date.now(),
): "confirmed" | "retry" | "review" | "unavailable" {
  if (snapshot.plan.id !== attempt.planId || !canRespond(snapshot, now))
    return "unavailable";
  if (snapshot.plan.version !== attempt.planVersion) return "review";
  if (
    snapshot.attendee.response === attempt.response &&
    (snapshot.attendee.version === attempt.version ||
      snapshot.attendee.version === attempt.version + 1)
  )
    return "confirmed";
  return snapshot.attendee.version === attempt.version ? "retry" : "review";
}

export type AnswerKey = "going" | "maybe" | "cant";

/** The answer control's options (Segmented), for an invitation's row and an open-link request alike. */
export const ANSWER_OPTIONS = [
  { key: "going", text: "Going" },
  { key: "maybe", text: "Maybe" },
  { key: "cant", text: "Can’t go" },
] as const satisfies readonly { key: AnswerKey; text: string }[];

/** The answer control's selected option for a stored response (UX2: Going / Maybe; UX3-D7: Can’t go). */
export function answerKey(response: string): AnswerKey | null {
  if (response === "accepted") return "going";
  if (response === "maybe") return "maybe";
  return response === "declined" || response === "withdrawn" ? "cant" : null;
}

/** Can’t go withdraws after Going ("Can’t go now"); before Going, or after Maybe, it declines. */
export function cantGoResponse(current: string): Response {
  return current === "accepted" || current === "withdrawn" ? "withdrawn" : "declined";
}

/** The response a tap on the answer control saves. */
export function responseFor(key: AnswerKey, current: string): Response {
  return key === "going" ? "accepted" : key === "maybe" ? "maybe" : cantGoResponse(current);
}
