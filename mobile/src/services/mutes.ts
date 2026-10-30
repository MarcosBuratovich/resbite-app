import { errorField, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { EVENT_COPY } from "../domain/eventPage";

type Reply = { data: unknown; error: unknown };
/** The viewer's own `plan_mutes` rows (row-level security keeps it to them): the `series_id` of each. */
export type SelectMutedSeries = (signal: AbortSignal) => PromiseLike<Reply>;

export type MuteGateway = {
  /** Mutes or unmutes a resbite's series for the signed-in person; the server's answer is the state now. */
  setMute(planId: string, muted: boolean): Promise<boolean>;
  mutedSeries(): Promise<Set<string>>;
};

/** Plan 3: a mute belongs to the series, on the server, so it follows the person to every phone. */
export function createMuteGateway(
  rpc: Rpc,
  select: SelectMutedSeries,
  deadline: Deadline = passThrough,
): MuteGateway {
  return {
    async setMute(planId, muted) {
      const { data, error } = await deadline((signal) =>
        rpc("set_plan_mute", { p_plan: planId, p_muted: muted }, signal),
      );
      if (error) throw error;
      return data === true;
    },
    async mutedSeries() {
      const { data, error } = await deadline(select);
      if (error) throw error;
      const rows: unknown = data;
      const ids = new Set<string>();
      if (Array.isArray(rows))
        for (const row of rows) if (typeof row?.series_id === "string") ids.add(row.series_id);
      return ids;
    },
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const muteGateway = createMuteGateway(
  async (fn, args, signal) => (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  async (signal) => (await import("./supabase")).supabase.from("plan_mutes").select("series_id").abortSignal(signal),
  planDeadline,
);

export const setPlanMute = (planId: string, muted: boolean): Promise<boolean> => muteGateway.setMute(planId, muted);
export const readMutedSeries = (): Promise<Set<string>> => muteGateway.mutedSeries();

/**
 * Why set_plan_mute was refused, in words: 42501 is someone who is neither a host nor on the guest list. Anything else,
 * a lost connection included, keeps the connection line.
 */
export function muteErrorMessage(e: unknown): string {
  return errorField(e, "code") === "42501" ? EVENT_COPY.muteNotInvited : EVENT_COPY.muteFailed;
}
