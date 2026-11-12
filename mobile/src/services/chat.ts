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
  /**
   * The occurrence the row belongs to (`plan_id`), when the read says so (chat plan 2's `chat_row`). A group's
   * announcement names this week's day only for the current occurrence's; a row without it reads as current.
   */
  planId?: string | null;
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
  /**
   * Leaves a group (`leave_series`, G-N13): out of its chat and off its next ones. Refused for anyone not in the group, a
   * host or the owner (`chatErrorMessage` words each).
   */
  leave(series: string): Promise<void>;
};

type Data = Record<string, unknown>;

// The server's answer is read defensively (H20): a row without a usable id is dropped, a number that isn't one reads
// as 0, and text that isn't text reads as empty, so one odd value never blanks a chat or poisons a cursor.
const isObject = (value: unknown): value is Data => typeof value === "object" && value !== null && !Array.isArray(value);
const names = (value: unknown): ChatNames => (isObject(value) ? (value as ChatNames) : {});
const finite = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};
const count = (value: unknown): number => finite(value) ?? 0;
const idOf = (value: unknown): number | null => {
  const n = finite(value);
  return n !== null && Number.isSafeInteger(n) && n > 0 ? n : null;
};
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

const STAMP = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d(?::?\d\d)?)$/;
/**
 * A server time as any phone can read it (H24, H26): Postgres writes up to six fractional digits and drops trailing
 * zeros, and a `Date.parse` may take exactly three. The fraction is cut (never rounded) or padded to milliseconds.
 * Anything that isn't a time is left as it is.
 */
export function serverTime(value: string): string {
  const m = STAMP.exec(value);
  if (!m || m[2] === undefined) return value;
  return `${m[1]}.${(m[2] + "00").slice(0, 3)}${m[3]}`;
}
const timeOf = (value: unknown): string => serverTime(textOf(value));
const timeOrNull = (value: unknown): string | null => (typeof value === "string" ? serverTime(value) : null);
/** A change line's times are stamps too; its other values (a place label, names) are left alone. */
function payloadOf(value: Data): Data {
  const out: Data = {};
  for (const [k, v] of Object.entries(value)) out[k] = typeof v === "string" ? serverTime(v) : v;
  return out;
}

/** A row as the app holds it; null when it has no usable id. An unknown kind or state is kept, and shows no body. */
function chatMessage(value: unknown): ChatMessage | null {
  if (!isObject(value)) return null;
  const id = idOf(value.id);
  if (id === null) return null;
  return {
    id,
    kind: textOf(value.kind) as ChatMessage["kind"],
    audience: value.audience === "going" || value.audience === "everyone" ? value.audience : null,
    event: textOrNull(value.event),
    payload: isObject(value.payload) ? payloadOf(value.payload) : null,
    body: textOrNull(value.body),
    state: textOf(value.state) as ChatMessage["state"],
    authorId: textOrNull(value.author_id),
    createdAt: timeOf(value.created_at),
    updatedAt: timeOf(value.updated_at),
    clientId: textOrNull(value.client_id),
    // Only when the read names one, so a read from before plan 2 gives rows exactly as it did.
    ...(typeof value.plan_id === "string" && value.plan_id !== "" ? { planId: value.plan_id } : {}),
  };
}
const rows = (value: unknown): ChatMessage[] =>
  (Array.isArray(value) ? value : []).map(chatMessage).filter((m): m is ChatMessage => m !== null);
function sentRow(value: unknown): ChatMessage {
  const m = chatMessage(value);
  if (!m) throw Error("Unexpected chat row");
  return m;
}

function page(data: unknown): ChatPage {
  if (!isObject(data) || typeof data.as_of !== "string") throw Error("Unexpected chat page");
  return { rows: rows(data.rows), names: names(data.names), asOf: serverTime(data.as_of) };
}

/** A summary missing its start or zone reads them as empty, and the header and closing lines hide (H20). */
function summary(data: unknown): ChatSummary {
  if (!isObject(data)) throw Error("Unexpected chat summary");
  const repeat = data.repeat_weeks;
  return {
    seriesId: textOf(data.series_id),
    planId: textOf(data.plan_id),
    title: textOf(data.title),
    startsAt: timeOf(data.starts_at),
    endsAt: timeOrNull(data.ends_at),
    timeZone: textOf(data.time_zone),
    status: textOf(data.status),
    repeatWeeks: repeat === 1 || repeat === 2 ? repeat : null,
    isGroup: data.is_group === true,
    stopped: data.stopped === true,
    closesAt: timeOrNull(data.closes_at),
    open: data.open === true,
    host: data.host === true,
    accepted: count(data.accepted),
    members: count(data.members),
    going: count(data.going),
    everyone: count(data.everyone),
    pinned: chatMessage(data.pinned),
    last: chatMessage(data.last),
    names: names(data.names),
    mutedChat: data.muted_chat === true,
    mutedResbite: data.muted_resbite === true,
    lastReadId: finite(data.last_read_id),
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
      last: chatMessage(chat.last),
      open: chat.open === true,
      count: count(chat.count),
    };
  }
  const announcements: ChatOverview["announcements"] = {};
  for (const [plan, a] of Object.entries(isObject(d.announcements) ? d.announcements : {})) {
    const id = isObject(a) ? idOf(a.id) : null;
    if (!isObject(a) || id === null) continue;
    announcements[plan] = { id, authorId: textOrNull(a.author_id), body: textOf(a.body) };
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
      sentRow(await call("send_message", { p_series: series, p_body: body, p_client_id: clientId })),
    announce: async (series, body, audience, clientId) =>
      sentRow(
        await call("send_announcement", { p_series: series, p_body: body, p_audience: audience, p_client_id: clientId }),
      ),
    remove: async (id) => void (await call("remove_message", { p_id: id })),
    deleteOwn: async (id) => void (await call("delete_message", { p_id: id })),
    markRead: async (series, lastId) => void (await call("mark_chat_read", { p_series: series, p_last_id: lastId })),
    setMute: async (series, muted) => void (await call("set_chat_mute", { p_series: series, p_muted: muted })),
    overview: async () => overview(await call("my_chat_overview", {})),
    leave: async (series) => void (await call("leave_series", { p_series: series })),
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

/** The reader isn't (or no longer) a host: the summary is read again, so Announce goes (H32 36). */
export const isHostsOnly = (e: unknown): boolean => refusal(e, "42501", "Hosts only");
/** An announcement within a minute of the last one (K-S8): its own words, not the messages line (H32 Q35). */
export const isTooFast = (e: unknown): boolean => refusal(e, "22023", "Too fast");

/** Why a chat call was refused, in words; anything else, a lost connection included, keeps the connection line. */
export function chatErrorMessage(e: unknown): string {
  const code = errorField(e, "code");
  const message = errorField(e, "message");
  if (code === "42501") {
    if (message === "Not in this chat") return CHAT_COPY.notInChat;
    if (message === "Hosts only") return CHAT_COPY.hostsOnly;
    if (message === "Not your message") return CHAT_COPY.notYours;
    // Leaving a group (G-N13); the server's words keep the straight apostrophe.
    if (message === "Not in this group") return CHAT_COPY.notInGroup;
    if (message === "Hosts can't leave") return CHAT_COPY.hostsCantLeave;
    if (message === "Owner can't leave") return CHAT_COPY.ownerCantLeave;
  }
  if (code === "22023") {
    if (message === "Chat closed") return CHAT_COPY.closedShort;
    if (message === "Slow down" || message === "Too fast") return CHAT_COPY.slowDown;
    if (message === "Invalid message") return CHAT_COPY.invalid;
  }
  return INVITE_COPY.offline;
}
