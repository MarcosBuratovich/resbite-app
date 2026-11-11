import { errorField, passThrough, planDeadline, type Deadline, type Rpc } from "./contactInvites";
import { CHAT_COPY, type ChatAudience } from "../domain/chatCopy";
import { INVITE_COPY } from "../domain/inviteCopy";

export type { ChatAudience } from "../domain/chatCopy";

/**
 * One row of a chat, as every read returns it. A system line has no author: the person who acted is `payload.actor`
 * and every other person in the payload is a uuid, named through the read's `names` (K-B2). `body` is null unless the
 * row is `sent`; `clientId` is set only on the reader's own rows.
 */
export type ChatMessage = {
  id: number;
  kind: "message" | "announcement" | "system";
  audience: ChatAudience | null;
  event: string | null;
  payload: Record<string, unknown> | null;
  body: string | null;
  state: "sent" | "deleted" | "removed";
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
  clientId: string | null;
};

/** The server's `names` map: a first name per uuid, null for someone who can't be named (shown as "Someone"). */
export type ChatNames = Record<string, string | null>;

/** A read's rows, ascending by id, with their names and the server's time of the read (the next `since` cursor). */
export type ChatPage = { rows: ChatMessage[]; names: ChatNames; asOf: string };

/** `chat_summary` in camelCase (K-S4). The screen decides "closed" only from `open`. */
export type ChatSummary = {
  seriesId: string;
  /** The current occurrence. */
  planId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  /** The plan's zone, for the header, the closing line and the closed card (K-N4). */
  timeZone: string;
  status: string;
  repeatWeeks: 1 | 2 | null;
  isGroup: boolean;
  stopped: boolean;
  /** Null means no close time (Shared interfaces); on a one-off that is a cancelled one. */
  closesAt: string | null;
  open: boolean;
  /** The reader is the owner or an admin of the current occurrence. */
  host: boolean;
  /** Going on the current occurrence, the event page's number (K-N7). */
  accepted: number;
  /** People in this chat. */
  members: number;
  /** The two announcement audiences' sizes. */
  going: number;
  everyone: number;
  pinned: ChatMessage | null;
  last: ChatMessage | null;
  names: ChatNames;
  mutedChat: boolean;
  mutedResbite: boolean;
  lastReadId: number | null;
  unread: boolean;
  /** Messages and announcements still `sent` (K-N12). */
  messageCount: number;
};

/** My resbites' view: each chat the reader is in by series, and each invitation's latest "Everyone invited" announcement by plan. */
export type ChatOverview = {
  chats: Record<string, { unread: boolean; last: ChatMessage | null; open: boolean; count: number }>;
  /** Each keeps its message id, so it can be reported from the invitation card (SHOULD 7). */
  announcements: Record<string, { id: number; authorId: string | null; body: string }>;
  names: ChatNames;
};

export type ChatGateway = {
  summary(series: string): Promise<ChatSummary>;
  /** The page ending just before `before` (the newest when there is none), at most `limit` rows. */
  messages(series: string, before?: number | null, limit?: number): Promise<ChatPage>;
  /** Rows after `after`, and rows changed after `changedAfter` (null on the first read: ids only) (K-B1). */
  since(series: string, after: number | null, changedAfter: string | null): Promise<ChatPage>;
  send(series: string, body: string, clientId: string): Promise<ChatMessage>;
  announce(series: string, body: string, audience: ChatAudience, clientId: string): Promise<ChatMessage>;
  /** A host takes someone's message down ("Message removed by an admin"); their own is deleted instead (K-N12). */
  remove(id: number): Promise<void>;
  deleteOwn(id: number): Promise<void>;
  markRead(series: string, lastId: number): Promise<void>;
  setMute(series: string, muted: boolean): Promise<void>;
  overview(): Promise<ChatOverview>;
};

type Row = {
  id: number | string;
  kind: ChatMessage["kind"];
  audience?: ChatAudience | null;
  event?: string | null;
  payload?: Record<string, unknown> | null;
  body?: string | null;
  state: ChatMessage["state"];
  author_id?: string | null;
  created_at: string;
  updated_at: string;
  client_id?: string | null;
};
type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data => typeof value === "object" && value !== null && !Array.isArray(value);
const names = (value: unknown): ChatNames => (isObject(value) ? (value as ChatNames) : {});
const count = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

function chatMessage(value: unknown): ChatMessage {
  if (!isObject(value)) throw Error("Unexpected chat row");
  const row = value as Row;
  return {
    id: Number(row.id),
    kind: row.kind,
    audience: row.audience ?? null,
    event: row.event ?? null,
    payload: row.payload ?? null,
    body: row.body ?? null,
    state: row.state,
    authorId: row.author_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientId: row.client_id ?? null,
  };
}
const optionalMessage = (value: unknown): ChatMessage | null => (value ? chatMessage(value) : null);

function page(data: unknown): ChatPage {
  if (!isObject(data) || typeof data.as_of !== "string") throw Error("Unexpected chat page");
  return {
    rows: (Array.isArray(data.rows) ? data.rows : []).map(chatMessage),
    names: names(data.names),
    asOf: data.as_of,
  };
}

