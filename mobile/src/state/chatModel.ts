import { serverTime, type ChatMessage, type ChatSummary } from "../services/chat";
import type { QueuedMessage } from "../services/chatQueue";
import { planEnd } from "../domain/planEnd";

/** The newest page a focus reads, and the earlier pages behind it (the server clamps a page to 100, K-N10). */
export const NEWEST_PAGE = 50;
export const EARLIER_PAGE = 100;
/** `chat_messages_since` answers at most this many rows: a full answer may leave rows out, so it is a gap (H22). */
export const SINCE_LIMIT = 200;
/** The cursor's overlap: a row whose transaction began before the last read and committed after it (K-B1). */
export const SINCE_OVERLAP_MS = 120_000;
/** An unsent message older than this was left behind (the app was closed mid-send) and is sent again (K-S7). */
export const STALE_UNSENT_MS = 10_000;
/** The most rows a session remembers having seen outside its list (H25). */
export const SEEN_LIMIT = 500;

/** A message written on this phone that the server hasn't confirmed: "Sending…", or "Not sent. Tap to retry." */
export type PendingMessage = { kind: "pending"; clientId: string; body: string; createdAt: string; failed: boolean };
/** The computed separator at a one-off's end, "<title> ended" (K-S16). Nothing stores it. */
export type EndedLine = { kind: "ended"; at: string };

/**
 * A server time in ms, read through the gateway's `serverTime` (milliseconds exactly), so an engine whose
 * `Date.parse` takes three fractional digits still reads the cursor. NaN when it can't be read.
 */
export const instantOf = (iso: string): number => Date.parse(serverTime(iso));

/** Only `sent` shows a body; `deleted`, `removed` and any state this build doesn't know are final (H26 Q2). */
const isFinal = (m: ChatMessage) => m.state !== "sent";
/** Only a `sent` row has a body to show; a removal or deletion that arrives with one shows none. */
const shown = (m: ChatMessage): ChatMessage => (m.state === "sent" || m.body === null ? m : { ...m, body: null });

export function newestId(messages: ChatMessage[]): number | null {
  let id: number | null = null;
  for (const m of messages) if (id === null || m.id > id) id = m.id;
  return id;
}

export function oldestId(messages: ChatMessage[]): number | null {
  let id: number | null = null;
  for (const m of messages) if (id === null || m.id < id) id = m.id;
  return id;
}

/**
 * The loaded rows with the incoming ones, by id, ascending (K-B1). An incoming row replaces a loaded one when its
 * `updatedAt` is not older. A loaded `deleted` or `removed` row is final: only another final copy, not older, replaces
 * it, so a stale `sent` copy never brings a body back. A row below the oldest loaded id isn't on screen and is ignored
 * (`loadEarlier` reads it fresh), unless `keepOlder` says the rows below are wanted: a page read down from the newest,
 * an earlier page, or a chat held from its first row, where a late commit below the oldest has nowhere else to come
 * from. A lower id that arrives after a higher one (a late commit) takes its place in order. Nothing given is changed
 * in place; with nothing to change, the loaded list itself comes back.
 */
export function merge(messages: ChatMessage[], incoming: ChatMessage[], keepOlder = false): ChatMessage[] {
  const floor = keepOlder ? null : oldestId(messages);
  const byId = new Map(messages.map((m) => [m.id, m]));
  let changed = false;
  for (const raw of incoming) {
    if (floor !== null && raw.id < floor) continue;
    const next = shown(raw);
    const held = byId.get(next.id);
    if (held) {
      if (isFinal(held) && !isFinal(next)) continue;
      if (instantOf(next.updatedAt) < instantOf(held.updatedAt)) continue;
    }
    byId.set(next.id, next);
    changed = true;
  }
  return changed ? [...byId.values()].sort((a, b) => a.id - b.id) : messages;
}

/** The newest page starts above everything held: what lies between was never read (K-B1). */
export function pageReplaces(cached: ChatMessage[], page: ChatMessage[]): boolean {
  const held = newestId(cached);
  const pageOldest = oldestId(page);
  return held !== null && pageOldest !== null && pageOldest > held;
}

/**
 * The list after a focus read the newest page (K-B1). When the page's oldest id is above the cached newest id, what
 * lies between was never read: the page replaces the list. Otherwise it merges, and the page's rows below the cached
 * oldest are kept, since the page is one stretch down from the newest.
 */
