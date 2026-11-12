import { CHAT_COPY, type ChatAudience } from "../domain/chatCopy";
import {
  chatErrorMessage,
  isChatClosed,
  isNotInChat,
  type ChatGateway,
  type ChatMessage,
  type ChatNames,
  type ChatSummary,
} from "../services/chat";
import type { QueuedMessage } from "../services/chatQueue";
import {
  EARLIER_PAGE,
  NEWEST_PAGE,
  SINCE_LIMIT,
  STALE_UNSENT_MS,
  changedAfter,
  createCoalescer,
  instantOf,
  merge,
  needsSummary,
  newestId,
  oldestId,
  pageReplaces,
  remember,
  staleUnsent,
} from "./chatModel";

/** While the channel isn't subscribed, the open chat reads every 20 seconds (K-N6, Decision 12). */
export const POLL_MS = 20_000;
/** The minute tick that checks the close (K-S10). */
export const TICK_MS = 60_000;
/** Channel errors in a row after which the channel is removed until the next focus (K-N6). */
export const CHANNEL_ERRORS = 3;
/** A read that failed while subscribed is tried again after 5 seconds, then every 20 (H26 Q11). */
export const RETRY_FIRST_MS = 5_000;
/**
 * A close that has passed by the server's clock while the summary still says open is asked again a second later, up
 * to three times, before the minute tick takes over: the estimate of the server's clock can be a moment out (H26 Q7).
 */
export const CLOSE_RECHECK_MS = 1_000;
export const CLOSE_RECHECKS = 3;
/** A failed message older than this leaves the queue, in any chat (H26 Q6). */
export const FAILED_KEPT_MS = 7 * 86_400_000;
/** The longest delay a timer takes; a later close re-arms when it fires. */
const MAX_DELAY = 2_147_483_647;

/** What the chat screen shows. `pending` is this chat's unsent messages, as the queue holds them (`withPending`). */
export type ChatState = {
  summary: ChatSummary | null;
  names: ChatNames;
  messages: ChatMessage[];
  pending: QueuedMessage[];
  busy: boolean;
  error: string | null;
  hasEarlier: boolean;
  /**
   * The server's clock minus this phone's, estimated from each read's `as_of` (H26 Q7–Q9). The closing countdown
   * uses `Date.now() + clockOffset`, as the close timer does.
   */
  clockOffset: number;
};

/** Nothing open: no account, the preview, a series that isn't one, or before the chat is made. */
export const IDLE: ChatState = {
  summary: null,
  names: {},
  messages: [],
  pending: [],
  busy: false,
  error: null,
  hasEarlier: false,
  clockOffset: 0,
};

export type ChatTimers = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
};

/** What a channel tells the chat: each signal's payload (`{id, kind, state}`), and each subscribe status. */
export type ChatListener = { signal(payload: unknown): void; status(status: string): void };
export type ChatChannel = { remove(): void };

/** The parts of `chatQueue` the chat uses. */
export type ChatQueueStore = {
  list(scope: string, series: string): Promise<QueuedMessage[]>;
  put(scope: string, item: QueuedMessage): Promise<void>;
  update(scope: string, clientId: string, patch: { failed: boolean }): Promise<void>;
  remove(scope: string, clientId: string): Promise<void>;
  prune(scope: string, drop: (item: QueuedMessage) => boolean): Promise<void>;
};

export type ChatSessionDeps = {
  series: string;
  /** The account the queue is kept under. */
  scope: string;
  gateway: ChatGateway;
  queue: ChatQueueStore;
  /** Opens the series' channel (`listenWith(supabase)` in the app). */
  listen(series: string, on: ChatListener): ChatChannel;
  newId(): string;
  timers?: ChatTimers;
  /** False once the session the chat was opened in has changed: nothing more is applied. */
  current?(): boolean;
  onChange(state: ChatState): void;
};

export type ChatSession = ReturnType<typeof createChatSession>;

const deviceTimers: ChatTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "");
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const readable = (iso: string) => Number.isFinite(instantOf(iso));
const noop = () => {};

