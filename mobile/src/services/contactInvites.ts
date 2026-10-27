export type InviteKind = "app" | "link" | "self" | "already";
export type PhoneInvitation = {
  phone: string;
  country: string;
  answered: boolean;
  response: string | null;
};
export type ContactInviteGateway = {
  /** Which of these numbers (digits) belong to people already on Resbite. */
  onResbite(phones: string[]): Promise<Set<string>>;
  invite(
    plan: string,
    items: { phone: string; country: string; code: string }[],
  ): Promise<{ phone: string; kind: InviteKind }[]>;
  list(plan: string): Promise<PhoneInvitation[]>;
  revoke(plan: string, phone: string): Promise<void>;
};

const offline = "Check your connection and try again.";
const errorField = (e: unknown, field: "code" | "message") =>
  typeof e === "object" && e !== null && field in e
    ? String((e as Record<string, unknown>)[field])
    : "";

export function inviteErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  if (code === "42501")
    return "Only the organizer can invite people to an upcoming resbite.";
  if (code === "22023") return errorField(e, "message") || offline;
  return offline;
}

const kinds: readonly string[] = ["app", "link", "self", "already"];
const BATCH = 50;

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => PromiseLike<{ data: unknown; error: unknown }>;

type Deadline = <T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
) => Promise<T>;
// plans.ts loads the Supabase client, so both load on first use; this keeps the module testable under node.
const planDeadline: Deadline = async (request) =>
  (await import("./plans")).withDeadline(request);
const passThrough: Deadline = async (request) =>
  request(new AbortController().signal);

export function createContactInviteGateway(
  rpc: Rpc,
  deadline: Deadline = passThrough,
): ContactInviteGateway {
  async function call(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    let reply: { data: unknown; error: unknown };
    try {
      reply = await deadline((signal) => rpc(fn, args, signal));
    } catch (error) {
      throw Error(inviteErrorMessage(error));
    }
    if (reply.error) throw Error(inviteErrorMessage(reply.error));
    return reply.data;
  }
  return {
    async onResbite(phones) {
      const found = new Set<string>();
      for (let i = 0; i < phones.length; i += BATCH) {
        const data = await call("contacts_on_resbite", {
          p_phones: phones.slice(i, i + BATCH),
        });
        if (!Array.isArray(data)) throw Error(offline);
        for (const p of data) if (typeof p === "string") found.add(p);
      }
      return found;
    },
    async invite(plan, items) {
      const data = await call("invite_contacts", {
        p_plan: plan,
        p_invites: items,
      });
      if (
        !Array.isArray(data) ||
        data.length !== items.length ||
        !data.every(
          (d) => d && typeof d.phone === "string" && kinds.includes(d.kind),
        )
      )
        throw Error(offline);
      return data.map((d) => ({
        phone: d.phone as string,
        kind: d.kind as InviteKind,
      }));
    },
    async list(plan) {
      const data = await call("plan_phone_invitations", { p_plan: plan });
      if (!Array.isArray(data)) throw Error(offline);
      return data.map((d) => ({
        phone: String(d.phone),
        country: String(d.country),
        answered: d.answered === true,
        response: typeof d.response === "string" ? d.response : null,
      }));
    },
    async revoke(plan, phone) {
      await call("revoke_phone_invitation", { p_plan: plan, p_phone: phone });
    },
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const contactInviteGateway = createContactInviteGateway(
  async (fn, args, signal) =>
    (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);
