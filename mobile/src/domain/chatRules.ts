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
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

// Bad input never throws (H20): a zone this phone doesn't know reads in the phone's own zone, and a time that can't be
// read is left out of the line.
const phoneZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const zoneChecks = new Map<string, boolean>();
function knownZone(zone: string): boolean {
  let known = zoneChecks.get(zone);
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: zone });
      known = true;
    } catch {
      known = false;
    }
    zoneChecks.set(zone, known);
  }
  return known;
}
const zoneOr = (zone: unknown): string => (typeof zone === "string" && zone !== "" && knownZone(zone) ? zone : phoneZone());
/** ISO text the phone can read as an instant, else null. */
const instant = (iso: unknown): string | null =>
  typeof iso === "string" && Number.isFinite(Date.parse(iso)) ? iso : null;

/** "Sat 15 Nov". Day separators and stamps pass the phone's zone; the header and the closed card the plan's (K-N4). */
export function dayLabel(iso: string, zone: string): string {
  const at = instant(iso);
  return at ? shortDate(at, zoneOr(zone)) : "";
}
/** "18:02" in the zone given. */
export function timeLabel(iso: string, zone: string): string {
  const at = instant(iso);
  return at ? clockTime(at, zoneOr(zone)) : "";
}
const weekday = (iso: string, zone: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: zoneOr(zone) }).format(new Date(iso));
const localDate = (iso: string, zone: string) => localParts(iso, zoneOr(zone));

/**
 * "This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?", in the plan's zone (K-N4, Decision 11). Whole
 * hours, floored; minutes in the last hour, floored; "in 1 minute" in the last one. Null with no close time, once it
 * has passed, while it is more than 48 hours away, and when the plan's zone is missing (H20).
 */
export function closingLine(closesAt: string | null, now: number, zone: string): string | null {
  if (!closesAt || !text(zone)) return null;
  const left = Date.parse(closesAt) - now;
  if (!(left > 0) || left > CLOSING_WINDOW) return null;
  const hours = Math.floor(left / HOUR);
  const span = hours >= 1 ? plural(hours, "hour") : plural(Math.max(1, Math.floor(left / MINUTE)), "minute");
  return `This chat closes ${dayLabel(closesAt, zone)} at ${timeLabel(closesAt, zone)}, in ${span}. Any final words?`;
}

// Text a person wrote, cleaned for a line as a push's is (H18): well formed, no bidi, zero-width or format
// characters, no controls, white space collapsed.
const FORMAT = /[­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
function wellFormed(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) out += s[i] + s[++i];
    } else if (c < 0xdc00 || c > 0xdfff) out += s[i];
  }
  return out;
}
function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return wellFormed(value).replace(FORMAT, "").replace(/\s/g, " ").replace(CONTROL, "").replace(/ +/g, " ").trim();
}
/** A first name for a line: cleaned, without trailing ":", "," or ";" (H18). Blank reads as no name. */
const cleanName = (value: unknown): string => cleanText(value).replace(/[:;,]+$/, "").trim();

/** The name the read gave a uuid, from the map's own keys only (H20), cleaned; "" when there is none. */
const nameOf = (uuid: string | null, names: ChatNames): string =>
  uuid && isObject(names) && Object.prototype.hasOwnProperty.call(names, uuid) ? cleanName(names[uuid]) : "";

/**
 * A person in a line: "You" (or "you" after a verb) for the reader, their first name from `names`, else "Someone" —
 * a uuid the read could not name (a deleted, deleting or folded account) or one missing from the map (K-B2).
 */
function person(id: unknown, names: ChatNames, viewerId: string, subject = true): string {
  const uuid = text(id);
  if (uuid && uuid === viewerId) return subject ? CHAT_COPY.you : CHAT_COPY.you.toLowerCase();
  return nameOf(uuid, names) || CHAT_COPY.someone;
}

/**
 * How a start or an end moved, each read in its own zone: "19:00 → 19:30" on the same day, "Fri 19:00 → Sat 19:00"
 * within the week, and with the dates ("Fri 14 Nov 19:00 → Fri 21 Nov 19:00") a week or more apart, where the weekday
 * alone would read the same twice. Null when both read the same.
 */
function moved(from: string, fromZone: string, to: string, toZone: string): string | null {
  const a = localDate(from, fromZone);
  const b = localDate(to, toZone);
  if (a.date === b.date && a.time === b.time) return null;
  if (a.date === b.date) return `${a.time} → ${b.time}`;
  const label = Math.abs(Date.parse(b.date) - Date.parse(a.date)) < 7 * DAY ? weekday : dayLabel;
  return `${label(from, fromZone)} ${a.time} → ${label(to, toZone)} ${b.time}`;
}

/** Both ends, each an instant or null for none; null when one is there but can't be read. */
function ends(from: unknown, to: unknown): [string | null, string | null] | null {
  const read = (v: unknown) => (v == null ? null : (instant(v) ?? undefined));
  const a = read(from);
  const b = read(to);
  return a === undefined || b === undefined ? null : [a, b];
}

