import { errorField, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { hasVisibleText, wellFormedText } from "../domain/chatRules";
import { INVITE_COPY } from "../domain/inviteCopy";
import { SAFETY_COPY, type InvitationEntry, type ReportReason } from "../domain/safetyCopy";
import type { ChatOverview } from "./chat";

/**
 * Someone the reader blocked, as `my_blocks` lists them; `name` is null for an account that can't be named (G-S10).
 * `at` is when the block was made, as the server sent it, and only when the phone can read it (ruling SR7).
 */
export type BlockedPerson = { userId: string; name: string | null; at?: string };

/**
 * What `block_user` answered (server review M7): `stored` is true only when a block row exists afterwards, false when
 * none does (an unblock, or a block of someone no longer readable, which stores nothing); null when the answer said
 * neither.
 */
export type BlockResult = { stored: boolean | null };

export type SafetyGateway = {
  /** Blocks a person (`block_user`); the "blocks changed" event follows once the server answers. */
  block(userId: string): Promise<BlockResult>;
  /** Unblocks a person on the reader's own list, whatever they still share (I2); the event follows too. */
  unblock(userId: string): Promise<BlockResult>;
  /** The people the reader blocked, newest first. */
  myBlocks(): Promise<BlockedPerson[]>;
  reportMessage(id: number, reason: ReportReason, details?: string | null): Promise<void>;
  /** Reports a person met on a series (G-S9); `series` is where they met. */
  reportUser(userId: string, series: string, reason: ReportReason, details?: string | null): Promise<void>;
  /** Agrees to the current chat rules (G-B4(d)). */
  acceptRules(): Promise<void>;
};

// The "blocks changed" event (B3, Decision 17): app-wide, so a block made anywhere (the chat, the people list, Blocked
// people, an invitation, Connections) reaches every mounted chat session, which replaces its list.
/**
 * Whom a block or unblock that went through was about, which way, and what the server says it holds now (fix round 1,
 * ruling SR6 Q2; server review M7).
 */
export type BlockChange = { userId: string; blocked: boolean; stored: boolean | null };
const listeners = new Set<(change: BlockChange) => void>();

/**
 * Hears every block and unblock that went through, from any screen, with whom it was about; the function it returns
 * stops listening.
 */
export function onBlocksChanged(listener: (change: BlockChange) => void): () => void {
  const own = (change: BlockChange) => listener(change);
  listeners.add(own);
  return () => void listeners.delete(own);
}

function blocksChanged(change: BlockChange): void {
  for (const listener of [...listeners]) {
    try {
      listener(change);
    } catch {
      // One listener's failure is its own: the block went through, and the others still hear it.
    }
  }
}

/**
 * The optional line, cleaned as a message is (H41 m2, ruling SR2): well formed (a lone half of an emoji, which a cut field
 * can leave, reads as U+FFFD, and NUL goes), trimmed, and null when nothing in it shows (`hasVisibleText`), so the server
 * never refuses a report for ever over its details.
 */
function detailsOf(details?: string | null): string | null {
  if (typeof details !== "string") return null;
  const text = wellFormedText(details).trim();
  return hasVisibleText(text) ? text : null;
}

/** block_user's `stored`, as a boolean, `{ stored }`, or a one-row list of it; null when it says neither. */
function storedOf(data: unknown): boolean | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row === "boolean") return row;
  if (typeof row === "object" && row !== null && typeof (row as { stored?: unknown }).stored === "boolean")
    return (row as { stored: boolean }).stored;
  return null;
}

/**
 * The server says the change holds (server review M7): a block it stored, or an unblock that left no block. Anything
 * else (a block that stored nothing, or an answer that says neither) is for the next read of `my_blocks` to settle.
 */
export const blockConfirmed = (change: BlockChange): boolean => (change.blocked ? change.stored === true : change.stored === false);

/**
 * Whether a block's confirm says "Blocked" (ruling SR9): not when the server answered that nothing was stored, since the
 * person can't be seen any more, which may be because they blocked the caller; the confirm then closes saying nothing,
 * and what holds is what `my_blocks` says.
 */
export const showsBlockedLine = (result: BlockResult): boolean => result.stored !== false;

