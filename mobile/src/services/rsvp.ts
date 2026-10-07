import { supabase } from "./supabase";
import { withDeadline } from "./plans";
import type { RsvpAttempt, RsvpSnapshot } from "../domain/rsvp";
export async function readRsvp(
  planId: string,
  userId: string,
): Promise<RsvpSnapshot> {
  const [plan, attendee] = await Promise.all([
    withDeadline((signal) =>
      supabase
        .from("plans")
        .select("*")
        .eq("id", planId)
        .abortSignal(signal)
        .single(),
    ),
    withDeadline((signal) =>
      supabase
        .from("attendees")
        .select("version,response")
        .eq("plan_id", planId)
        .eq("user_id", userId)
        .abortSignal(signal)
        .single(),
    ),
  ]);
  if (plan.error || attendee.error)
    throw new Error(
      "This invitation is unavailable, or its details could not be refreshed. Check your connection and try again.",
    );
  return { plan: plan.data, attendee: attendee.data };
}
export async function claimInvitation(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("This invitation link is incomplete.");
  const { data, error } = await withDeadline((signal) =>
    supabase.rpc("claim_invite", { p_token: token }).abortSignal(signal),
  );
  if (error)
    throw new Error(
      "This invitation could not be opened. It may be revoked, already claimed by someone else, or no longer available. Check your connection and try again.",
    );
  return data as string;
}
export async function writeRsvp(attempt: RsvpAttempt) {
  const { error } = await withDeadline((signal) =>
    supabase
      .rpc("respond", {
        p_plan: attempt.planId,
        p_response: attempt.response,
        p_version: attempt.version,
      })
      .abortSignal(signal),
  );
  if (error) throw error;
}
