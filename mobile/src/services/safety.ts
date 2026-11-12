import { errorField, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { INVITE_COPY } from "../domain/inviteCopy";
import { SAFETY_COPY, type ReportReason } from "../domain/safetyCopy";

/** Someone the reader blocked, as `my_blocks` lists them; `name` is null for an account that can't be named (G-S10). */
export type BlockedPerson = { userId: string; name: string | null };

export type SafetyGateway = {
  /** Blocks a person (`block_user`); the "blocks changed" event follows once the server answers. */
  block(userId: string): Promise<void>;
  /** Unblocks a person on the reader's own list, whatever they still share (I2); the event follows too. */
  unblock(userId: string): Promise<void>;
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
const listeners = new Set<() => void>();

/** Hears every block and unblock that went through, from any screen; the function it returns stops listening. */
export function onBlocksChanged(listener: () => void): () => void {
  const own = () => listener();
  listeners.add(own);
  return () => void listeners.delete(own);
}

function blocksChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One listener's failure is its own: the block went through, and the others still hear it.
    }
  }
}

/** The optional line: what was typed, trimmed, or null when nothing was. */
const detailsOf = (details?: string | null): string | null =>
  typeof details === "string" && details.trim() !== "" ? details.trim() : null;

function blockedPeople(data: unknown): BlockedPerson[] {
  const out: BlockedPerson[] = [];
  for (const row of Array.isArray(data) ? data : []) {
    if (typeof row !== "object" || row === null) continue;
    const { user_id: userId, name } = row as Record<string, unknown>;
    if (typeof userId === "string" && userId !== "") out.push({ userId, name: typeof name === "string" ? name : null });
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
  async function setBlock(userId: string, block: boolean): Promise<void> {
    await call("block_user", { p_user: userId, p_block: block });
    blocksChanged();
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