type ChannelEntry = { token: object; handle: ChatChannel | null; closed: boolean };

/**
 * One open chat, kept current (K-B1, K-N6): read on focus, by the Realtime signal, and by a 20-second poll while the
 * channel isn't subscribed, with every read of new rows one `since` through a coalescer. Unsent messages go through
 * the queue first and are resent with their own client id (K-S7). `useChat` gives it the screen's focus, the app's
 * return and the session; everything else is here, so it runs under node with fakes.
 *
 * The list holds only what reads brought: a sent message stays in `pending` until a read shows its row, so a send
 * never moves the list's newest id under a read (H26 D2, D3).
 */
export function createChatSession(deps: ChatSessionDeps) {
  const { series, scope, gateway, queue, listen, newId, onChange } = deps;
  const timers = deps.timers ?? deviceTimers;
  const current = deps.current ?? (() => true);

  let state: ChatState = { ...IDLE, busy: true };
  let readError: string | null = null,
    actionError: string | null = null;
  /** The last successful read's `as_of`; null until a newest page has been read (the next read is then a full one). */
  let asOf: string | null = null;
  /**
   * After a gap reload, its `as_of`: the cursor looks back no further (H24 (2)). `cursorFrom` takes the later of the two,
   * so once a successful read's `as_of` minus the overlap passes it, it no longer counts; only a read moves `as_of`.
   */
  let floor: string | null = null;
  let offset = 0;
  let focused = false,
    looking = false,
    disposed = false,
    /** 42501 'Not in this chat': nothing is read until a focus or a refresh tries again (K-N1). */
    shut = false;
  let wantFull = false,
    wantReplace = false;
  /** Summary needs asked and met: a need lasts until a summary read that began after it succeeds (H26 D6). */
  let summaryAsked = 0,
    summaryHad = 0;
  let channel: ChannelEntry | null = null;
  let subscribed = false,
    channelErrors = 0;
  let poll: unknown = null,
    tick: unknown = null,
    closer: unknown = null,
    staleCheck: unknown = null,
    retry: unknown = null;
  let retries = 0;
  /** Quick re-checks spent on the close the summary now gives. */
  let closeChecks = 0,
    checkedClose: string | null = null;
  /** The highest id marked read, or known read from the summary. */
  let marked = 0;
  /** The `updatedAt` of rows a `since` brought that aren't held, so a repeat in the overlap isn't news. */
  const seen = new Map<number, string>();
  const sending = new Set<string>();
  /** Unsent messages the queue couldn't keep (full, or storage failing): on screen only. */
  const unsaved = new Set<string>();
  /** Discarded here: never sent and never listed back, whatever is still in flight (H26 D5). */
  const discarded = new Set<string>();
  /** Taken by the server, with their row's id, and waiting for a read to show the row. */
  const delivered = new Map<string, number>();
  let lastAnnounce: { body: string; audience: ChatAudience; clientId: string } | null = null;
  let earlier: Promise<void> | null = null;

  const live = () => !disposed && current();
  const serverNow = () => timers.now() + offset;
  function set(patch: Partial<ChatState>) {
    if (disposed) return;
    state = { ...state, ...patch, error: actionError ?? readError, clockOffset: offset };
    onChange(state);
  }
  const withoutPending = (clientId: string) => state.pending.filter((p) => p.clientId !== clientId);
  const markPending = (clientId: string, failed: boolean) =>
    state.pending.map((p) => (p.clientId === clientId ? { ...p, failed } : p));
  const askSummary = () => void (summaryAsked += 1);
  const summaryOwed = () => summaryAsked > summaryHad;

  /** The server's time at the middle of the call, against this phone's (H26 Q7–Q9). */
  function noteClock(at: string, started: number) {
    const server = instantOf(at);
    if (Number.isFinite(server)) offset = server - (started + timers.now()) / 2;
  }
  /** `p_changed_after` from a read's `as_of`: two minutes back, but not before a gap reload's floor (H24 (2)). */
  function cursorFrom(base: string): string {
    const overlap = changedAfter(base);
    return floor !== null && instantOf(floor) > instantOf(overlap) ? floor : overlap;
  }

  // Every read that lands rows runs in this one line, so answers apply in the order they were asked.
  let reads: Promise<unknown> = Promise.resolve();
  function serially<T>(fn: () => Promise<T>): Promise<T> {
    const next = reads.then(fn, fn);
    reads = next.catch(() => {});
    return next;
  }
  const reader = createCoalescer(() => serially(readOnce));

  /** A read of new rows; on focus, the newest page then a `since` from the last read's cursor (K-B1, H26 D1). */
  async function readOnce(): Promise<void> {
    if (!live() || shut) return;
    const replace = wantReplace;
    const full = replace || wantFull || asOf === null;
    wantReplace = false;
    wantFull = false;
    const before = asOf;
    try {
      if (full) {
        const outcome = await readNewest(replace, before !== null && !replace);
        if (outcome === null) return;
        // The page brings only the newest rows: what changed in the older loaded ones comes by a since.
        if (outcome === "merged" && before !== null && !(await readSince(before))) return;
      } else if (asOf !== null && !(await readSince(asOf))) return;
      if (summaryOwed() && !(await readSummary())) return;
      retries = 0;
      if (retry !== null) timers.clearTimeout(retry);
      retry = null;
      markRead();
    } catch (e) {
      if (full) wantFull = true;
      if (replace) wantReplace = true;
      if (!live()) return;
      if (isNotInChat(e)) return shutOut();
      failed(e, "read");
      retryLater();
    }
  }

  /**
   * The summary and the newest page; `gap` replaces the list, otherwise the page alone decides (K-B1). A merged page
   * leaves the cursor where the last read put it (`keepCursor`), for the `since` that follows. Null when the answer
   * no longer applies.
   */
  async function readNewest(gap: boolean, keepCursor: boolean): Promise<"replaced" | "merged" | null> {
    set({ busy: true });
    const asked = summaryAsked;
    const started = timers.now();
    const [summary, page] = await Promise.all([gateway.summary(series), gateway.messages(series, null, NEWEST_PAGE)]);
    if (!live() || shut) return null;
    noteClock(page.asOf, started);
    const replaced = gap || pageReplaces(state.messages, page.rows);
    const messages = replaced ? merge([], page.rows) : merge(state.messages, page.rows, true);
    // Where the page is the bottom of the list, its size says whether there is more before it.
    const bottom = oldestId(messages) === oldestId(page.rows);
    if (readable(page.asOf)) {
      if (replaced || !keepCursor) asOf = page.asOf;
      if (gap) floor = page.asOf;
    }
    summaryHad = Math.max(summaryHad, asked);
    readError = null;
    marked = Math.max(marked, summary.lastReadId ?? 0);
    set({
      summary,
      messages,
      names: { ...state.names, ...summary.names, ...page.names },
      hasEarlier: bottom ? page.rows.length >= NEWEST_PAGE : state.hasEarlier,
      busy: false,
    });
    settlePending();
    if (focused) {
      openChannel();
      startTimers();
    }
    armClose();
    return replaced ? "replaced" : "merged";
  }

  /** `since` from `base`'s cursor; a full 200-row answer is a gap and reads the list again (H22). */
  async function readSince(base: string): Promise<boolean> {
    const started = timers.now();
    const page = await gateway.since(series, newestId(state.messages), cursorFrom(base));
    if (!live() || shut) return false;
    noteClock(page.asOf, started);
    if (page.rows.length >= SINCE_LIMIT) return (await readNewest(true, false)) !== null;
    const held = new Map(state.messages.map((m) => [m.id, m.updatedAt]));
    // On the poll-only path no signal says so: a changed row that moves the summary asks for it (K-S12).
    if (page.rows.some((r) => (held.get(r.id) ?? seen.get(r.id)) !== r.updatedAt && needsSummary(r))) askSummary();
    for (const r of page.rows) if (!held.has(r.id)) remember(seen, r.id, r.updatedAt);
    if (readable(page.asOf)) asOf = page.asOf;
    readError = null;
    set({ messages: merge(state.messages, page.rows, !state.hasEarlier), names: { ...state.names, ...page.names } });
    settlePending();
    return true;
  }

  async function readSummary(): Promise<boolean> {
    const asked = summaryAsked;
    const summary = await gateway.summary(series);
    if (!live() || shut) return false;
    summaryHad = Math.max(summaryHad, asked);
    marked = Math.max(marked, summary.lastReadId ?? 0);
    set({ summary, names: { ...state.names, ...summary.names } });
    armClose();
    return true;
  }

  /** The newest loaded id, after a fetch while the chat is on screen and the app in front, or on blur (K-S11, Q3). */
  function markRead() {
    if (!live() || shut || !focused || !looking) return;
    const id = newestId(state.messages);
    if (id === null || id <= marked) return;
    const before = marked;
    marked = id;
    gateway.markRead(series, id).catch(() => {
      if (marked === id) marked = before;
    });
  }

  function failed(e: unknown, kind: "read" | "action") {
    if (isNotInChat(e)) return shutOut();
    if (kind === "read") readError = chatErrorMessage(e);
    else actionError = chatErrorMessage(e);
    set({ busy: false });
  }

  /** While subscribed nothing polls: a failed read is tried again after 5 seconds, then every 20 (H26 Q11). */
  function retryLater() {
    if (!live() || !focused || shut || !subscribed || retry !== null) return;
    const wait = retries === 0 ? RETRY_FIRST_MS : POLL_MS;
    retries += 1;
    retry = timers.setTimeout(() => {
      retry = null;
      if (focused && !shut) void reader.trigger();
    }, wait);
  }

  /** Not (or no longer) in this chat: the channel goes at once and nothing of the chat stays on screen (K-N1). */
  function shutOut() {
    shut = true;
    dropChannel();
    stopTimers();
    asOf = null;
    floor = null;
    readError = CHAT_COPY.notInChat;
    actionError = null;
    set({ summary: null, names: {}, messages: [], pending: [], hasEarlier: false, busy: false });
  }

  /** Pending messages a read has shown, or that landed below the loaded rows, leave `pending`. */
  function settlePending() {
    const stored = new Set(state.messages.map((m) => m.clientId).filter((id): id is string => id !== null));
    const oldest = oldestId(state.messages);
    const below = (clientId: string) => {
      const row = delivered.get(clientId);
      return row !== undefined && state.hasEarlier && oldest !== null && row < oldest;
    };
    const gone = state.pending.filter(
      (p) => !sending.has(p.clientId) && (stored.has(p.clientId) || below(p.clientId)),
    );
    if (gone.length === 0) return;
    for (const p of gone) {
      // Stored already (the app closed before it heard back): off the queue, and not sent again.
      if (!delivered.has(p.clientId)) void queue.remove(scope, p.clientId).catch(noop);
      delivered.delete(p.clientId);
      unsaved.delete(p.clientId);
    }
    set({ pending: state.pending.filter((p) => !gone.includes(p)) });
  }

  function openChannel() {
    if (!live() || channel || shut || channelErrors >= CHANNEL_ERRORS) return;
    const entry: ChannelEntry = { token: {}, handle: null, closed: false };
    const mine = () => channel === entry;
    channel = entry;
    subscribed = false;
    try {
      entry.handle = listen(series, {
        signal: (payload) => {
          if (mine()) heard(payload);
        },
        status: (status) => {
          if (mine()) statusOf(status, entry);
        },
      });
    } catch {
      // No channel: the poll carries the chat.
      if (mine()) channel = null;
      channelErrors += 1;
      return;
    }
    if (!mine()) entry.handle.remove();
  }

  function dropChannel() {
    const entry = channel;
    channel = null;
    subscribed = false;
    entry?.handle?.remove();
  }

  function statusOf(status: string, entry: ChannelEntry) {
    if (status === "SUBSCRIBED") {
      subscribed = true;
      channelErrors = 0;
      entry.closed = false;
      void reader.trigger();
      return;
    }
    subscribed = false;
    if (status === "CLOSED") entry.closed = true;
    // supabase-js's backoff rejoins by itself; the chat only gives up after three in a row (K-N6).
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      channelErrors += 1;
      if (channelErrors >= CHANNEL_ERRORS) dropChannel();
    }
  }

  function heard(payload: unknown) {
    if (!live() || !focused || shut) return;
    const p = isObject(payload) ? payload : {};
    const kind = typeof p.kind === "string" ? p.kind : "";
    const rowState = typeof p.state === "string" ? p.state : "";
    if (needsSummary({ kind, state: rowState })) askSummary();
    void reader.trigger();
  }

  /** Reads the summary again soon (the pinned card after an announcement or a takedown). */
  function rereadSummary() {
    askSummary();
    void reader.trigger();
  }

  const closesAt = () => {
    const s = state.summary;
    return s?.open && s.closesAt ? instantOf(s.closesAt) : NaN;
  };
  /** Still open by the summary, with its close passed by the server's clock (K-S10, H26 Q7–Q9). */
  const closeDue = () => serverNow() >= closesAt();
  /** The close has come by the clock, or the server refused a write as closed: the summary decides (K-S10). */
  function readClose() {
    askSummary();
    void reader.trigger();
  }

  function startTimers() {
    if (!live()) return;
    if (poll === null)
      poll = timers.setInterval(() => {
        if (focused && looking && !shut && !subscribed) void reader.trigger();
      }, POLL_MS);
    if (tick === null)
      tick = timers.setInterval(() => {
        if (focused && looking && !shut && closeDue()) readClose();
      }, TICK_MS);
    armClose();
  }

  function stopTimers() {
    if (poll !== null) timers.clearInterval(poll);
    if (tick !== null) timers.clearInterval(tick);
    if (closer !== null) timers.clearTimeout(closer);
    if (staleCheck !== null) timers.clearTimeout(staleCheck);
    if (retry !== null) timers.clearTimeout(retry);
    poll = tick = closer = staleCheck = retry = null;
    retries = 0;
  }

  /**
   * A timer for the close itself, by the server's clock. Once it has passed and the summary still says open, a few
   * quick re-checks, then the minute tick reads until the server agrees.
   */
  function armClose() {
    if (closer !== null) timers.clearTimeout(closer);
    closer = null;
    if (!live() || !focused || shut) return;
    const at = closesAt();
    if (!Number.isFinite(at)) return;
    const given = state.summary?.closesAt ?? null;
    if (given !== checkedClose) {
      checkedClose = given;
      closeChecks = 0;
    }
    let wait = at - serverNow();
    // A re-check counts when it fires, so arming twice for one read doesn't spend two.
    const recheck = !(wait > 0);
    if (recheck) {
      if (closeChecks >= CLOSE_RECHECKS) return;
      wait = CLOSE_RECHECK_MS;
    }
    closer = timers.setTimeout(() => {
      closer = null;
      if (recheck) closeChecks += 1;
      if (closeDue()) readClose();
      else armClose();
    }, Math.min(wait, MAX_DELAY));
  }

  /** Ten seconds after a focus, an item left behind just before it is old enough to resend (H26 D4). */
  function armStaleCheck() {
    if (!live()) return;
    if (staleCheck !== null) timers.clearTimeout(staleCheck);
    staleCheck = timers.setTimeout(() => {
      staleCheck = null;
      void resend();
    }, STALE_UNSENT_MS);
  }

  /**
   * After a focus read: failed messages over 7 days old leave the queue in any chat; this chat's go too when it reads
   * closed, and its failed ones when it still refuses this person (H26 Q5, Q6). Then what was left behind is resent.
   */
  async function afterFocus() {
    if (!live()) return;
    const now = timers.now();
    const closed = state.summary?.open === false;
    const refused = shut;
    const drop = (q: QueuedMessage) =>
      !sending.has(q.clientId) &&
      ((q.failed && !(now - instantOf(q.createdAt) <= FAILED_KEPT_MS)) ||
        (q.series === series && (closed || (refused && q.failed))));
    try {
      await queue.prune(scope, drop);
    } catch {
      // A queue that can't be written keeps them until the next focus.
    }
    if (!live()) return;
    if (state.pending.some(drop)) {
      for (const p of state.pending) if (drop(p)) unsaved.delete(p.clientId);
      set({ pending: state.pending.filter((p) => !drop(p)) });
    }
    await resend();
  }

  /** The queue's copy of this chat's unsent messages joins the screen's; what's left behind is sent again (K-S7). */
  async function resend() {
    if (!live() || shut) return;
    let listed: QueuedMessage[];
    try {
      listed = await queue.list(scope, series);
    } catch {
      return;
    }
    if (!live() || shut) return;
    // The screen's copy wins: it knows what is being sent, what was discarded, and what the queue couldn't keep.
    const known = new Set(state.pending.map((p) => p.clientId));
    const fresh = listed.filter(
      (q) => !known.has(q.clientId) && !discarded.has(q.clientId) && !delivered.has(q.clientId),
    );
    if (fresh.length) set({ pending: [...state.pending, ...fresh] });
    settlePending();
    if (state.summary?.open === false) return;
    for (const item of staleUnsent(state.pending, timers.now()))
      if (!sending.has(item.clientId) && !delivered.has(item.clientId) && !discarded.has(item.clientId))
        void deliver(item.clientId);
  }

  /** Puts it in the queue. A full queue or one that can't be written keeps it on screen only. */
  async function save(item: QueuedMessage): Promise<"saved" | "unsaved" | "full" | "session"> {
    try {
      await queue.put(scope, item);
      unsaved.delete(item.clientId);
      return "saved";
    } catch (e) {
      // Sign-out began: nothing more is written or sent for this account.
      if (messageOf(e).startsWith("Session changed")) return "session";
      unsaved.add(item.clientId);
      return messageOf(e) === "Too many unsent messages" ? "full" : "unsaved";
    }
  }

  // Sends go one after another, so messages keep the order they were written in.
  let sends: Promise<unknown> = Promise.resolve();
  function deliver(clientId: string): Promise<boolean> {
    sending.add(clientId);
    const next = sends.then(() => attempt(clientId));
    sends = next.catch(() => {});
    return next;
  }

  async function attempt(clientId: string): Promise<boolean> {
    const item = state.pending.find((p) => p.clientId === clientId);
    if (discarded.has(clientId) || !item || !live() || shut) {
      sending.delete(clientId);
      if (discarded.has(clientId)) void queue.remove(scope, clientId).catch(noop);
      return false;
    }
    try {
      const row = await gateway.send(series, item.body, clientId);
      sending.delete(clientId);
      unsaved.delete(clientId);
      delivered.set(clientId, row.id);
      void queue.remove(scope, clientId).catch(noop);
      // After 'Not in this chat' only the queue hears of it (H26 D9).
      if (!live() || shut) return true;
      settlePending();
      // The row comes by a read, so the list stays as reads made it (H26 D2, D3).
      void reader.trigger();
      return true;
    } catch (e) {
      sending.delete(clientId);
      if (discarded.has(clientId)) {
        void queue.remove(scope, clientId).catch(noop);
        return false;
      }
      // Every refusal leaves it failed: only a tap sends it again, with the same client id.
      void queue.update(scope, clientId, { failed: true }).catch(noop);
      if (!live() || shut) return false;
      set({ pending: markPending(clientId, true) });
      if (isChatClosed(e)) readClose();
      failed(e, "action");
      return false;
    }
  }

  async function takeDown(id: number, final: "deleted" | "removed"): Promise<boolean> {
    if (!live()) return false;
    actionError = null;
    set({});
    try {
      await (final === "deleted" ? gateway.deleteOwn(id) : gateway.remove(id));
    } catch (e) {
      if (live()) failed(e, "action");
      return false;
    }
    if (!live()) return true;
    // Taken: the body goes now, and the read brings the server's row.
    const held = state.messages.find((m) => m.id === id);
    if (held?.state === "sent")
      set({ messages: state.messages.map((m) => (m.id === id ? { ...m, state: final, body: null } : m)) });
    if (held?.kind === "announcement") askSummary();
    void reader.trigger();
    return true;
  }

  async function readEarlier() {
    const before = oldestId(state.messages);
    if (!live() || shut || !state.hasEarlier || before === null) return;
    try {
      const started = timers.now();
      const page = await gateway.messages(series, before, EARLIER_PAGE);
      if (!live() || shut) return;
      noteClock(page.asOf, started);
      set({
        messages: merge(state.messages, page.rows, true),
        names: { ...state.names, ...page.names },
        hasEarlier: page.rows.length >= EARLIER_PAGE,
      });
      settlePending();
    } catch (e) {
      if (live()) failed(e, "read");
    }
  }

  function loadEarlier(): Promise<void> {
    if (!earlier)
      earlier = serially(readEarlier).finally(() => {
        earlier = null;
      });
    return earlier;
  }

  return {
    state: () => state,

    /**
     * The screen gained focus, or the app came back to it: read, resend, and listen. Either is a new start for the
     * channel: the error count resets, and one the server closed is replaced (H25 Q1).
     */
    focus() {
      if (disposed || !live()) return;
      focused = true;
      looking = true;
      channelErrors = 0;
      closeChecks = 0;
      if (channel?.closed) dropChannel();
      // A chat that refused this person opens its channel only once a read lets them in again.
      if (!shut) {
        openChannel();
        startTimers();
      }
      shut = false;
      wantFull = true;
      armStaleCheck();
      void reader.trigger().then(afterFocus);
    },
    /** The app went to the background: nobody is looking, so nothing is marked read and nothing is polled. */
    background() {
      looking = false;
    },
    blur() {
      if (!focused) return;
      markRead();
      focused = false;
      looking = false;
      dropChannel();
      stopTimers();
    },
    dispose() {
      disposed = true;
      focused = false;
      looking = false;
      dropChannel();
      stopTimers();
    },
    /** "Try again": the summary, the newest page and a since, then what was left behind. */
    refresh(): Promise<void> {
      if (disposed) return Promise.resolve();
      shut = false;
      wantFull = true;
      return reader.trigger().then(afterFocus);
    },
    /**
     * Reads the newest page and the summary again and replaces the list, earlier pages and all (H25). Plan 3's block
     * and unblock call it, since what a person may see has changed under every loaded row.
     */
    replace(): Promise<void> {
      if (disposed) return Promise.resolve();
      wantReplace = true;
      return reader.trigger();
    },
    loadEarlier,
    /** Earlier pages of 100 until the oldest loaded id is at or below `id`, for the pinned card (K-S12). */
    async loadUntil(id: number): Promise<void> {
      for (;;) {
        const oldest = oldestId(state.messages);
        if (!live() || shut || !state.hasEarlier || oldest === null || oldest <= id) return;
        await loadEarlier();
        if (oldestId(state.messages) === oldest) return;
      }
    },

    /**
     * Queues the message, then sends it (K-S7). True once the server has it; it shows in `pending` until a read
     * brings its row. A message with nothing visible isn't sent; one written as sign-out began is dropped; one the
     * full queue refuses shows as not sent; nothing is sent while this chat refuses the person (H26 D9).
     */
    async send(body: string): Promise<boolean> {
      if (!live() || shut || !/\S/.test(body)) return false;
      actionError = null;
      const item: QueuedMessage = {
        clientId: newId(),
        series,
        body,
        createdAt: new Date(timers.now()).toISOString(),
        failed: false,
      };
      set({ pending: [...state.pending, item] });
      const saved = await save(item);
      if (saved === "session") {
        set({ pending: withoutPending(item.clientId) });
        return false;
      }
      if (saved === "full") {
        set({ pending: markPending(item.clientId, true) });
        return false;
      }
      return deliver(item.clientId);
    },
    /** Sends again, with its own client id, a failed message or one left behind (H26 D4). */
    async retry(clientId: string): Promise<boolean> {
      const item = state.pending.find((p) => p.clientId === clientId);
      if (!live() || shut || !item || sending.has(clientId) || delivered.has(clientId) || discarded.has(clientId))
        return false;
      if (!item.failed && staleUnsent([item], timers.now()).length === 0) return false;
      actionError = null;
      const again = { ...item, failed: false };
      if (unsaved.has(clientId)) {
        const saved = await save(again);
        if (saved === "session" || saved === "full") {
          set({});
          return false;
        }
      } else if (item.failed) void queue.update(scope, clientId, { failed: false }).catch(noop);
      set({ pending: state.pending.map((p) => (p.clientId === clientId ? again : p)) });
      return deliver(clientId);
    },
    /**
     * Takes an unsent message off this phone, for good: a send or a resend still in flight checks first (H26 D5). One
     * already on its way to the server is settled by its answer: refused, it goes; taken, its row shows.
     */
    async discard(clientId: string): Promise<void> {
      discarded.add(clientId);
      unsaved.delete(clientId);
      set({ pending: withoutPending(clientId) });
      await queue.remove(scope, clientId).catch(noop);
    },
    /**
     * A host's announcement. A failure keeps its client id for the same text and audience, so sending it again can't
     * make two. Its row and the pinned card come by the read it asks for.
     */
    async announce(body: string, audience: ChatAudience): Promise<boolean> {
      if (!live() || shut || !/\S/.test(body)) return false;
      actionError = null;
      set({});
      const again = lastAnnounce && lastAnnounce.body === body && lastAnnounce.audience === audience;
      const clientId = again && lastAnnounce ? lastAnnounce.clientId : newId();
      lastAnnounce = { body, audience, clientId };
      try {
        await gateway.announce(series, body, audience, clientId);
        if (lastAnnounce?.clientId === clientId) lastAnnounce = null;
        if (!live() || shut) return true;
        rereadSummary();
        return true;
      } catch (e) {
        if (!live()) return false;
        if (isChatClosed(e)) readClose();
        failed(e, "action");
        return false;
      }
    },
    deleteOwn: (id: number) => takeDown(id, "deleted"),
    remove: (id: number) => takeDown(id, "removed"),
    async setMute(muted: boolean): Promise<boolean> {
      if (!live()) return false;
      actionError = null;
      set({});
      try {
        await gateway.setMute(series, muted);
      } catch (e) {
        if (live()) failed(e, "action");
        return false;
      }
      if (live() && state.summary) set({ summary: { ...state.summary, mutedChat: muted } });
      return true;
    },
  };
}

