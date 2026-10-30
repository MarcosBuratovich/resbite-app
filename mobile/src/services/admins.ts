import { errorField, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { EVENT_COPY } from "../domain/eventPage";

export type AdminGateway = {
  appoint(planId: string, userId: string): Promise<void>;
  remove(planId: string, userId: string): Promise<void>;
};

/** Plan 3: the host makes a guest an admin, or takes it back. A refusal is thrown as the server sent it, as `writeRsvp` does. */
export function createAdminGateway(rpc: Rpc, deadline: Deadline = passThrough): AdminGateway {
  async function call(fn: string, planId: string, userId: string) {
    const { error } = await deadline((signal) => rpc(fn, { p_plan: planId, p_user: userId }, signal));
    if (error) throw error;
  }
  return {
    appoint: (planId, userId) => call("appoint_admin", planId, userId),
    remove: (planId, userId) => call("remove_admin", planId, userId),
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const adminGateway = createAdminGateway(
  async (fn, args, signal) => (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);

export const appointAdmin = (planId: string, userId: string): Promise<void> => adminGateway.appoint(planId, userId);
export const removeAdmin = (planId: string, userId: string): Promise<void> => adminGateway.remove(planId, userId);

/**
 * Why appoint_admin or remove_admin was refused, in words: 42501 is "not the owner" (or the resbite is no longer open
 * to changes); appoint_admin's two 22023s name a guest who isn't going or doesn't use the app. Anything else, a lost
 * connection included, keeps the connection line.
 */
export function adminErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  if (code === "42501") return EVENT_COPY.adminsOwnerOnly;
  if (code === "22023") {
    const message = errorField(e, "message");
    if (message === "Only a guest who uses the app can be an admin") return EVENT_COPY.adminNeedsApp;
    if (message === "Only a guest who is going can be an admin") return EVENT_COPY.adminNotGoing;
  }
  return EVENT_COPY.adminsFailed;
}