/**
 * The blocks a screen knows once a change went through (ruling SR6 Q2, M7): a confirmed one is applied, so a failed
 * re-read never offers Block again for someone just blocked; an unconfirmed one changes nothing until a read says what
 * holds. While they are unknown they stay so (N13). The set given is never changed in place.
 */
export function knownBlocksAfter(known: ReadonlySet<string> | null, change: BlockChange): ReadonlySet<string> | null {
  if (known === null || !blockConfirmed(change)) return known;
  const next = new Set(known);
  if (change.blocked) next.add(change.userId);
  else next.delete(change.userId);
  return next;
}

/**
 * An unanswered invitation's entry once a block went through (ruling SR12): a confirmed block of the announcement's
 * author takes its words off the resbite page's line at once, so a failed re-read of the overview can't keep them, as
 * the Chat row drops its line (I1). Anything else leaves it as it was, the same object.
 */
export function entryAfterBlock(entry: InvitationEntry, change: BlockChange): InvitationEntry {
  if (!change.blocked || !blockConfirmed(change) || entry.announcement?.authorId !== change.userId) return entry;
  return { ...entry, announcement: null };
}

/**
 * My resbites' overview once a block went through (ruling SR12): a confirmed block takes every invitation's announcement
 * by that person off the cards at once, as the overview read again will. Anything else leaves it as it was.
 */
export function overviewAfterBlock(overview: ChatOverview | null, change: BlockChange): ChatOverview | null {
  if (!overview || !change.blocked || !blockConfirmed(change)) return overview;
  const kept = Object.entries(overview.announcements).filter(([, a]) => a.authorId !== change.userId);
  if (kept.length === Object.keys(overview.announcements).length) return overview;
  return { ...overview, announcements: Object.fromEntries(kept) };
}

/**
 * `my_blocks`' list; an answer that isn't one is a failed read, so the blocks stay unknown (N13, ruling SR2). A time
 * that is missing or can't be read is left out, never a failure (SR7).
 */
function blockedPeople(data: unknown): BlockedPerson[] {
  if (!Array.isArray(data)) throw Error("Unexpected blocked people");
  const out: BlockedPerson[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const { user_id: userId, name, at } = row as Record<string, unknown>;
    if (typeof userId !== "string" || userId === "") continue;
    const person: BlockedPerson = { userId, name: typeof name === "string" ? name : null };
    if (typeof at === "string" && Number.isFinite(Date.parse(at))) person.at = at;
    out.push(person);
  }
  return out;
}

/**
 * Report and block: a refusal is thrown as the server sent it, as `createChatGateway` does. Every block and unblock in
 * the app goes through here, so each one that went through tells "blocks changed" once; a refusal or a failure tells
 * nothing.
 */
export function createSafetyGateway(rpc: Rpc, deadline: Deadline = passThrough): SafetyGateway {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await deadline((signal) => rpc(fn, args, signal));
    if (error) throw error;
    return data;
  }
  async function setBlock(userId: string, block: boolean): Promise<BlockResult> {
    const stored = storedOf(await call("block_user", { p_user: userId, p_block: block }));
    blocksChanged({ userId, blocked: block, stored });
    return { stored };
  }
  return {
    block: (userId) => setBlock(userId, true),
    unblock: (userId) => setBlock(userId, false),
    myBlocks: async () => blockedPeople(await call("my_blocks", {})),
    reportMessage: async (id, reason, details) =>
      void (await call("report_message", { p_id: id, p_reason: reason, p_details: detailsOf(details) })),
    reportUser: async (userId, series, reason, details) =>
      void (await call("report_user", { p_user: userId, p_series: series, p_reason: reason, p_details: detailsOf(details) })),
    acceptRules: async () => void (await call("accept_chat_rules", {})),
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const safetyGateway = createSafetyGateway(
  async (fn, args, signal) => (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);

/**
 * Why a report or a block was refused, in words (G-N6, I7); anything else, a lost connection included, keeps the
 * connection line, as `chatErrorMessage` does.
 */
export function safetyErrorMessage(e: unknown): string {
  if (errorField(e, "code") === "22023") {
    const message = errorField(e, "message");
    if (message === "Report unavailable") return SAFETY_COPY.unavailable;
    if (message === "Unblock first") return SAFETY_COPY.unblockFirst;
    if (message === "Report limit") return SAFETY_COPY.reportLimit;
  }
  return INVITE_COPY.offline;
}
