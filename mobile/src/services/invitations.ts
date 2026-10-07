import { buildInvitationLink } from "../domain/appLinks";
import { supabase } from "./supabase";
import { withDeadline } from "./plans";
import type { InvitationGateway } from "../domain/invitations";
export const invitationGateway: InvitationGateway = {
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