const withDetail = (head: string, ...details: (string | null)[]) =>
  [head, ...details.filter((d): d is string => !!d)].join(" · ");

/** A `changed` line (K-S3): the payload's starts, ends and zones, and the new place label, as the mockup shows. */
function changedText(p: Record<string, unknown>, who: string | null): string {
  const by = (verb: string, nobody: string) => (who ? `${who} ${verb}` : nobody);
  const fromZoneGiven = text(p.from_zone);
  const toZoneGiven = text(p.to_zone);
  const fromZone = zoneOr(fromZoneGiven ?? toZoneGiven);
  const toZone = zoneOr(toZoneGiven ?? fromZoneGiven);
  const label = cleanText(p.place_label) || null;
  if (p.what === "place") return withDetail(by("changed the place", "The place changed"), label);
  if (p.what === "time_place") {
    const to = instant(p.to_start);
    const when = to ? `${weekday(to, toZone)} ${timeLabel(to, toZone)}` : null;
    return withDetail(by("changed the time and place", "The time and place changed"), when, label);
  }
  if (p.what !== "time") return "";
  const fromStart = instant(p.from_start);
  const toStart = instant(p.to_start);
  const sameStart = !!fromStart && !!toStart && Date.parse(fromStart) === Date.parse(toStart);
  if (fromStart && toStart && !sameStart) {
    const start = moved(fromStart, fromZone, toStart, toZone);
    if (start) return withDetail(by("changed the time", "The time changed"), start);
  }
  const end = ends(p.from_end, p.to_end);
  if (end) {
    const [from, to] = end;
    const sameEnd = from && to ? Date.parse(from) === Date.parse(to) : from === to;
    if (!sameEnd) {
      // "" when the end was taken away; the new end alone when there was none.
      const detail = from && to ? moved(from, fromZone, to, toZone) : to ? timeLabel(to, toZone) : "";
      if (detail !== null) return withDetail(by("changed the end", "The end changed"), detail);
    } else if (sameStart && fromZoneGiven && toZoneGiven && fromZoneGiven !== toZoneGiven) {
      // The same instants in a new zone: the clock didn't move, the zone did (H20).
      return by("changed the time zone", "The time zone changed");
    }
  }
  return by("changed the time", "The time changed");
}

/**
 * Resbite's own line, worded on the phone (Decision 1, K-B2). A person is named through `names`, "Someone" when the read
 * could not name them, and "You" when they are the reader. `group` is plan 2's (its group wording); `title` names an
 * `ended` line whose payload has none. An event this build does not know gives no line ("").
 */
export function systemText(m: ChatMessage, names: ChatNames, viewerId: string, group: boolean, title: string): string {
  const p = isObject(m.payload) ? m.payload : {};
  const actor = text(p.actor);
  const who = actor ? person(actor, names, viewerId) : null;
  const subject = person(p.user, names, viewerId);
  switch (m.event) {
    case "joined": {
      const bringer = text(p.brought_by);
      const brought = bringer && (bringer === viewerId || nameOf(bringer, names)) ? person(bringer, names, viewerId, false) : null;
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
      const name = cleanText(p.title) || cleanText(title);
      return name ? CHAT_COPY.ended(name) : "";
    }
    default:
      return "";
  }
}

/** The words of a person's row by its state; null for a kind or a state this build doesn't know (fails closed, H20). */
function words(m: ChatMessage): string | null {
  if (m.kind !== "message" && m.kind !== "announcement") return null;
  if (m.state === "deleted") return CHAT_COPY.deleted;
  if (m.state === "removed") return CHAT_COPY.removed;
  return m.state === "sent" ? (m.body ?? "") : null;
}

/**
 * The Chat row's line: "Leo: I can bring the snacks", a system line's text, or "No messages yet" (CH-P9). Null for a
 * line it can't word, so the row shows no preview line (H20).
 */
export function rowText(last: ChatMessage | null, names: ChatNames, viewerId: string, group: boolean): string | null {
  if (!last) return CHAT_COPY.noMessages;
  if (last.kind === "system") return systemText(last, names, viewerId, group, "") || null;
  const shown = words(last);
  if (shown === null || last.state !== "sent") return shown;
  if (last.kind === "announcement") return CHAT_COPY.invitationLine(person(last.authorId, names, viewerId, false), shown);
  return `${person(last.authorId, names, viewerId)}: ${shown}`;
}

/**
 * The header's second line: "Fri 30 Oct · 6 going", "Ended · Sat 15 Nov · 7 going" from the end on, and "Cancelled" for
 * a cancelled one-off (H20). The date is in the plan's zone and the number is the event page's Going (`accepted`,
 * K-N7). Null when the summary has no start or no zone (H20).
 */
export function headerLine(summary: ChatSummary, now: number): string | null {
  if (!summary.isGroup && summary.status === "cancelled") return CHAT_COPY.cancelled;
  const start = instant(summary.startsAt);
  if (!start || !text(summary.timeZone)) return null;
  const going = Number.isFinite(summary.accepted) ? summary.accepted : 0;
  const line = `${dayLabel(start, summary.timeZone)} · ${going} going`;
  return planEnd({ starts_at: start, ends_at: instant(summary.endsAt) }) <= now ? `Ended · ${line}` : line;
}

