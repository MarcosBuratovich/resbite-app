import {
  errorField,
  offline,
  passThrough,
  planDeadline,
  type Deadline,
  type Rpc,
} from "./contactInvites";
import { INVITE_COPY } from "../domain/inviteCopy";

export type JoinState = "owner" | "already" | "waiting" | "declined";
/** request_to_join's reply. The owner has no answer of their own (the server sends null); anyone else's is stored. */
export type JoinResult =
  | { state: "owner"; plan_id: string; response: string | null }
  | { state: Exclude<JoinState, "owner">; plan_id: string; response: string };
export type MyRequest = {
  plan_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  host: string;
  area: string;
  image: { kind: string; ref: string | null };
  response: string;
  status: "waiting" | "declined";
};
export type HostRequest = {
  user_id: string;
  name: string;
  response: string;
  ending: string | null;
  created_at: string;
};
export type JoinRequestGateway = {
  request(
    code: string,
    response: string,
    name?: string,
    termsVersion?: string,
  ): Promise<JoinResult>;
  mine(): Promise<MyRequest[]>;
  /**
   * Changes the answer of a request still waiting; returns the stored response. Throws RequestDecided once the host
   * has answered the request.
   */
  change(plan: string, response: string): Promise<string>;
  forPlan(plan: string): Promise<HostRequest[]>;
  decide(
    plan: string,
    user: string,
    approve: boolean,
  ): Promise<"approved" | "declined">;
};

/** request_to_join's 22023 for an account with no 18+ tick stored yet: joinErrorMessage passes it on for joinStep. */
export const AGE_REQUIRED = "Age confirmation required";
/** change_join_answer's and decide_join_request's 22023 once the host has answered the request. */
const DECIDED = "Request already decided";

/**
 * A refusal on the guest's side, in words: a link that isn't open to them (42501), or the 18+ tick still to give,
 * passed on as it is for joinStep. Anything else, a 22023 the app has no words for included, is the connection line,
 * never the server's own words.
 */
export function joinErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  if (code === "42501") return "This link isn’t open to you right now.";
  if (code === "22023" && errorField(e, "message") === AGE_REQUIRED) return AGE_REQUIRED;
  return offline;
}

/**
 * Why the host's Approve or Decline was refused, by the server's message (the first two share the code 42501): the
 * event started or was cancelled; the person can't be added (a ban, a disabled roster row, an account that is banned
 * or being deleted); or someone already answered the request. Anything else is the connection line.
 */
export function decideErrorMessage(e: unknown): string {
  const message = errorField(e, "message");
  if (message === "Active plan owner required") return INVITE_COPY.decideClosed;
  if (message === "Invitation unavailable") return INVITE_COPY.decideCannotAdd;
  if (message === DECIDED) return INVITE_COPY.decideAnswered;
  return offline;
}

/**
 * change() refused because the host answered the request meanwhile. Not an error to show: the waiting screen reads
 * the request again, so an approved one opens the event and a declined one says so. Shown anyway, it is the
 * connection line.
 */
export class RequestDecided extends Error {
  constructor() {
    super(offline);
    this.name = "RequestDecided";
  }
}

const states: readonly string[] = ["owner", "already", "waiting", "declined"];
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : null);

export function createJoinRequestGateway(
  rpc: Rpc,
  deadline: Deadline = passThrough,
): JoinRequestGateway {
  /** One RPC; a failure, returned or thrown, becomes the error `fail` makes of it (the guest's words by default). */
  async function call(
    fn: string,
    args: Record<string, unknown>,
    fail: (e: unknown) => Error = (e) => Error(joinErrorMessage(e)),
  ): Promise<unknown> {
    let reply: { data: unknown; error: unknown };
    try {
      reply = await deadline((signal) => rpc(fn, args, signal));
    } catch (error) {
      throw fail(error);
    }
    if (reply.error) throw fail(reply.error);
    return reply.data;
  }
  return {
    async request(code, response, name, termsVersion) {
      const d = await call("request_to_join", {
        p_code: code,
        p_name: name ?? null,
        p_response: response,
        p_terms_version: termsVersion ?? null,
      });
      if (
        !isObject(d) ||
        typeof d.state !== "string" ||
        !states.includes(d.state) ||
        typeof d.plan_id !== "string"
      )
        throw Error(offline);
      const stored = d.response;
      // The owner has no answer of their own (request_join sends null); anyone else's is the stored one.
      if (d.state === "owner") {
        if (stored !== null && typeof stored !== "string") throw Error(offline);
        return { state: "owner", plan_id: d.plan_id, response: stored };
      }
      if (typeof stored !== "string") throw Error(offline);
      return {
        state: d.state as Exclude<JoinState, "owner">,
        plan_id: d.plan_id,
        response: stored,
      };
    },
    async mine() {
      const data = await call("my_join_requests", {});
      if (!Array.isArray(data)) throw Error(offline);
      return data.map((d): MyRequest => {
        const image = isObject(d?.image) ? d.image : {};
        if (
          !isObject(d) ||
          typeof d.plan_id !== "string" ||
          (d.status !== "waiting" && d.status !== "declined")
        )
          throw Error(offline);
        return {
          plan_id: d.plan_id,
          title: String(d.title ?? ""),
          starts_at: String(d.starts_at ?? ""),
          ends_at: text(d.ends_at),
          time_zone: String(d.time_zone ?? ""),
          host: String(d.host ?? ""),
          area: String(d.area ?? ""),
          image: { kind: String(image.kind ?? ""), ref: text(image.ref) },
          response: String(d.response ?? ""),
          status: d.status,
        };
      });
    },
    async change(plan, response) {
      const d = await call(
        "change_join_answer",
        { p_plan: plan, p_response: response },
        (e) =>
          errorField(e, "message") === DECIDED
            ? new RequestDecided()
            : Error(joinErrorMessage(e)),
      );
      if (!isObject(d) || typeof d.response !== "string") throw Error(offline);
      return d.response;
    },
    async forPlan(plan) {
      const data = await call("plan_join_requests", { p_plan: plan });
      if (!Array.isArray(data)) throw Error(offline);
      return data.map((d): HostRequest => {
        if (!isObject(d) || typeof d.user_id !== "string") throw Error(offline);
        return {
          user_id: d.user_id,
          name: String(d.name ?? ""),
          response: String(d.response ?? ""),
          ending: text(d.ending),
          created_at: String(d.created_at ?? ""),
        };
      });
    },
    async decide(plan, user, approve) {
      const d = await call(
        "decide_join_request",
        { p_plan: plan, p_user: user, p_approve: approve },
        (e) => Error(decideErrorMessage(e)),
      );
      if (!isObject(d) || (d.status !== "approved" && d.status !== "declined"))
        throw Error(offline);
      return d.status;
    },
  };
}

export const joinRequestGateway = createJoinRequestGateway(
  async (fn, args, signal) =>
    (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);
