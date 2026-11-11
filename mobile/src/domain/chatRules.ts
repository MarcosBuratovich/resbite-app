import type { ChatMessage, ChatNames, ChatSummary } from "../services/chat";
import { CHAT_COPY, type ChatAudience } from "./chatCopy";
import { UUID_PATTERN } from "./covers";
import { planEnd } from "./planEnd";
import { clockTime, localParts, shortDate } from "./whenText";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The closing line shows only in the chat's last 48 hours (CH-P15). */
const CLOSING_WINDOW = 48 * HOUR;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Sat 15 Nov". Day separators and stamps pass the phone's zone; the header and the closed card the plan's (K-N4). */
export const dayLabel = (iso: string, zone: string): string => shortDate(iso, zone);
/** "18:02" in the zone given. */
export const timeLabel = (iso: string, zone: string): string => clockTime(iso, zone);
const weekday = (iso: string, zone: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: zone }).format(new Date(iso));

/**
 * "This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?", in the plan's zone (K-N4, Decision 11). Whole
 * hours, floored; minutes in the last hour, floored; "in 1 minute" in the last one. Null with no close time, once it
 * has passed, and while it is more than 48 hours away.
 */
export function closingLine(closesAt: string | null, now: number, zone: string): string | null {
  if (!closesAt) return null;
  const left = Date.parse(closesAt) - now;
  if (!(left > 0) || left > CLOSING_WINDOW) return null;
  const hours = Math.floor(left / HOUR);
  const span = hours >= 1 ? plural(hours, "hour") : plural(Math.max(1, Math.floor(left / MINUTE)), "minute");
  return `This chat closes ${dayLabel(closesAt, zone)} at ${timeLabel(closesAt, zone)}, in ${span}. Any final words?`;
}

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * A person in a line: "You" (or "you" after a verb) for the reader, their first name from `names`, else "Someone" —
 * a uuid the read could not name (a deleted, deleting or folded account) or one missing from the map (K-B2).
 */
function person(id: unknown, names: ChatNames, viewerId: string, subject = true): string {
  const uuid = text(id);
  if (uuid && uuid === viewerId) return subject ? CHAT_COPY.you : CHAT_COPY.you.toLowerCase();
  return (uuid && names[uuid]) || CHAT_COPY.someone;
}

/**
 * How a start or an end moved, each read in its own zone: "19:00 → 19:30" on the same day, "Fri 19:00 → Sat 19:00"
 * within the week, and with the dates ("Fri 14 Nov 19:00 → Fri 21 Nov 19:00") a week or more apart, where the weekday
 * alone would read the same twice. Null when both read the same (a zone fix).
 */
function moved(from: string, fromZone: string, to: string, toZone: string): string | null {
  const a = localParts(from, fromZone);
  const b = localParts(to, toZone);
  if (a.date === b.date && a.time === b.time) return null;
  if (a.date === b.date) return `${a.time} → ${b.time}`;
  const label = Math.abs(Date.parse(b.date) - Date.parse(a.date)) < 7 * DAY ? weekday : shortDate;
  return `${label(from, fromZone)} ${a.time} → ${label(to, toZone)} ${b.time}`;
}

/**
 * How the end moved: null when it didn't; "" when it was taken away; the new end alone when there was none.
 */
function endMoved(from: string | null, fromZone: string, to: string | null, toZone: string): string | null {
  if (from && to) return moved(from, fromZone, to, toZone);
  if (to) return timeLabel(to, toZone);
  return from ? "" : null;
}

const withDetail = (head: string, ...details: (string | null)[]) =>
  [head, ...details.filter((d): d is string => !!d)].join(" · ");

