import { buildInvitationLink } from "../domain/appLinks";
import { supabase } from "./supabase";
import { withDeadline } from "./plans";
import type { InvitationGateway } from "../domain/invitations";
import { isLinkCode } from "../domain/appLinks";
import { linkErrorMessage, type LinkAction } from "../domain/eventLinks";

/** GI1: the organizer's calls for the event's one link and its guest list. */
export type EventLinkGateway = {
  /** The event's active link code, made by the database on the first call. Never stored on the device. */
  link: (planId: string) => Promise<string>;
  /** Turns the active link off and returns the new code. */
  rotate: (planId: string) => Promise<string>;
  /** Removes a guest from the event; a stranger is a no-op. */
  removeGuest: (planId: string, userId: string) => Promise<void>;
};

async function linkCall<T>(action: LinkAction, request: (signal: AbortSignal) => PromiseLike<{ data: T; error: unknown }>) {
  let reply: { data: T; error: unknown };
  try {
    reply = await withDeadline(request);
  } catch (error) {
    throw Error(linkErrorMessage(action, error));
  }
  if (reply.error) throw Error(linkErrorMessage(action, reply.error));
  return reply.data;
}
async function linkCode(action: "link" | "rotate", planId: string) {
  const fn = action === "link" ? "plan_link" : "rotate_plan_link";
  const code: unknown = await linkCall(action, (signal) => supabase.rpc(fn, { p_plan: planId }).abortSignal(signal));
  if (!isLinkCode(code)) throw Error(linkErrorMessage(action, null));
  return code;
}

export const invitationGateway: InvitationGateway & EventLinkGateway = {
  link: (planId) => linkCode("link", planId),
  rotate: (planId) => linkCode("rotate", planId),
  async removeGuest(planId, userId) {
    await linkCall("remove", (signal) =>
      supabase.rpc("remove_guest", { p_plan: planId, p_user: userId }).abortSignal(signal),
    );
  },
  async create(slot) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("create_invite", {
          p_id: slot.id,
          p_plan: slot.planId,
          p_token: slot.token,
          // Contact details stay local. The existing server contract uses first claim.
        })
        .abortSignal(signal),
    );
    if (error)
      throw Error(
        error.code === "42501"
          ? "Private tester access is closed or this plan is unavailable to your account."
          : error.code === "22023"
            ? "This link or plan is no longer available. Return to My resbites and refresh; do not share this link."
            : "Couldn’t confirm this link. Retry uses the same invitation; it will not make a duplicate.",
      );
  },
  async revoke(id) {
    const { error } = await withDeadline((signal) =>
      supabase.rpc("revoke_invite", { p_id: id }).abortSignal(signal),
    );
    if (error)
      throw Error(
        "Couldn’t confirm revocation. Sharing remains disabled here. Retry when connected; a previously shared link may still work until the server confirms.",
      );
  },
};

export function invitationLink(token: string) {
  return buildInvitationLink(token, process.env.EXPO_PUBLIC_INVITATION_ORIGIN);
}
