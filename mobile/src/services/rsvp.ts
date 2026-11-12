import { supabase } from "./supabase";
import { planWithDetails, withDeadline } from "./plans";
import { planFromRow, type Plan } from "../domain/plans";
import type { RsvpAttempt, RsvpSnapshot } from "../domain/rsvp";
import { isInviteToken } from "../domain/appLinks";
import { claimLinkErrorMessage, incompleteInvitation } from "../domain/eventLinks";
import { answerCountsFrom, broughtFrom, type AnswerCounts } from "../domain/eventPage";
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
/**
 * A per-person link (before GI1). Its refusals read as the event link's do, so the invite screen can tell a
 * refusal for good (`isClaimRefusal`) from a lost connection.
 */
export async function claimInvitation(token: string): Promise<string> {
  if (!isInviteToken(token)) throw new Error(incompleteInvitation);
  let reply;
  try {
    reply = await withDeadline((signal) =>
      supabase.rpc("claim_invite", { p_token: token }).abortSignal(signal),
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

export type Guest = {
  userId: string;
  name: string;
  response: string;
  /** The guest who brought them (CO-P9); null for someone a host invited, or who asked through the link. */
  broughtById: string | null;
  /** Their level in the circle: 1 for a host's guest, one more per hop. */
  level: number;
};
/** The name `readGuests` gives a guest whose profile name is missing or blank (a hidden or missing profile row). */
export const UNNAMED_GUEST = "Tester";
export type EventSnapshot = {
  plan: Plan;
  /** The signed-in invitee's own row; null for the organizer. */
  attendee: { version: number; response: string } | null;
  /** The organizer's name, for an invitee's guest area; null for the organizer. */
  organizer: string | null;
  guests: Guest[];
  /** The ids of the people the host made admins. */
  admins: string[];
  /**
   * How many are going, maybe and can't go, from the server, for an invitee who hasn't answered (they read only their
   * own guest row); null when `guests` is the whole list, as it is for everyone in a group.
   */
  counts: AnswerCounts | null;
  /**
   * The resbite is a group's and the signed-in person is in it (`series_is_group`, G-N13): they see everyone in it,
   * answered or not. False on a one-off, and whenever the flag couldn't be read (I4).
   */
  isGroup: boolean;
};

/**
 * Who the signed-in person may see on an event. The server returns only an unanswered invitee's own
 * row (UX-P5), every row to the organizer, and every row once an invitee has answered.
 */
export async function readGuests(planId: string): Promise<Guest[]> {
  const { data, error } = await withDeadline((signal) =>
    supabase
      .from("attendees")
      .select("user_id,response,brought_by,level,profiles(display_name)")
      .eq("plan_id", planId)
      .abortSignal(signal),
  );
  if (error) throw new Error(eventUnavailable);
  const rows: unknown = data;
  return Array.isArray(rows)
    ? rows.map(
        (row: { user_id: string; response: string; brought_by?: unknown; level?: unknown; profiles: { display_name: string } | null }) => ({
          userId: row.user_id,
          name: row.profiles?.display_name || UNNAMED_GUEST,
          response: row.response,
          // A browser stub or an old cache lacks the two columns: nobody's, level 1.
          ...broughtFrom(row),
        }),
      )
    : [];
}

/**
 * Whether the plan's series is a group the signed-in person is in (`series_is_group`). Never throws: any failure reads
 * as a one-off, the function missing after plan 2's rollback (PostgREST `PGRST202`) included, since the one-off rules
 * show less, never more (I4).
 */
async function readIsGroup(series: unknown): Promise<boolean> {
  if (typeof series !== "string" || !series) return false;
  try {
    const reply = await withDeadline((signal) =>
      supabase.rpc("series_is_group", { p_series: series }).abortSignal(signal),
    );
    return !reply.error && reply.data === true;
  } catch {
    return false;
  }
}

/**
 * The event page's read. Any failed read, the guest list, the organizer's name and the counts included, makes the
 * whole event unavailable, with one exception: the group flag (`readIsGroup`), whose failure reads as a one-off and
 * keeps the page (I4). After the plan row, an invitee's own row, the organizer's name and the group flag are read
 * together, and the owner's flag alone. An invitee who hasn't answered (and isn't an admin, who sees every row) also
 * gets the counts (`plan_people_counts`, CR-P4), except in a group, where they read every guest row.
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
  const group = readIsGroup(plan.data.series_id);
  let isGroup: boolean;
  if (plan.data.owner_id !== userId) {
    const [own, host, inGroup] = await Promise.all([
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
      group,
    ]);
    if (own.error || host.error) throw new Error(eventUnavailable);
    attendee = own.data;
    organizer = host.data?.display_name ?? null;
    isGroup = inGroup;
  } else isGroup = await group;
  const mapped = planFromRow(plan.data);
  let counts: AnswerCounts | null = null;
  if (!isGroup && attendee?.response === "pending" && !mapped.admins.includes(userId)) {
    const reply = await withDeadline((signal) =>
      supabase.rpc("plan_people_counts", { p_plan: planId }).abortSignal(signal),
    );
    if (reply.error) throw new Error(eventUnavailable);
    try {
      counts = answerCountsFrom(reply.data);
    } catch {
      throw new Error(eventUnavailable);
    }
  }
  return { plan: mapped, attendee, organizer, guests, admins: mapped.admins, counts, isGroup };
}