/** A `changed` line (K-S3): the payload's starts, ends and zones, and the new place label, as the mockup shows. */
function changedText(p: Record<string, unknown>, who: string | null): string {
  const by = (verb: string, nobody: string) => (who ? `${who} ${verb}` : nobody);
  const fromZone = text(p.from_zone) ?? text(p.to_zone) ?? "UTC";
  const toZone = text(p.to_zone) ?? fromZone;
  const fromStart = text(p.from_start);
  const toStart = text(p.to_start);
  const label = typeof p.place_label === "string" ? text(p.place_label.trim()) : null;
  if (p.what === "place") return withDetail(by("changed the place", "The place changed"), label);
  if (p.what === "time_place") {
    const when = toStart ? `${weekday(toStart, toZone)} ${timeLabel(toStart, toZone)}` : null;
    return withDetail(by("changed the time and place", "The time and place changed"), when, label);
  }
  if (p.what !== "time") return "";
  const start = fromStart && toStart ? moved(fromStart, fromZone, toStart, toZone) : null;
  if (start) return withDetail(by("changed the time", "The time changed"), start);
  const end = endMoved(text(p.from_end), fromZone, text(p.to_end), toZone);
  if (end !== null) return withDetail(by("changed the end", "The end changed"), end);
  return by("changed the time", "The time changed");
}

/**
 * Resbite's own line, worded on the phone (Decision 1, K-B2). A person is named through `names`, "Someone" when the read
 * could not name them, and "You" when they are the reader. `group` is plan 2's (its group wording); `title` names an
 * `ended` line whose payload has none. An event this build does not know gives no line ("").
 */
export function systemText(m: ChatMessage, names: ChatNames, viewerId: string, group: boolean, title: string): string {
  const p = m.payload ?? {};
  const actor = text(p.actor);
  const who = actor ? person(actor, names, viewerId) : null;
  const subject = person(p.user, names, viewerId);
  switch (m.event) {
    case "joined": {
      const bringer = text(p.brought_by);
      const brought = bringer && (bringer === viewerId || names[bringer]) ? person(bringer, names, viewerId, false) : null;
      return withDetail(`${subject} joined`, brought && `brought by ${brought}`);
    }
    case "cant_go":
      return `${subject} can’t make it`;
    case "admin":
      return text(p.user) === viewerId ? `${subject} are now an admin` : `${subject} is now an admin`;
    case "changed":
      return changedText(p, who);
    case "cancelled":
      return who ? `${who} cancelled the resbite` : "The resbite was cancelled";
    case "ended": {
      const name = text(p.title) ?? text(title);
      return name ? CHAT_COPY.ended(name) : "";
    }
    default:
      return "";
  }
}

/** The Chat row's line: "Leo: I can bring the snacks", a system line's text, or "No messages yet" (CH-P9). */
export function rowText(last: ChatMessage | null, names: ChatNames, viewerId: string, group: boolean): string {
  if (!last) return CHAT_COPY.noMessages;
  if (last.kind === "system") return systemText(last, names, viewerId, group, "");
  if (last.state === "deleted") return CHAT_COPY.deleted;
  if (last.state === "removed") return CHAT_COPY.removed;
  const body = last.body ?? "";
  if (last.kind === "announcement") return CHAT_COPY.invitationLine(person(last.authorId, names, viewerId, false), body);
  return `${person(last.authorId, names, viewerId)}: ${body}`;
}

/**
 * The header's second line: "Fri 30 Oct · 6 going", "Ended · Sat 15 Nov · 7 going" from the end on. The date is in the
 * plan's zone and the number is the event page's Going (`accepted`, K-N7).
 */
export function headerLine(summary: ChatSummary, now: number): string {
  const line = `${dayLabel(summary.startsAt, summary.timeZone)} · ${summary.accepted} going`;
  return planEnd({ starts_at: summary.startsAt, ends_at: summary.endsAt }) <= now ? `Ended · ${line}` : line;
}

/** Owners and admins announce while the chat is open (CH-P6; the server refuses anyone else). */
export const canAnnounce = (summary: ChatSummary): boolean => summary.host && summary.open;

/** The announcement sheet starts on Going on a one-off, and on everyone in a group (K-N7). */
export const defaultAudience = (summary: ChatSummary): ChatAudience => (summary.isGroup ? "everyone" : "going");

/**
 * The card in place of the field once the chat is closed (CH-06). The screen decides "closed" from `summary.open` only;
 * this picks the words from `(isGroup, stopped, status)`, and plan 2 adds the stopped group's card.
 */
export function closedCard(summary: ChatSummary): { line: string; why: string | null } {
  if (!summary.isGroup && summary.status === "cancelled") return { line: CHAT_COPY.cancelledClosed, why: null };
  if (!summary.closesAt) return { line: CHAT_COPY.closedShort, why: null };
  return { line: CHAT_COPY.closedOn(dayLabel(summary.closesAt, summary.timeZone)), why: CHAT_COPY.closedWhy };
}