export function replaceOrMerge(cached: ChatMessage[], page: ChatMessage[]): ChatMessage[] {
  return pageReplaces(cached, page) ? merge([], page) : merge(cached, page, true);
}

/** The next read's `p_changed_after`: the last answer's `as_of` minus two minutes, as ISO text (K-B1). */
export const changedAfter = (asOf: string): string => new Date(instantOf(asOf) - SINCE_OVERLAP_MS).toISOString();

/**
 * A signal (or a changed row) that can move the summary: an announcement or a removal moves the pinned card (K-S12),
 * and a system line the going count, the close or the closed card (H24 (1)).
 */
export const needsSummary = (signal: { kind: string; state: string }): boolean =>
  signal.kind === "announcement" || signal.kind === "system" || signal.state !== "sent";

/**
 * Runs `run` one at a time (K-N6). A trigger while a run is in flight queues one more; a trigger while one is queued
 * is dropped into it. Each trigger's promise settles when the run that covers it has ended; a run that throws is
 * ignored here (it reports its own failure) and never stops the next.
 */
export function createCoalescer(run: () => Promise<void>): { trigger(): Promise<void> } {
  let flight: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  const once = async () => {
    try {
      await run();
    } catch {
      // The run says what went wrong; the coalescer only keeps the order.
    }
  };
  const start = () =>
    (flight = once().then(() => {
      flight = null;
    }));
  return {
    trigger() {
      if (queued) return queued;
      if (!flight) return start();
      return (queued = flight.then(() => {
        queued = null;
        return start();
      }));
    },
  };
}

/** The rows on screen, then the queued messages the server hasn't confirmed (matched by client id), oldest first. */
export function withPending(messages: ChatMessage[], queue: QueuedMessage[]): Array<ChatMessage | PendingMessage> {
  const confirmed = new Set(messages.map((m) => m.clientId).filter((id): id is string => id !== null));
  const pending = queue
    .filter((q) => !confirmed.has(q.clientId))
    .map((q): PendingMessage => ({ kind: "pending", clientId: q.clientId, body: q.body, createdAt: q.createdAt, failed: q.failed }));
  return pending.length ? [...messages, ...pending] : messages;
}

/**
 * Unsent messages left behind: not failed, and more than 10 seconds from now either way, so a clock moved back
 * doesn't hide one (or with a time that can't be read) (K-S7, H26 Q4).
 */
export const staleUnsent = (queue: QueuedMessage[], now: number): QueuedMessage[] =>
  queue.filter((q) => !q.failed && !(Math.abs(now - instantOf(q.createdAt)) <= STALE_UNSENT_MS));

/** Notes a row's stamp, keeping at most `SEEN_LIMIT`; the one seen longest ago goes first (H25). */
export function remember(seen: Map<number, string>, id: number, stamp: string): void {
  seen.delete(id);
  seen.set(id, stamp);
  if (seen.size > SEEN_LIMIT) {
    const first = seen.keys().next();
    if (!first.done) seen.delete(first.value);
  }
}

/**
 * The list with a one-off's "<title> ended" separator (K-S16, Decision 8). Only for a one-off that isn't cancelled
 * (NOTE 5) and whose end (`endsAt ?? startsAt`, `planEnd`) has passed. It goes after the last row created at or before
 * the end, or first when every row is later, and only where it can be placed: nothing earlier is left to load, or the
 * oldest loaded row is at or before the end. Pending messages are written now, so they stay after it.
 */
export function withEndedLine<T extends ChatMessage | PendingMessage>(
  items: T[],
  summary: ChatSummary | null,
  hasEarlier: boolean,
  now: number,
): Array<T | EndedLine> {
  if (!summary || summary.isGroup || summary.status === "cancelled") return items;
  const endsAt = summary.endsAt === null ? null : serverTime(summary.endsAt);
  const end = planEnd({ starts_at: serverTime(summary.startsAt), ends_at: endsAt });
  if (!Number.isFinite(end) || end > now) return items;
  let first = -1,
    after = -1;
  items.forEach((item, i) => {
    if (item.kind === "pending") return;
    if (first < 0) first = i;
    if (instantOf(item.createdAt) <= end) after = i;
  });
  if (hasEarlier && !(first >= 0 && instantOf(items[first].createdAt) <= end)) return items;
  const line: EndedLine = { kind: "ended", at: summary.endsAt ?? summary.startsAt };
  const at = after + 1;
  return [...items.slice(0, at), line, ...items.slice(at)];
}
