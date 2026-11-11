import { CONNECTIONS_COPY } from "../domain/connectionsCopy";
import { INVITE_COPY } from "../domain/inviteCopy";
export type InviteKind = "app" | "link" | "self" | "already";
/** A phone number to invite: its digits, calling code and the personal code its link carries. */
export type PhoneItem = { phone: string; country: string; code: string };
/** A Resbite connection to invite in the app, by user id (CO-P4). */
export type UserItem = { user: string };
export type InviteItem = PhoneItem | UserItem;
export type PhoneResult = { phone: string; kind: InviteKind };
export type UserResult = { user: string; kind: InviteKind };
export type InviteResult = PhoneResult | UserResult;
export type PhoneInvitation = {
  phone: string;
  country: string;
  answered: boolean;
  response: string | null;
};
export type ContactInviteGateway = {
  /** Which of these numbers (digits) belong to people already on Resbite. */
  onResbite(phones: string[]): Promise<Set<string>>;
  /** Each result in its item's order and shape: `{phone, kind}` for a number, `{user, kind}` for a connection. */
  invite(plan: string, items: InviteItem[]): Promise<InviteResult[]>;
  list(plan: string): Promise<PhoneInvitation[]>;
  revoke(plan: string, phone: string): Promise<void>;
};

export const offline = "Check your connection and try again.";
export const errorField = (e: unknown, field: "code" | "message") =>
  typeof e === "object" && e !== null && field in e
    ? String((e as Record<string, unknown>)[field])
    : "";

export function inviteErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  if (code === "42501") return INVITE_COPY.hostsOnly;
  if (code === "22023") return errorField(e, "message") || offline;
  return offline;
}

/**
 * A `{user}` item the server refused (42501 'Not a connection'): someone not, or no longer, connected, or who may no
 * longer use the app. The server refuses the whole call for it, so `inviteConnections` sends such a call again one
 * by one, unless it held only that one. Told by its name, as a class's `instanceof` may not survive the transform to
 * older JavaScript.
 */
const NOT_A_CONNECTION = "NotAConnection";
export const isNotAConnection = (e: unknown): boolean => e instanceof Error && e.name === NOT_A_CONNECTION;
function failure(e: unknown): Error {
  if (errorField(e, "code") === "42501" && errorField(e, "message") === "Not a connection") {
    const refused = Error(CONNECTIONS_COPY.failed);
    refused.name = NOT_A_CONNECTION;
    return refused;
  }
  return Error(inviteErrorMessage(e));
}

const kinds: readonly string[] = ["app", "link", "self", "already"];
const BATCH = 50;
/** A reply that answers its item: the same shape (a phone for a number, a user for a connection) and a known kind. */
const answers = (item: InviteItem, d: unknown): boolean => {
  if (!d || typeof d !== "object") return false;
  const r = d as Record<string, unknown>;
  return typeof ("user" in item ? r.user : r.phone) === "string" && kinds.includes(r.kind as string);
};

export type Rpc = (
  fn: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => PromiseLike<{ data: unknown; error: unknown }>;

export type Deadline = <T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
) => Promise<T>;
// plans.ts loads the Supabase client, so both load on first use; this keeps the module testable under node.
export const planDeadline: Deadline = async (request) =>
  (await import("./plans")).withDeadline(request);
export const passThrough: Deadline = async (request) =>
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
      throw failure(error);
    }
    if (reply.error) throw failure(reply.error);
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
    // The server takes at most 50 a call (numbers and connections together), as the lookup does; the results come
    // back in the items' order, each in its item's shape.
    async invite(plan, items) {
      const out: InviteResult[] = [];
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);
        const data = await call("invite_contacts", {
          p_plan: plan,
          p_invites: batch,
        });
        if (
          !Array.isArray(data) ||
          data.length !== batch.length ||
          !data.every((d, j) => answers(batch[j], d))
        )
          throw Error(offline);
        for (const [j, d] of data.entries())
          out.push(
            "user" in batch[j]
              ? { user: d.user as string, kind: d.kind as InviteKind }
              : { phone: d.phone as string, kind: d.kind as InviteKind },
          );
      }
      return out;
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

/**
 * Invites connections by user id (CO-P4), in calls of their own: Invite people sends them after the numbers, so a
 * refusal here never loses the numbers' invitations. A call refused for one of its connections (42501 'Not a
 * connection': `my_connections` may still list someone who can no longer be invited) is sent again one by one, so
 * the others are still invited; those refused alone are left out of the results and listed in `refused`. A refused
 * call that held one connection is not sent again: that one is refused. Any other failure throws, as `invite` does.
 */
export async function inviteConnections(
  gateway: Pick<ContactInviteGateway, "invite">,
  plan: string,
  users: string[],
): Promise<{ results: UserResult[]; refused: string[] }> {
  const results: UserResult[] = [];
  const refused: string[] = [];
  const keep = (found: InviteResult[]) => {
    for (const r of found) if ("user" in r) results.push(r);
  };
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    try {
      keep(await gateway.invite(plan, batch.map((user) => ({ user }))));
    } catch (e) {
      if (!isNotAConnection(e)) throw e;
      if (batch.length === 1) {
        refused.push(batch[0]);
        continue;
      }
      for (const user of batch) {
        try {
          keep(await gateway.invite(plan, [{ user }]));
        } catch (one) {
          if (!isNotAConnection(one)) throw one;
          refused.push(user);
        }
      }
    }
  }
  return { results, refused };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const contactInviteGateway = createContactInviteGateway(
  async (fn, args, signal) =>
    (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);