/**
 * A link's host, lowercase ASCII, or null when the text is not a link this chat opens: only http and https, a host of
 * ASCII letters, digits and hyphens. A host with any other character, percent-encoded or in punycode (`xn--`) is not
 * linked, so a look-alike never gets a tap target (K-N14, Decision 15). Parsed here rather than with `URL`, whose
 * React Native version does not normalise hosts as Node's does.
 */
function hostOf(href: string): string | null {
  const m = /^https?:\/\/([^/?#]*)/i.exec(href);
  if (!m) return null;
  const authority = m[1];
  if (!/^[\x21-\x7e]*$/.test(authority)) return null;
  let host = authority.slice(authority.lastIndexOf("@") + 1);
  const port = /:\d{1,5}$/.exec(host);
  if (port) host = host.slice(0, port.index);
  host = host.toLowerCase().replace(/\.$/, "");
  if (!host) return null;
  const labels = host.split(".");
  if (labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l) || l.startsWith("xn--"))) return null;
  return host;
}

/** The lowercase ASCII host a link opens, for `CHAT_COPY.openQuestion`; "" for anything `linkParts` would not link. */
export const linkHost = (href: string): string => hostOf(href) ?? "";

const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" };
const count = (s: string, c: string) => s.split(c).length - 1;
/** Drops the punctuation a sentence puts after a link, and a closing bracket the link didn't open. */
function trimLink(raw: string): string {
  let s = raw;
  for (;;) {
    const last = s[s.length - 1];
    if (last && ".,;:!?'\"’”…".includes(last)) s = s.slice(0, -1);
    else if (last && CLOSERS[last] && count(s, last) > count(s, CLOSERS[last])) s = s.slice(0, -1);
    else return s;
  }
}

/**
 * A message's text in runs, the links among them with their `href` (K-N14). Only http and https links are linked, and
 * only with an ASCII host (Decision 15); phone numbers and every other scheme stay text (CH-P11).
 */
export function linkParts(body: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  const links = /https?:\/\/\S+/gi;
  let at = 0;
  for (let m = links.exec(body); m; m = links.exec(body)) {
    // "nothttps://…" is a word, not a link.
    if (m.index > 0 && /[A-Za-z0-9]/.test(body[m.index - 1])) continue;
    const href = trimLink(m[0]);
    if (!hostOf(href)) continue;
    if (m.index > at) parts.push({ text: body.slice(at, m.index) });
    parts.push({ text: href, href });
    at = m.index + href.length;
  }
  if (at < body.length) parts.push({ text: body.slice(at) });
  return parts;
}

/**
 * What the screen reader says for a row (K-S14): "Leo, I can bring the snacks, 18:02", with the day when it isn't today
 * in `zone` (the phone's), "You" for the reader and the send state when unsent. A system line is "Resbite: " and its
 * text; an announcement starts with its audience in words.
 */
export function messageLabel(
  m: ChatMessage,
  names: ChatNames,
  viewerId: string,
  now: number,
  zone: string,
  sending?: "sending" | "failed",
): string {
  if (m.kind === "system") return `Resbite: ${systemText(m, names, viewerId, false, "")}`;
  const words = m.state === "deleted" ? CHAT_COPY.deleted : m.state === "removed" ? CHAT_COPY.removed : (m.body ?? "");
  const today = localParts(m.createdAt, zone).date === localParts(new Date(now).toISOString(), zone).date;
  const time = timeLabel(m.createdAt, zone);
  const parts = [person(m.authorId, names, viewerId), words, today ? time : `${dayLabel(m.createdAt, zone)}, ${time}`];
  if (m.kind === "announcement") parts.unshift(CHAT_COPY.announcementLabel(m.audience));
  if (sending) parts.push(sending === "sending" ? CHAT_COPY.sending : CHAT_COPY.notSent);
  return parts.join(", ");
}

const SERIES_ID = new RegExp(`^${UUID_PATTERN}$`);
/** A series id as the server writes it, lowercase, which the route checks before any call (K-N14). */
export const isSeriesId = (value: unknown): value is string => typeof value === "string" && SERIES_ID.test(value);