function summary(data: unknown): ChatSummary {
  if (!isObject(data)) throw Error("Unexpected chat summary");
  const repeat = data.repeat_weeks;
  return {
    seriesId: data.series_id as string,
    planId: data.plan_id as string,
    title: data.title as string,
    startsAt: data.starts_at as string,
    endsAt: (data.ends_at as string | null) ?? null,
    timeZone: data.time_zone as string,
    status: data.status as string,
    repeatWeeks: repeat === 1 || repeat === 2 ? repeat : null,
    isGroup: data.is_group === true,
    stopped: data.stopped === true,
    closesAt: (data.closes_at as string | null) ?? null,
    open: data.open === true,
    host: data.host === true,
    accepted: count(data.accepted),
    members: count(data.members),
    going: count(data.going),
    everyone: count(data.everyone),
    pinned: optionalMessage(data.pinned),
    last: optionalMessage(data.last),
    names: names(data.names),
    mutedChat: data.muted_chat === true,
    mutedResbite: data.muted_resbite === true,
    lastReadId: data.last_read_id == null ? null : Number(data.last_read_id),
    unread: data.unread === true,
    messageCount: count(data.message_count),
  };
}

function overview(data: unknown): ChatOverview {
  const d = isObject(data) ? data : {};
  const chats: ChatOverview["chats"] = {};
  for (const [series, c] of Object.entries(isObject(d.chats) ? d.chats : {})) {
    const chat = isObject(c) ? c : {};
    chats[series] = {
      unread: chat.unread === true,
      last: optionalMessage(chat.last),
      open: chat.open === true,
      count: count(chat.count),
    };
  }
  const announcements: ChatOverview["announcements"] = {};
  for (const [plan, a] of Object.entries(isObject(d.announcements) ? d.announcements : {})) {
    if (!isObject(a)) continue;
    announcements[plan] = {
      id: Number(a.id),
      authorId: (a.author_id as string | null) ?? null,
      body: (a.body as string | null) ?? "",
    };
  }
  return { chats, announcements, names: names(d.names) };
}

/** The chat's reads and writes; a refusal is thrown as the server sent it, as `connectionGateway` does. */
export function createChatGateway(rpc: Rpc, deadline: Deadline = passThrough): ChatGateway {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await deadline((signal) => rpc(fn, args, signal));
    if (error) throw error;
    return data;
  }
  return {
    summary: async (series) => summary(await call("chat_summary", { p_series: series })),
    messages: async (series, before = null, limit = 50) =>
      page(await call("chat_messages", { p_series: series, p_before: before ?? null, p_limit: limit })),
    since: async (series, after, changedAfter) =>
      page(await call("chat_messages_since", { p_series: series, p_after: after, p_changed_after: changedAfter })),
    send: async (series, body, clientId) =>
      chatMessage(await call("send_message", { p_series: series, p_body: body, p_client_id: clientId })),
    announce: async (series, body, audience, clientId) =>
      chatMessage(
        await call("send_announcement", { p_series: series, p_body: body, p_audience: audience, p_client_id: clientId }),
      ),
    remove: async (id) => void (await call("remove_message", { p_id: id })),
    deleteOwn: async (id) => void (await call("delete_message", { p_id: id })),
    markRead: async (series, lastId) => void (await call("mark_chat_read", { p_series: series, p_last_id: lastId })),
    setMute: async (series, muted) => void (await call("set_chat_mute", { p_series: series, p_muted: muted })),
    overview: async () => overview(await call("my_chat_overview", {})),
  };
}

// The client loads on first use, so the gateway's logic runs under node without React Native.
export const chatGateway = createChatGateway(
  async (fn, args, signal) => (await import("./supabase")).supabase.rpc(fn, args).abortSignal(signal),
  planDeadline,
);

const refusal = (e: unknown, code: string, message: string) =>
  errorField(e, "code") === code && errorField(e, "message") === message;

/** The reader is not (or no longer) in this chat: the hook drops the channel at once (K-N1). */
export const isNotInChat = (e: unknown): boolean => refusal(e, "42501", "Not in this chat");
/** The chat closed while it was open: the screen turns to the closed card, keeping the typed text (K-S10). */
export const isChatClosed = (e: unknown): boolean => refusal(e, "22023", "Chat closed");

/** Why a chat call was refused, in words; anything else, a lost connection included, keeps the connection line. */
export function chatErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  const message = errorField(e, "message");
  if (code === "42501") {
    if (message === "Not in this chat") return CHAT_COPY.notInChat;
    if (message === "Hosts only") return CHAT_COPY.hostsOnly;
    if (message === "Not your message") return CHAT_COPY.notYours;
  }
  if (code === "22023") {
    if (message === "Chat closed") return CHAT_COPY.closedShort;
    if (message === "Slow down" || message === "Too fast") return CHAT_COPY.slowDown;
    if (message === "Invalid message") return CHAT_COPY.invalid;
  }
  return INVITE_COPY.offline;
}
