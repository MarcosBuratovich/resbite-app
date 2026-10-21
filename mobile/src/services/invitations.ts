import { supabase } from "./supabase";
import { withDeadline } from "./plans";
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

export const invitationGateway: EventLinkGateway = {
  link: (planId) => linkCode("link", planId),
  rotate: (planId) => linkCode("rotate", planId),
  async removeGuest(planId, userId) {
    await linkCall("remove", (signal) =>
      supabase.rpc("remove_guest", { p_plan: planId, p_user: userId }).abortSignal(signal),
    );
  },
};
