import type { Plan as LocalPlan } from "./plans";
export type Response = "accepted" | "declined" | "withdrawn";
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
