import { errorField, offline, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { CIRCLE_COPY } from "../domain/circleCopy";
import { INVITE_COPY } from "../domain/inviteCopy";
import type { Circle, CircleSaveEvent } from "../domain/circle";

export type CircleGateway = {
  /** The host sets the resbite's circle (`set_plan_circle`); the plan's new version. */
  set(planId: string, invites: number, levels: number): Promise<number>;
};

/** The circle of trust: a refusal is thrown as the server sent it, as `connectionGateway` does. */
export function createCircleGateway(rpc: Rpc, deadline: Deadline = passThrough): CircleGateway {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await deadline((signal) => rpc(fn, args, signal));
    if (error) throw error;
    return data;
  }
  return {
    async set(planId, invites, levels) {
      const version = await call("set_plan_circle", { p_plan: planId, p_invites: invites, p_levels: levels });
      // A reply without the new version can't confirm the save.
      if (typeof version !== "number") throw Error(offline);
      return version;
    },
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const circleGateway = createCircleGateway(
  async (fn, args, signal) => (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);

/**
 * Why the circle wasn't saved, in words. 42501: the resbite ended or this person is no longer a host, so the screen
 * reloads and shows its gate. 22023: numbers the server refused. Anything else, a lost connection included, is the
 * connection line.
 */
export function circleErrorMessage(e: unknown): { message: string; reload: boolean } {
  const code = errorField(e, "code");
  if (code === "42501") return { message: CIRCLE_COPY.saveFailed, reload: true };
  if (code === "22023") return { message: CIRCLE_COPY.saveFailed, reload: false };
  return { message: INVITE_COPY.offline, reload: false };
}

/**
 * Saves the circle a host tapped and says what the card does next: the `circleSave` event, and on a failure the line
 * under the card and whether the screen reloads.
 */
export async function saveCircle(
  gateway: Pick<CircleGateway, "set">,
  planId: string,
  value: Circle,
): Promise<{ event: CircleSaveEvent; error: { message: string; reload: boolean } | null }> {
  try {
    await gateway.set(planId, value.invites, value.levels);
    return { event: { type: "saved", value }, error: null };
  } catch (e) {
    return { event: { type: "failed" }, error: circleErrorMessage(e) };
  }
}
