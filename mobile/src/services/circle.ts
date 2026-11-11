import { errorField, offline, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { CIRCLE_COPY } from "../domain/circleCopy";
import { INVITE_COPY } from "../domain/inviteCopy";
import type { Circle, CircleSaveEvent } from "../domain/circle";

/**
 * What the signed-in guest may bring to a resbite (`my_bring_allowance`): the invites the circle gives each guest, those
 * used (their brought guests still in and their unanswered links), those left, their own level, and whether they may
 * bring at all (Going or Maybe, on an open resbite, within the circle's levels; the count is not part of it).
 */
export type Allowance = { allowed: number; used: number; remaining: number; level: number; mayBring: boolean };

/**
 * A link a guest sent bringing someone, as a host sees it (`plan_brought_invitations`): its id (Remove takes it back
 * by it), the number's last two digits and country, never the number; and the bringer's first name, null when there is
 * none to show.
 */
export type BroughtLink = { id: string; ending: string; country: string; broughtByName: string | null };

export type CircleGateway = {
  /** The host sets the resbite's circle (`set_plan_circle`); the plan's new version. */
  set(planId: string, invites: number, levels: number): Promise<number>;
  /** The caller's allowance on this resbite. A host gets nothing to bring; someone not on it, 42501 'Not invited'. */
  allowance(planId: string): Promise<Allowance>;
  /**
   * The bringers' first names by account id (`plan_bringers`), for the chain on the people list (CO-07); an account
   * being deleted is left out, and so is a blank name. Someone who may not see names: 42501 'Names required'.
   */
  bringers(planId: string): Promise<Record<string, string>>;
  /** The links the guests sent bringing someone, for a host (`plan_brought_invitations`); anyone else: 42501. */
  broughtLinks(planId: string): Promise<BroughtLink[]>;
  /** A host takes back a guest's link by its id (`revoke_brought_invitation`). Refusals are worded (C14). */
  revokeBrought(planId: string, invitationId: string): Promise<void>;
  /** A bringer takes back an in-app invitation they sent (`withdraw_brought_invitation`). Refusals are worded (C14). */
  withdraw(planId: string, userId: string): Promise<void>;
};

const count = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);

/** `my_bring_allowance`'s reply; anything else can't be read and is the connection line. */
function allowanceFrom(reply: unknown): Allowance {
  const row = typeof reply === "object" && reply !== null && !Array.isArray(reply) ? (reply as Record<string, unknown>) : {};
  const [allowed, used, remaining] = [count(row.allowed), count(row.used), count(row.remaining)];
  // bring_allowance gives someone without a guest row a null level; nothing here depends on it.
  const level = row.level === null ? 0 : count(row.level);
  if (allowed === null || used === null || remaining === null || level === null || typeof row.may_bring !== "boolean")
    throw Error(offline);
  return { allowed, used, remaining, level, mayBring: row.may_bring };
}

/** `plan_bringers`' reply: the names by id, blank ones left out; anything but an object is the connection line. */
function bringersFrom(reply: unknown): Record<string, string> {
  if (typeof reply !== "object" || reply === null || Array.isArray(reply)) throw Error(offline);
  const names: Record<string, string> = {};
  for (const [id, name] of Object.entries(reply)) if (typeof name === "string" && name.trim()) names[id] = name.trim();
  return names;
}

/** `plan_brought_invitations`' reply, field by field (no number can come through); one row it can't read fails it. */
function broughtLinksFrom(reply: unknown): BroughtLink[] {
  if (!Array.isArray(reply)) throw Error(offline);
  return reply.map((item: unknown) => {
    const row = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    if (typeof row.id !== "string" || typeof row.ending !== "string" || typeof row.country !== "string") throw Error(offline);
    // The server leaves the name out when there is none to show (C14).
    const name = typeof row.brought_by_name === "string" ? row.brought_by_name.trim() : "";
    return { id: row.id, ending: row.ending, country: row.country, broughtByName: name || null };
  });
}

const TAKE_BACK_REFUSED = "TakeBackRefused";
/** A take-back the server refused, in words, told apart by its name (as `isNotAConnection` does). */
const refusal = (): Error => Object.assign(Error(CIRCLE_COPY.cantTakeBack), { name: TAKE_BACK_REFUSED });
/** The server refused a take-back (it answered); a lost connection is not one. */
export const isTakeBackRefusal = (e: unknown): boolean => e instanceof Error && e.name === TAKE_BACK_REFUSED;

