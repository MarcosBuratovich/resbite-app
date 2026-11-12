import type { ChatMessage, ChatNames } from "../services/chat";
import { CHAT_COPY } from "../domain/chatCopy";
import { authorName, dayLabel, linkHost, linkParts, messageLabel, systemText } from "../domain/chatRules";
import { localParts } from "../domain/whenText";
import type { EndedLine, PendingMessage } from "./chatModel";

/**
 * What a long-press (and VoiceOver's actions) offers on a row: Delete message on your own, Remove message on someone
 * else's for a host (Decision 5, K-S17), Delete unsent message on one that failed to send (K-S7). Plan 3 appends Report.
 */
export type MessageAction = "delete" | "remove" | "deleteUnsent";

/** A link in a message, with the name of its accessibility action ("Open example.com", numbered when a host repeats). */
export type FeedLink = { name: string; href: string; host: string; label: string };

/** One row of the chat's list, oldest first, with the words the screen shows and the label the screen reader says. */
export type FeedRow =
  /** A day separator, in the phone's zone (K-N4). Hidden from the screen reader: each message's label has its day (K-S14). */
  | { type: "day"; key: string; text: string }
  | {
      type: "bubble";
      key: string;
      message: ChatMessage;
      own: boolean;
      /** The name over someone else's bubble; null on your own. */
      author: string | null;
      /** False under a run of the same person's messages, where the name was just shown. */
      showAuthor: boolean;
      /** The body, or the words of a deleted or removed message. */
      text: string;
      gone: "deleted" | "removed" | null;
      label: string;
      actions: MessageAction[];
      links: FeedLink[];
    }
  | {
      type: "announcement";
      key: string;
      message: ChatMessage;
      own: boolean;
      /** "ANNOUNCEMENT · TO GOING": the audience in words (CH-08); a group's names its weekday or the group. */
      heading: string;
      text: string;
      gone: "deleted" | "removed" | null;
      label: string;
      actions: MessageAction[];
      links: FeedLink[];
    }
  /** Resbite's own line, centred and plain, read as "Resbite: …". */
  | { type: "system"; key: string; text: string; label: string }
  /** A change, a bordered chip that opens the resbite; `tail` ("Tap to see") is drawn regular and muted (H31). */
  | { type: "change"; key: string; text: string; tail: string | null; label: string }
  /**
   * A group's "Next one: Thu 20 Nov · Ana's flat", old or new. Like the change chip it carries no plan id: the screen
   * opens the summary's current occurrence, never the line's `payload.plan_id` (Decision 14, I5).
   */
  | { type: "next"; key: string; text: string; label: string }
  /** The computed "<title> ended" of a one-off or a stopped group's last one (K-S16). */
  | { type: "ended"; key: string; text: string; label: string }
  /** `closed`: the chat closed before it was sent, so it can only be deleted (H32 29). */
  | {
      type: "pending";
      key: string;
      clientId: string;
      body: string;
      failed: boolean;
      closed: boolean;
      label: string;
      actions: MessageAction[];
    };

export type FeedContext = {
  names: ChatNames;
  viewerId: string;
  /** For "today" in the labels. */
  now: number;
  /** The phone's zone: stamps and day separators (K-N4). */
  zone: string;
  /** The resbite's title, for its ended line. */
  title: string;
  /** The reader is the owner or an admin (`summary.host`). */
  host: boolean;
  /** The chat is closed (`!summary.open`): nothing unsent can be sent any more. */
  closed?: boolean;
  /** The chat is a group's (`summary.isGroup`): its lines and announcements take the group's words (plan 2). */
  group: boolean;
  /** The group's weekday, "Thursday" (`groupDay(summary)`), for its announcements' audience. */
  day: string;
};

/** Nothing said yet: no message, announcement or unsent one, whatever Resbite's lines say (H31 Q3). */
export const nothingSaid = (rows: FeedRow[]): boolean =>
  !rows.some((r) => r.type === "bubble" || r.type === "announcement" || r.type === "pending");

/** A message's links, each an action; a host that comes again is numbered, so two can be told apart (H32 Q13). */
function linksOf(text: string): FeedLink[] {
  const seen = new Map<string, number>();
  return linkParts(text)
    .filter((p): p is { text: string; href: string } => !!p.href)
    .map((p, i) => {
      const host = linkHost(p.href);
      const n = (seen.get(host) ?? 0) + 1;
      seen.set(host, n);
      return { name: `link:${i}`, href: p.href, host, label: CHAT_COPY.openLink(host, n) };
    });
}

/** Delete for your own sent message or announcement, Remove for a host on anyone else's; nothing on what's gone. */
export function messageActions(m: ChatMessage, viewerId: string, host: boolean): MessageAction[] {
  if ((m.kind !== "message" && m.kind !== "announcement") || m.state !== "sent") return [];
  if (m.authorId !== null && m.authorId === viewerId) return ["delete"];
  return host ? ["remove"] : [];
}

const goneOf = (m: ChatMessage) => (m.state === "deleted" || m.state === "removed" ? m.state : null);
const wordsOf = (m: ChatMessage) => (m.state === "deleted" ? CHAT_COPY.deleted : m.state === "removed" ? CHAT_COPY.removed : (m.body ?? ""));

