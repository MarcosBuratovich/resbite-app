import { errorField, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { CONNECTIONS_COPY } from "../domain/connectionsCopy";
import { INVITE_COPY } from "../domain/inviteCopy";

export type ConnectionState = "none" | "requested_by_me" | "requested_by_them" | "connected";

export type ConnectionPerson = {
  userId: string;
  name: string;
  avatarPath: string | null;
  avatarRevision: number;
  seriesId: string | null;
  title: string | null;
  /** On a request only: how the two stand on its resbite (as its push says). */
  context?: RequestContext;
};

/** Going or invited on a resbite still to end; at it, or invited to it, once it has ended. */
export type RequestContext = "going" | "invited" | "met" | "were_invited";
const CONTEXTS: readonly string[] = ["going", "invited", "met", "were_invited"];

export type MyConnections = { requests: ConnectionPerson[]; connected: ConnectionPerson[] };

export type ConnectionGateway = {
  request(userId: string, planId: string): Promise<"requested" | "connected">;
  accept(userId: string): Promise<void>;
  decline(userId: string): Promise<void>;
  cancel(userId: string): Promise<void>;
  remove(userId: string): Promise<void>;
  mine(): Promise<MyConnections>;
  statesFor(planId: string): Promise<Record<string, ConnectionState>>;
};

type Row = {
  user_id: string;
  name: string;
  avatar_path: string | null;
  avatar_revision: number;
  series_id: string | null;
  title: string | null;
  context?: string;
};

function person(row: Row): ConnectionPerson {
  const p: ConnectionPerson = {
    userId: row.user_id,
    name: row.name,
    avatarPath: row.avatar_path,
    avatarRevision: row.avatar_revision,
    seriesId: row.series_id,
    title: row.title,
  };
  // A context this app doesn't know yet reads as met there.
  if (row.context) p.context = CONTEXTS.includes(row.context) ? (row.context as RequestContext) : "met";
  return p;
}

/** Connections: a refusal is thrown as the server sent it, as `adminGateway` does. */
export function createConnectionGateway(rpc: Rpc, deadline: Deadline = passThrough): ConnectionGateway {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await deadline((signal) => rpc(fn, args, signal));
    if (error) throw error;
    return data;
  }
  return {
    request: async (userId, planId) =>
      (await call("request_connection", { p_user: userId, p_plan: planId })) as "requested" | "connected",
    accept: async (userId) => void (await call("accept_connection", { p_user: userId })),
    decline: async (userId) => void (await call("decline_connection", { p_user: userId })),
    cancel: async (userId) => void (await call("cancel_connection_request", { p_user: userId })),
    remove: async (userId) => void (await call("remove_connection", { p_user: userId })),
    mine: async () => {
      const data = ((await call("my_connections", {})) ?? {}) as { requests?: Row[]; connected?: Row[] };
      return { requests: (data.requests ?? []).map(person), connected: (data.connected ?? []).map(person) };
    },
    statesFor: async (planId) =>
      ((await call("plan_connection_states", { p_plan: planId })) ?? {}) as Record<string, ConnectionState>,
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const connectionGateway = createConnectionGateway(
  async (fn, args, signal) => (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);

/** Why a connection call was refused, in words; anything else, a lost connection included, keeps the connection line. */
export function connectionErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  const message = errorField(e, "message");
  if (code === "42501" && message === "Names required") return CONNECTIONS_COPY.namesFirst;
  if (code === "42501" && message === "Not on this resbite") return CONNECTIONS_COPY.notHere;
  if (code === "42501" && message === "Not a connection") return CONNECTIONS_COPY.failed;
  if (code === "22023") return CONNECTIONS_COPY.failed;
  return INVITE_COPY.offline;
}