/** Owners and admins announce while the chat is open (CH-P6; the server refuses anyone else). */
export const canAnnounce = (summary: ChatSummary): boolean => summary.host === true && summary.open === true;

/** The announcement sheet starts on Going on a one-off, and on everyone in a group (K-N7). */
export const defaultAudience = (summary: ChatSummary): ChatAudience => (summary.isGroup ? "everyone" : "going");

/**
 * The card in place of the field once the chat is closed (CH-06). The screen decides "closed" from `summary.open` only;
 * this picks the words from `(isGroup, stopped, status)`, and plan 2 adds the stopped group's card.
 */
export function closedCard(summary: ChatSummary): { line: string; why: string | null } {
  if (!summary.isGroup && summary.status === "cancelled") return { line: CHAT_COPY.cancelledClosed, why: null };
  const closes = instant(summary.closesAt);
  if (!closes) return { line: CHAT_COPY.closedShort, why: null };
  return { line: CHAT_COPY.closedOn(dayLabel(closes, summary.timeZone)), why: CHAT_COPY.closedWhy };
}

/** A control, bidi, zero-width or format character anywhere in a link keeps it plain (H20). */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/;

/**
 * A link's host, lowercase, or null when the text is not a link this chat opens (K-N14, Decision 15, H20):
 * - only http and https;
 * - an authority of ASCII letters, digits, dots and hyphens with an optional port up to 65535, so a user part (`@`),
 *   a backslash, a percent-encoding or any other character keeps it plain: each can make the host read differently
 *   from the one a browser opens;
 * - a domain: two labels or more, the last of letters only, so no IP address in any form and no single label;
 * - no punycode (`xn--`) label and no `localhost`.
 * Parsed here rather than with `URL`, whose React Native version does not normalise hosts as Node's does.
 */
function hostOf(href: string): string | null {
  if (UNSAFE.test(href)) return null;
  const authority = /^https?:\/\/([^/?#]*)/i.exec(href)?.[1];
  const parts = authority === undefined ? null : /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!parts || (parts[2] !== undefined && Number(parts[2]) > 65535)) return null;
  const host = parts[1].toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  const last = labels[labels.length - 1];
  if (labels.length < 2 || !/^[a-z]{2,63}$/.test(last) || last === "localhost") return null;
  if (labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l) || l.startsWith("xn--"))) return null;
  return host;
}

/** The lowercase host a link opens, for `CHAT_COPY.openQuestion`; "" for anything `linkParts` would not link. */
export const linkHost = (href: string): string => hostOf(href) ?? "";

const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const count = (s: string, c: string) => s.split(c).length - 1;
/** Drops the punctuation a sentence puts after a link, and a closing bracket the link didn't open. */
function trimLink(raw: string): string {
  let s = raw;
  for (;;) {
    const last = s[s.length - 1];
    if (last && ".,;:!?'’”…".includes(last)) s = s.slice(0, -1);
    else if (last && CLOSERS[last] && count(s, last) > count(s, CLOSERS[last])) s = s.slice(0, -1);
    else return s;
  }
}

/**
 * A message's text in runs, the links among them with their `href` (K-N14). Only http and https links to a domain
 * are linked (`hostOf`); phone numbers and every other scheme stay text (CH-P11). A link stops at white space, `"`,
 * `<` and `>` (H20).
 */
export function linkParts(body: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  const links = /https?:\/\/[^\s"<>]+/gi;
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
 * text; an announcement starts with its audience in words. A time that can't be read is left out; null for a line it
 * can't word (H20).
 */
export function messageLabel(
  m: ChatMessage,
  names: ChatNames,
  viewerId: string,
  now: number,
  zone: string,
  sending?: "sending" | "failed",
): string | null {
  if (m.kind === "system") {
    const line = systemText(m, names, viewerId, false, "");
    return line ? `Resbite: ${line}` : null;
  }
  const shown = words(m);
  if (shown === null) return null;
  const parts = [person(m.authorId, names, viewerId), shown];
  const at = instant(m.createdAt);
  if (at) {
    const today = Number.isFinite(now) && localDate(at, zone).date === localDate(new Date(now).toISOString(), zone).date;
    parts.push(today ? timeLabel(at, zone) : `${dayLabel(at, zone)}, ${timeLabel(at, zone)}`);
  }
  if (m.kind === "announcement") parts.unshift(CHAT_COPY.announcementLabel(m.audience));
  if (sending) parts.push(sending === "sending" ? CHAT_COPY.sending : CHAT_COPY.notSent);
  return parts.join(", ");
}

const SERIES_ID = new RegExp(`^${UUID_PATTERN}$`);
/** A series id as the server writes it, lowercase, which the route checks before any call (K-N14). */
export const isSeriesId = (value: unknown): value is string => typeof value === "string" && SERIES_ID.test(value);
