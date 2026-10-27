import {
  errorField,
  offline,
  passThrough,
  planDeadline,
  type Deadline,
  type Rpc,
} from "./contactInvites";

export type JoinState = "owner" | "already" | "waiting" | "declined";
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
  ): Promise<{ state: JoinState; plan_id: string; response: string }>;
  mine(): Promise<MyRequest[]>;
  /** Changes the answer of a request still waiting; returns the stored response. */
  change(plan: string, response: string): Promise<string>;
  forPlan(plan: string): Promise<HostRequest[]>;
  decide(
    plan: string,
    user: string,
    approve: boolean,
  ): Promise<"approved" | "declined">;
};

export function joinErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  const message = errorField(e, "message");
  if (code === "42501") return "This link isn’t open to you right now.";
  if (message === "Request already decided")
    return "Someone already answered this request.";
  if (code === "22023") return message || offline;
  return offline;
}

const states: readonly string[] = ["owner", "already", "waiting", "declined"];
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : null);

export function createJoinRequestGateway(
  rpc: Rpc,
  deadline: Deadline = passThrough,
): JoinRequestGateway {
  async function call(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    let reply: { data: unknown; error: unknown };
    try {
      reply = await deadline((signal) => rpc(fn, args, signal));
    } catch (error) {
      throw Error(joinErrorMessage(error));
    }
    if (reply.error) throw Error(joinErrorMessage(reply.error));
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
        typeof d.plan_id !== "string" ||
        typeof d.response !== "string"
      )
        throw Error(offline);
      return {
        state: d.state as JoinState,
        plan_id: d.plan_id,
        response: d.response,
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
      const d = await call("change_join_answer", {
        p_plan: plan,
        p_response: response,
      });
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
      const d = await call("decide_join_request", {
        p_plan: plan,
        p_user: user,
        p_approve: approve,
      });
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