/**
 * Taking back an invitation, refused (C14): 42501 (ended, or someone only a host may take off) or 22023 'Invitation
 * answered' (C29) says so; anything else is the connection line.
 */
function takeBackError(e: unknown): Error {
  const code = errorField(e, "code");
  if (code === "42501" || (code === "22023" && errorField(e, "message") === "Invitation answered")) return refusal();
  return Error(INVITE_COPY.offline);
}

/**
 * A bringer's Remove on their own link goes through `contactInviteGateway.revoke`, which words a 42501 for hosts
 * ("Only a host can invite people…"). For a bringer it means the link was answered, or the resbite ended: this says so.
 */
export function bringerRevokeError(e: unknown): Error {
  if (!(e instanceof Error)) return Error(INVITE_COPY.offline);
  return e.message === INVITE_COPY.hostsOnly || e.message === "Invitation answered" ? refusal() : e;
}

/**
 * Runs a take-back. When the server refuses it, the list is read again before the refusal is told, so the row shows
 * what holds now: taken back after all, or answered (C28). A lost connection reads nothing again: the read would
 * likely fail too, and the event page would go.
 */
export async function takingBack(task: () => Promise<void>, reload: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (e) {
    if (isTakeBackRefusal(e)) await reload().catch(() => {});
    throw e;
  }
}

/** The circle of trust: a refusal is thrown as the server sent it, as `connectionGateway` does. */
export function createCircleGateway(rpc: Rpc, deadline: Deadline = passThrough): CircleGateway {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await deadline((signal) => rpc(fn, args, signal));
    if (error) throw error;
    return data;
  }
  /** A call whose refusal is told in words (C14), a lost connection included. */
  async function takeBack(fn: string, args: Record<string, unknown>): Promise<void> {
    try {
      await call(fn, args);
    } catch (e) {
      throw takeBackError(e);
    }
  }
  return {
    async set(planId, invites, levels) {
      const version = await call("set_plan_circle", { p_plan: planId, p_invites: invites, p_levels: levels });
      // A reply without the new version can't confirm the save.
      if (typeof version !== "number") throw Error(offline);
      return version;
    },
    async allowance(planId) {
      return allowanceFrom(await call("my_bring_allowance", { p_plan: planId }));
    },
    async bringers(planId) {
      return bringersFrom(await call("plan_bringers", { p_plan: planId }));
    },
    async broughtLinks(planId) {
      return broughtLinksFrom(await call("plan_brought_invitations", { p_plan: planId }));
    },
    async revokeBrought(planId, invitationId) {
      await takeBack("revoke_brought_invitation", { p_plan: planId, p_invitation: invitationId });
    },
    async withdraw(planId, userId) {
      await takeBack("withdraw_brought_invitation", { p_plan: planId, p_user: userId });
    },
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const circleGateway = createCircleGateway(
  async (fn, args, signal) => (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);

/**
 * Why the circle wasn't saved, in words, and whether the screen reads the plan again. 42501: the resbite ended or
 * this person is no longer a host, so the reload shows the screen's gate. 22023: numbers the server refused; nothing
 * changed. Anything else, a lost connection or a lost answer included, is the connection line, and the reload shows
 * what the server holds, since the save may have landed (C17).
 */
export function circleErrorMessage(e: unknown): { message: string; reload: boolean } {
  const code = errorField(e, "code");
  if (code === "42501") return { message: CIRCLE_COPY.saveFailed, reload: true };
  if (code === "22023") return { message: CIRCLE_COPY.saveFailed, reload: false };
  return { message: INVITE_COPY.offline, reload: true };
}

/**
 * Saves the circle a host tapped and says what the card does next: the `circleSave` event (a saved one carries the
 * version `set_plan_circle` returned), and on a failure the line under the card and whether the screen reloads.
 */
export async function saveCircle(
  gateway: Pick<CircleGateway, "set">,
  planId: string,
  value: Circle,
): Promise<{ event: CircleSaveEvent; error: { message: string; reload: boolean } | null }> {
  try {
    const version = await gateway.set(planId, value.invites, value.levels);
    return { event: { type: "saved", value, version }, error: null };
  } catch (e) {
    return { event: { type: "failed" }, error: circleErrorMessage(e) };
  }
}
