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
  changedAfter,
  createCoalescer,
  instantOf,
  merge,
  needsSummary,
  newestId,
  oldestId,
  replaceOrMerge,
  staleUnsent,
} from "./chatModel";

/** While the channel isn't subscribed, the open chat reads every 20 seconds (K-N6, Decision 12). */
export const POLL_MS = 20_000;
/** The minute tick that checks the close (K-S10). */
export const TICK_MS = 60_000;
/** Channel errors in a row after which the channel is removed until the next focus (K-N6). */
export const CHANNEL_ERRORS = 3;
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

/**
 * One open chat, kept current (K-B1, K-N6): read on focus, by the Realtime signal, and by a 20-second poll while the
 * channel isn't subscribed, with every read of new rows one `since` through a coalescer. Unsent messages go through
 * the queue first and are resent with their own client id (K-S7). `useChat` gives it the screen's focus, the app's
 * return and the session; everything else is here, so it runs under node with fakes.
 */
export function createChatSession(deps: ChatSessionDeps) {
  const { series, scope, gateway, queue, listen, newId, onChange } = deps;
  const timers = deps.timers ?? deviceTimers;
  const current = deps.current ?? (() => true);

  let state: ChatState = { ...IDLE, busy: true };
  let readError: string | null = null,
    actionError: string | null = null;
  /** The last answer's `as_of`; null until a newest page has been read (the next read is then a full one). */
  let asOf: string | null = null;
  let focused = false,
    looking = false,
    disposed = false,
    /** 42501 'Not in this chat': nothing is read until a focus or a refresh tries again (K-N1). */
    shut = false;
  let wantFull = false,
    wantSummary = false;
  let channel: { token: object; handle: ChatChannel | null } | null = null;
  let subscribed = false,
    channelErrors = 0;
  let poll: unknown = null,
    tick: unknown = null,
    closer: unknown = null;
  /** The highest id marked read, or known read from the summary. */
  let marked = 0;
  /** The `updatedAt` of rows a `since` brought that aren't held, so a repeat in the overlap isn't news. */
  const seen = new Map<number, string>();
  const sending = new Set<string>();
  /** Unsent messages the queue couldn't keep (full, or storage failing): on screen only. */
  const unsaved = new Set<string>();
  let lastAnnounce: { body: string; audience: ChatAudience; clientId: string } | null = null;
  let earlier: Promise<void> | null = null;

  const live = () => !disposed && current();
  function set(patch: Partial<ChatState>) {
    if (disposed) return;
    state = { ...state, ...patch, error: actionError ?? readError };
    onChange(state);
  }
  const withoutPending = (clientId: string) => state.pending.filter((p) => p.clientId !== clientId);
  const markPending = (clientId: string, failed: boolean) =>
    state.pending.map((p) => (p.clientId === clientId ? { ...p, failed } : p));

  // Every read that lands rows runs in this one line, so answers apply in the order they were asked.
  let reads: Promise<unknown> = Promise.resolve();
  function serially<T>(fn: () => Promise<T>): Promise<T> {
    const next = reads.then(fn, fn);
    reads = next.catch(() => {});
    return next;
  }
  const reader = createCoalescer(() => serially(readOnce));

  /** A read of new rows: `since` from the newest id with the overlap, or the newest page when there is no cursor. */
  async function readOnce(): Promise<void> {
    if (!live() || shut) return;
    const full = wantFull || asOf === null;
    const withSummary = full || wantSummary;
    wantFull = false;
    wantSummary = false;
    try {
      if (full) await readNewest(false);
      else {
        const page = await gateway.since(series, newestId(state.messages), changedAfter(asOf as string));
        if (!live() || shut) return;
        if (page.rows.length >= SINCE_LIMIT) {
          // A full answer may have left rows out: the list is read again, not merged (H22).
          await readNewest(true);
        } else {
          const held = new Map(state.messages.map((m) => [m.id, m.updatedAt]));
          const news = page.rows.filter((r) => (held.get(r.id) ?? seen.get(r.id)) !== r.updatedAt);
          for (const r of page.rows) if (!held.has(r.id)) seen.set(r.id, r.updatedAt);
          if (readable(page.asOf)) asOf = page.asOf;
          readError = null;
          set({
            messages: merge(state.messages, page.rows, !state.hasEarlier),
            names: { ...state.names, ...page.names },
          });
          // On the poll-only path no signal says so: a changed announcement or state moves the pinned card (K-S12).
          if (withSummary || news.some(needsSummary)) await readSummary();
        }
      }
      markRead(false);
    } catch (e) {
      if (full) wantFull = true;
      if (withSummary) wantSummary = true;
      if (live()) failed(e, "read");
    }
  }

  /** The summary and the newest page; `gap` replaces the list, otherwise `replaceOrMerge` decides (K-B1). */
  async function readNewest(gap: boolean) {
    set({ busy: true });
    const [summary, page] = await Promise.all([gateway.summary(series), gateway.messages(series, null, NEWEST_PAGE)]);
    if (!live() || shut) return;
    const messages = gap ? merge([], page.rows) : replaceOrMerge(state.messages, page.rows);
    // Where the page is the bottom of the list, its size says whether there is more before it.
    const bottom = oldestId(messages) === oldestId(page.rows);
    if (readable(page.asOf)) asOf = page.asOf;
    readError = null;
    marked = Math.max(marked, summary.lastReadId ?? 0);
    set({
      summary,
      messages,
      names: { ...state.names, ...summary.names, ...page.names },
      hasEarlier: bottom ? page.rows.length >= NEWEST_PAGE : state.hasEarlier,
      busy: false,
    });
    if (focused) {
      openChannel();
      startTimers();
    }
    armClose();
  }

  async function readSummary() {
    const summary = await gateway.summary(series);
    if (!live() || shut) return;
    marked = Math.max(marked, summary.lastReadId ?? 0);
    set({ summary, names: { ...state.names, ...summary.names } });
    armClose();
  }

  /** The newest loaded id, after a fetch while the chat is on screen, or on blur (K-S11). */
  function markRead(onBlur: boolean) {
    if (!live() || shut || !(onBlur || (focused && looking))) return;
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

  /** Not (or no longer) in this chat: the channel goes at once and nothing of the chat stays on screen (K-N1). */
  function shutOut() {
    shut = true;
    dropChannel();
    stopTimers();
    asOf = null;
    readError = CHAT_COPY.notInChat;
    actionError = null;
    set({ summary: null, names: {}, messages: [], pending: [], hasEarlier: false, busy: false });
  }

  function openChannel() {
    if (channel || shut || channelErrors >= CHANNEL_ERRORS) return;
    const entry: { token: object; handle: ChatChannel | null } = { token: {}, handle: null };
    const mine = () => channel === entry;
    channel = entry;
    subscribed = false;
    entry.handle = listen(series, {
      signal: (payload) => {
        if (mine()) heard(payload);
      },
      status: (status) => {
        if (mine()) statusOf(status);
      },
    });
    if (!mine()) entry.handle.remove();
  }

  function dropChannel() {
    const entry = channel;
    channel = null;
    subscribed = false;
    entry?.handle?.remove();
  }

  function statusOf(status: string) {
    if (status === "SUBSCRIBED") {
      subscribed = true;
      channelErrors = 0;
      void reader.trigger();
      return;
    }
    subscribed = false;
    // supabase-js's backoff rejoins by itself; the chat only gives up after three in a row (K-N6).
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      channelErrors += 1;
      if (channelErrors >= CHANNEL_ERRORS) dropChannel();
    }
  }

  function heard(payload: unknown) {
    if (!focused || shut) return;
    const p = isObject(payload) ? payload : {};
    const kind = typeof p.kind === "string" ? p.kind : "";
    const rowState = typeof p.state === "string" ? p.state : "";
    if (needsSummary({ kind, state: rowState })) wantSummary = true;
    void reader.trigger();
  }

  const closesAt = () => {
    const s = state.summary;
    return s?.open && s.closesAt ? instantOf(s.closesAt) : NaN;
  };
  /** Still open by the summary, with its close time passed by this phone's clock (K-S10). */
  const closeDue = () => timers.now() >= closesAt();
  function readClose() {
    wantSummary = true;
    void reader.trigger();
  }

  function startTimers() {
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
    poll = tick = closer = null;
  }

  /** A timer for the close itself; once it has passed, the minute tick reads until the server agrees. */
  function armClose() {
    if (closer !== null) timers.clearTimeout(closer);
    closer = null;
    if (!focused || shut) return;
    const wait = closesAt() - timers.now();
    if (!(wait > 0)) return;
    closer = timers.setTimeout(() => {
      closer = null;
      if (closeDue()) readClose();
      else armClose();
    }, Math.min(wait, MAX_DELAY));
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
    // The screen's copy wins: it knows what is being sent, and what the queue couldn't keep.
    const known = new Set(state.pending.map((p) => p.clientId));
    const all = [...state.pending, ...listed.filter((q) => !known.has(q.clientId))];
    // Stored already (the app closed before it heard back): off the queue, and not sent again.
    const stored = new Set(state.messages.map((m) => m.clientId).filter((id): id is string => id !== null));
    for (const p of all)
      if (stored.has(p.clientId) && !sending.has(p.clientId)) {
        unsaved.delete(p.clientId);
        void queue.remove(scope, p.clientId).catch(() => {});
      }
    const pending = all.filter((p) => !stored.has(p.clientId) || sending.has(p.clientId));
    set({ pending });
    for (const item of staleUnsent(pending, timers.now())) if (!sending.has(item.clientId)) void deliver(item.clientId);
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
    if (!item || !live()) {
      sending.delete(clientId);
      return false;
    }
    try {
      const row = await gateway.send(series, item.body, clientId);
      sending.delete(clientId);
      unsaved.delete(clientId);
      void queue.remove(scope, clientId).catch(() => {});
      if (live())
        set({ messages: merge(state.messages, [row], !state.hasEarlier), pending: withoutPending(clientId) });
      return true;
    } catch (e) {
      sending.delete(clientId);
      // Every refusal leaves it failed: only a tap sends it again, with the same client id.
      void queue.update(scope, clientId, { failed: true }).catch(() => {});
      if (!live()) return false;
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
    if (held?.kind === "announcement") wantSummary = true;
    void reader.trigger();
    return true;
  }

  async function readEarlier() {
    const before = oldestId(state.messages);
    if (!live() || shut || !state.hasEarlier || before === null) return;
    try {
      const page = await gateway.messages(series, before, EARLIER_PAGE);
      if (!live() || shut) return;
      set({
        messages: merge(state.messages, page.rows, true),
        names: { ...state.names, ...page.names },
        hasEarlier: page.rows.length >= EARLIER_PAGE,
      });
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

    /** The screen gained focus, or the app came back to it: read, resend, and listen. */
    focus() {
      if (disposed) return;
      if (!focused) {
        focused = true;
        channelErrors = 0;
      }
      looking = true;
      // A chat that refused this person opens its channel only once a read lets them in again.
      if (!shut) {
        openChannel();
        startTimers();
      }
      shut = false;
      wantFull = true;
      void reader.trigger().then(resend);
    },
    /** The app went to the background: nobody is looking, so nothing is marked read and nothing is polled. */
    background() {
      looking = false;
    },
    blur() {
      if (!focused) return;
      markRead(true);
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
    refresh(): Promise<void> {
      if (disposed) return Promise.resolve();
      shut = false;
      wantFull = true;
      return reader.trigger().then(resend);
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
     * Queues the message, then sends it (K-S7). True once the server has it. A message with nothing visible isn't
     * sent; one written as sign-out began is dropped; one the full queue refuses shows as not sent.
     */
    async send(body: string): Promise<boolean> {
      if (!live() || !/\S/.test(body)) return false;
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
    /** Sends a failed message again with its own client id. */
    async retry(clientId: string): Promise<boolean> {
      const item = state.pending.find((p) => p.clientId === clientId);
      if (!live() || !item || !item.failed || sending.has(clientId)) return false;
      actionError = null;
      const again = { ...item, failed: false };
      if (unsaved.has(clientId)) {
        const saved = await save(again);
        if (saved === "session" || saved === "full") {
          set({});
          return false;
        }
      } else void queue.update(scope, clientId, { failed: false }).catch(() => {});
      set({ pending: state.pending.map((p) => (p.clientId === clientId ? again : p)) });
      return deliver(clientId);
    },
    /** Takes an unsent message off this phone. */
    async discard(clientId: string): Promise<void> {
      if (sending.has(clientId)) return;
      unsaved.delete(clientId);
      set({ pending: withoutPending(clientId) });
      await queue.remove(scope, clientId).catch(() => {});
    },
    /**
     * A host's announcement. A failure keeps its client id for the same text and audience, so sending it again can't
     * make two.
     */
    async announce(body: string, audience: ChatAudience): Promise<boolean> {
      if (!live() || !/\S/.test(body)) return false;
      actionError = null;
      set({});
      const again = lastAnnounce && lastAnnounce.body === body && lastAnnounce.audience === audience;
      const clientId = again && lastAnnounce ? lastAnnounce.clientId : newId();
      lastAnnounce = { body, audience, clientId };
      try {
        const row = await gateway.announce(series, body, audience, clientId);
        if (lastAnnounce?.clientId === clientId) lastAnnounce = null;
        if (!live()) return true;
        set({ messages: merge(state.messages, [row], !state.hasEarlier) });
        readClose();
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
 * its leave) is removed first, since the client would hand it back instead of a new one.
 */
export function listenWith(client: RealtimeClientLike) {
  return (series: string, on: ChatListener): ChatChannel => {
    const name = `chat:${series}`;
    let made: RealtimeChannelLike | null = null;
    let removed = false;
    const left = client.getChannels().filter((c) => c.topic === `realtime:${name}`);
    void Promise.all(left.map((c) => client.removeChannel(c).catch(() => {}))).then(() => {
      if (removed) return;
      made = client
        .channel(name, { config: { private: true } })
        .on("broadcast", { event: "chat" }, (message) => on.signal(message?.payload))
        .subscribe((status) => on.status(status));
    });
    return {
      remove() {
        removed = true;
        if (made) void client.removeChannel(made).catch(() => {});
      },
    };
  };
}
