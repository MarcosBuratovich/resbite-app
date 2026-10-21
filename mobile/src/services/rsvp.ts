import { supabase } from "./supabase";
import { planWithDetails, withDeadline } from "./plans";
import { planFromRow, type Plan } from "../domain/plans";
import type { RsvpAttempt, RsvpSnapshot } from "../domain/rsvp";
import { isLinkCode } from "../domain/appLinks";
import { claimLinkErrorMessage } from "../domain/eventLinks";
const eventUnavailable =
  "This invitation is unavailable, or its details could not be refreshed. Check your connection and try again.";
export async function readRsvp(
  planId: string,
  userId: string,
): Promise<RsvpSnapshot> {
  const [plan, attendee] = await Promise.all([
    withDeadline((signal) =>
      supabase
        .from("plans")
        .select(planWithDetails)
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
  if (plan.error || attendee.error) throw new Error(eventUnavailable);
  // Read after an answer, so Going or Maybe now brings the Meeting details (and Can’t go hides them).
  return { plan: planFromRow(plan.data), attendee: attendee.data };
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
/**
 * GI1: joins the event behind its link (as Not answered yet) and returns its id. The organizer opening their
 * own link gets their event's id back, with nothing joined.
 */
export async function claimEventLink(code: string): Promise<string> {
  if (!isLinkCode(code)) throw new Error("This invitation link is incomplete.");
  let reply;
  try {
    reply = await withDeadline((signal) =>
      supabase.rpc("claim_plan_link", { p_code: code }).abortSignal(signal),
    );
  } catch (error) {
    throw new Error(claimLinkErrorMessage(error));
  }
  if (reply.error) throw new Error(claimLinkErrorMessage(reply.error));
  return reply.data as string;
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

export type Guest = { userId: string; name: string; response: string };
export type EventSnapshot = {
  plan: Plan;
  /** The signed-in invitee's own row; null for the organizer. */
  attendee: { version: number; response: string } | null;
  /** The organizer's name, for an invitee's guest area; null for the organizer. */
  organizer: string | null;
  guests: Guest[];
};

/**
 * Who the signed-in person may see on an event. The server returns only an unanswered invitee's own
 * row (UX-P5), every row to the organizer, and every row once an invitee has answered.
 */
export async function readGuests(planId: string): Promise<Guest[]> {
  const { data, error } = await withDeadline((signal) =>
    supabase
      .from("attendees")
      .select("user_id,response,profiles(display_name)")
      .eq("plan_id", planId)
      .abortSignal(signal),
  );
  if (error) throw new Error(eventUnavailable);
  const rows: unknown = data;
  return Array.isArray(rows)
    ? rows.map((row: { user_id: string; response: string; profiles: { display_name: string } | null }) => ({
        userId: row.user_id,
        name: row.profiles?.display_name || "Tester",
        response: row.response,
      }))
    : [];
}

/**
 * The event page's read. Any failed read, the guest list and the organizer's name included, makes the
 * whole event unavailable. An invitee's own row and the organizer's name are read together.
 */
export async function readEvent(planId: string, userId: string): Promise<EventSnapshot> {
  const [plan, guests] = await Promise.all([
    withDeadline((signal) =>
      supabase.from("plans").select(planWithDetails).eq("id", planId).abortSignal(signal).single(),
    ),
    readGuests(planId),
  ]);
  if (plan.error || !plan.data) throw new Error(eventUnavailable);
  let attendee: EventSnapshot["attendee"] = null;
  let organizer: string | null = null;
  if (plan.data.owner_id !== userId) {
    const [own, host] = await Promise.all([
      withDeadline((signal) =>
        supabase
          .from("attendees")
          .select("version,response")
          .eq("plan_id", planId)
          .eq("user_id", userId)
          .abortSignal(signal)
          .single(),
      ),
      withDeadline((signal) =>
        supabase.from("profiles").select("display_name").eq("id", plan.data.owner_id).abortSignal(signal).single(),
      ),
    ]);
    if (own.error || host.error) throw new Error(eventUnavailable);
    attendee = own.data;
    organizer = host.data?.display_name ?? null;
  }
  return { plan: planFromRow(plan.data), attendee, organizer, guests };
}