type RealtimeChannelLike = {
  topic: string;
  on(type: "broadcast", filter: { event: string }, callback: (message: { payload?: unknown }) => void): RealtimeChannelLike;
  subscribe(callback: (status: string) => void): RealtimeChannelLike;
};
/** The parts of the Supabase client the chat's channel uses. */
export type RealtimeClientLike = {
  getChannels(): Array<{ topic: string }>;
  channel(name: string, options: { config: { private: boolean } }): RealtimeChannelLike;
  removeChannel(channel: { topic: string }): Promise<unknown>;
};

/**
 * The chat's channel on a Supabase client: `chat:<series>`, private, hearing the `chat` broadcast that carries only
 * `{id, kind, state}`. A channel left behind on that topic (a screen that lost focus, or a removal still waiting for
 * its leave) is removed first, since the client would hand it back instead of a new one. A channel that can't be made
 * reports an error, and the poll carries the chat (H25).
 */
export function listenWith(client: RealtimeClientLike) {
  return (series: string, on: ChatListener): ChatChannel => {
    const name = `chat:${series}`;
    let made: RealtimeChannelLike | null = null;
    let removed = false;
    const left = client.getChannels().filter((c) => c.topic === `realtime:${name}`);
    void Promise.all(left.map((c) => client.removeChannel(c).catch(() => {})))
      .then(() => {
        if (removed) return;
        made = client
          .channel(name, { config: { private: true } })
          .on("broadcast", { event: "chat" }, (message) => on.signal(message?.payload))
          .subscribe((status) => on.status(status));
      })
      .catch(() => {
        if (!removed) on.status("CHANNEL_ERROR");
      });
    return {
      remove() {
        removed = true;
        if (made) void client.removeChannel(made).catch(() => {});
      },
    };
  };
}