/** An unsent message as the row it will become, for its label: yours, now, with its send state. */
const asMessage = (p: PendingMessage, viewerId: string): ChatMessage => ({
  id: 0,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: p.body,
  state: "sent",
  authorId: viewerId,
  createdAt: p.createdAt,
  updatedAt: p.createdAt,
  clientId: p.clientId,
});

/** The ended line as the stored line the roll writes for a group (plan 2), so it is worded and read the same way. */
const asEndedLine = (e: EndedLine, title: string): ChatMessage => ({
  id: 0,
  kind: "system",
  audience: null,
  event: "ended",
  payload: { title },
  body: null,
  state: "sent",
  authorId: null,
  createdAt: e.at,
  updatedAt: e.at,
  clientId: null,
});

/**
 * The list's rows, oldest first: `items` (the screen's `withEndedLine(withPending(messages, pending), …)`) worded with
 * `chatRules`, a day separator before each day's first row, and the actions each row offers. A row the build can't
 * word (an unknown kind, event or state) is left out (H20). The screen reverses it for its inverted list.
 */
export function chatFeed(items: Array<ChatMessage | PendingMessage | EndedLine>, ctx: FeedContext): FeedRow[] {
  const { names, viewerId, now, zone, title, host, closed = false, group, day: weekday } = ctx;
  const rows: FeedRow[] = [];
  let day: string | null = null;
  let lastAuthor: string | null = null;
  // A separator is keyed by the row it opens, so a day that comes back (an old unsent message after newer ones, a late
  // commit across midnight) is a separator of its own (H31).
  const place = (at: string, row: FeedRow) => {
    const date = Number.isFinite(Date.parse(at)) ? localParts(at, zone).date : null;
    if (date && date !== day) {
      day = date;
      lastAuthor = null;
      rows.push({ type: "day", key: `day:${row.key}`, text: dayLabel(at, zone, now) });
    }
    rows.push(row);
  };
  for (const item of items) {
    if (item.kind === "pending") {
      const state = closed ? "closed" : item.failed ? "failed" : "sending";
      const label = messageLabel(asMessage(item, viewerId), names, viewerId, now, zone, state, group, weekday);
      if (!label) continue;
      place(item.createdAt, {
        type: "pending",
        key: `p:${item.clientId}`,
        clientId: item.clientId,
        body: item.body,
        failed: item.failed,
        closed,
        label,
        actions: closed || item.failed ? ["deleteUnsent"] : [],
      });
      lastAuthor = null;
      continue;
    }
    if (item.kind === "ended") {
      const line = asEndedLine(item, title);
      const label = messageLabel(line, names, viewerId, now, zone, undefined, group, weekday);
      const text = systemText(line, names, viewerId, group, title);
      if (!label || !text) continue;
      place(item.at, { type: "ended", key: "ended", text, label });
      lastAuthor = null;
      continue;
    }
    const m = item;
    // A sent row with no words draws nothing (H32 Q8).
    if ((m.kind === "message" || m.kind === "announcement") && m.state === "sent" && m.body === null) continue;
    const label = messageLabel(m, names, viewerId, now, zone, undefined, group, weekday);
    if (!label) continue;
    const key = `m:${m.id}`;
    if (m.kind === "system") {
      const line = systemText(m, names, viewerId, group, title);
      if (!line) continue;
      if (m.event === "next") place(m.createdAt, { type: "next", key, text: line, label });
      else if (m.event === "changed") {
        // Someone else's change says where the tap goes; yours doesn't (the mockup).
        const actor = m.payload && typeof m.payload.actor === "string" ? m.payload.actor : null;
        const tail = actor === viewerId ? null : CHAT_COPY.tapToSee;
        place(m.createdAt, { type: "change", key, text: line, tail, label: tail ? `${label} · ${tail}` : label });
      } else place(m.createdAt, { type: "system", key, text: line, label });
      lastAuthor = null;
      continue;
    }
    const own = m.authorId !== null && m.authorId === viewerId;
    const actions = messageActions(m, viewerId, host);
    if (m.kind === "announcement") {
      place(m.createdAt, {
        type: "announcement",
        key,
        message: m,
        own,
        heading: group ? CHAT_COPY.announcementToGroup(m.audience, weekday) : CHAT_COPY.announcementTo(m.audience),
        text: wordsOf(m),
        gone: goneOf(m),
        label,
        actions,
        links: goneOf(m) ? [] : linksOf(wordsOf(m)),
      });
      lastAuthor = null;
      continue;
    }
    const before = rows.length;
    const who = own ? null : authorName(m, names, viewerId);
    place(m.createdAt, {
      type: "bubble",
      key,
      message: m,
      own,
      author: who,
      // The separator `place` may add resets the run.
      showAuthor: true,
      text: wordsOf(m),
      gone: goneOf(m),
      label,
      actions,
      links: goneOf(m) ? [] : linksOf(wordsOf(m)),
    });
    const placed = rows[rows.length - 1];
    if (placed.type === "bubble") placed.showAuthor = rows.length - before === 1 ? lastAuthor !== (m.authorId ?? "") : true;
    lastAuthor = m.authorId ?? "";
  }
  return rows;
}
