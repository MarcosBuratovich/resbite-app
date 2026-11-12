import type { Guest } from "../services/rsvp";
import type { HostRequest } from "../services/joinRequests";
import type { ConnectionState } from "../services/connections";
import type { Allowance, BroughtLink } from "../services/circle";
import type { ChatSummary } from "../services/chat";
import { CHAT_COPY } from "./chatCopy";
import { cutLine, rowText } from "./chatRules";
import { CIRCLE_COPY } from "./circleCopy";
import { CONNECTIONS_COPY } from "./connectionsCopy";
import { firstName } from "./circle";
import type { InvitedPerson } from "../state/useEvent";
import { ANSWER_OPTIONS } from "./rsvp";
import { EXACT_ADDRESS_LATER, eventPlace } from "./eventView";
import { removeGuestQuestion } from "./eventLinks";
import { INVITE_COPY } from "./inviteCopy";
import { planEnd } from "./planEnd";
import { repeatLine, whenLine } from "./whenText";

/** Every word the resbite page, its More sheet and the people list say. */
export const EVENT_COPY = {
  youreGoing: "You’re going",
  maybe: "Maybe",
  youCantGo: "You can’t go",
  hosting: "You’re hosting",
  admin: "You’re an admin",
  hostedBy: "Hosted by",
  placeTbd: "Place to be decided",
  ended: "Ended",
  nextInMyResbites: "the next one is in My resbites",
  going: "Going",
  cantGo: "Can’t go",
  invitedCount: "invited",
  waitingCount: "waiting",
  and: "and",
  more: "more",
  cancelTitle: "Cancel this resbite for everyone?",
  itRepeats: "It repeats",
  everyoneTold: "Everyone invited will be told.",
  cancelYes: "Yes, cancel resbite",
  cancelOne: "Cancel just this one",
  cancelStop: "Cancel this and stop repeating",
  keep: "Keep resbite",
  groupInvited: "Invited, not answered yet",
  groupWaiting: "Waiting for you",
  /** A group's members who haven't answered this week, as a guest sees them (G-B5). */
  groupNotAnswered: "Not answered yet",
  invitedByWhatsApp: "Invited by WhatsApp",
  invitedByMessages: "Invited by Messages",
  invitedByLink: "Invited by link",
  invitedInApp: "Invited in the app",
  askedThroughLink: "Asked through the link",
  /** The chain (CO-07): an answered guest's status line, and an unanswered one's, after its own words. */
  broughtBy: (name: string) => `Brought by ${name}`,
  broughtByJoined: (name: string) => `brought by ${name}`,
  /** An unanswered invitation the viewer sent bringing someone. */
  broughtByYou: "brought by you",
  /** An answered guest the viewer brought (C28). */
  broughtByYouAnswered: "Brought by you",
  /** A brought person's spoken name: the indent in words (rule 11). */
  broughtLabel: (name: string, bringer: string) => `${name}, brought by ${bringer}`,
  /** A guest's link as a host sees it, by the number's last two digits (never the number). */
  numberEnding: (ending: string) => `Number ending ••${ending}`,
  /** The same, spoken: a screen reader would read the bullets out. */
  numberEndingSpoken: (ending: string) => `Number ending ${ending}`,
  /** After a host's question for removing someone who brought people: they stay (CO-P15). */
  broughtStay: "People they brought stay invited.",
  people: "People",
  actionsFor: "Actions for ",
  makeAdmin: "Make admin",
  removeAdmin: "Remove as admin",
  removeFromResbite: "Remove from this resbite",
  sendAgainWhatsApp: "Send again on WhatsApp",
  sendAgainMessages: "Send again on Messages",
  remove: "Remove",
  approve: "Approve",
  decline: "Decline",
  keepPerson: "Keep",
  adminBadge: "Admin",
  hostingBadge: "Hosting",
  invite: "Invite",
  edit: "Edit",
  moreButton: "More",
  change: "Change",
  doThisAgain: "Do this again",
  addToCalendar: "Add to calendar",
  updateCalendar: "Update calendar",
  cancelledChip: "Cancelled",
  mute: "Mute this resbite",
  unmute: "Unmute this resbite",
  changeMyReply: "Change my reply",
  cancelResbite: "Cancel resbite",
  yourAnswer: "Your answer",
  cancelled: "Your resbite is cancelled.",
  shareLink: "Or share the event link",
  when: "When",
  where: "Where",
  noteToGuests: "Note to guests",
  back: "Back",
  loading: "Loading this resbite",
  opening: "Opening your resbite…",
  unavailable: "This resbite isn’t available.",
  tryAgain: "Try again",
  refreshInvitation: "Refresh invitation",
  retryResponse: "Retry my response",
  changesSaved: "Changes saved",
  previewChangesSaved: "Preview changes saved",
  mapsFailed: "Couldn’t open Maps.",
  openInMaps: (place: string) => `Open ${place.trim()} in Maps`,
  invitePreview: "Invitations are disabled in design preview. Real invitations need an approved tester account.",
  previewCancelled: "Preview plan cancelled.",
  readFailed: "This resbite couldn’t be opened. Check your connection and try again.",
  responseSaved: "Your response is saved.",
  guestsFailed: "Your answer is saved, but who’s coming couldn’t load. Refresh to try again.",
  responseReview: "The plan or your response changed. Review the latest details before choosing again.",
  responsesClosed: "This resbite is cancelled or has ended. Answers are closed.",
  responseUnconfirmed: "Your response is not confirmed. Retry checks the saved response before trying the same choice again.",
  responseOffline: "We could not confirm your response. Check your connection, then retry.",
  cancelFailed: "Could not cancel. Refresh and try again.",
  muteFailed: "Could not change the mute. Check your connection and try again.",
  muteNotInvited: "Only someone invited to this resbite can mute it.",
  adminsFailed: "Could not change admins. Check your connection and try again.",
  adminNeedsApp: "Only someone who uses the app can be an admin.",
  adminNotGoing: "Only someone who’s going can be an admin.",
  adminsOwnerOnly: "Only the organizer can change admins.",
} as const;

const SEPARATOR = " · ";
const optionText = (key: "going" | "maybe" | "cant") => ANSWER_OPTIONS.find((o) => o.key === key)!.text;

type Timed = { starts_at: string; ends_at?: string | null };

export { planEnd };

export type Viewer = "owner" | "admin" | "guest";
export function viewerRole(plan: { owner_id?: string }, userId: string | null, admins: readonly string[]): Viewer {
  if (!userId) return "guest";
  if (plan.owner_id === userId) return "owner";
  return admins.includes(userId) ? "admin" : "guest";
}

export type PageState = "open" | "ended" | "cancelled";
export function pageState(plan: Timed & { status: string }, now = Date.now()): PageState {
  if (plan.status === "cancelled") return "cancelled";
  return planEnd(plan) > now ? "open" : "ended";
}

const answered = (response: string | null) => response !== null && response !== "pending";

/** The state chip under the title: Cancelled, Ended, or none while the resbite is open. */
export function stateChip(plan: Timed & { status: string }, now = Date.now()): typeof EVENT_COPY.cancelledChip | typeof EVENT_COPY.ended | null {
  const state = pageState(plan, now);
  return state === "cancelled" ? EVENT_COPY.cancelledChip : state === "ended" ? EVENT_COPY.ended : null;
}

/**
 * Who sees the names of those going and may open the people list: the hosts, and guests who have answered; on a group
 * (`isGroup`, `series_is_group`), everyone in it, whatever their reply this week (G-B5, CH-P21).
 */
export function showsNames(role: Viewer, response: string | null, isGroup: boolean): boolean {
  return isGroup || role !== "guest" || answered(response);
}

export type BottomRow =
  | { kind: "host" }
  | { kind: "again" }
  | { kind: "reply"; text: string; change: boolean }
  | { kind: "answer" }
  | { kind: "none" };

export function replyText(response: string): string {
  if (response === "accepted") return EVENT_COPY.youreGoing;
  if (response === "maybe") return EVENT_COPY.maybe;
  return response === "declined" || response === "withdrawn" ? EVENT_COPY.youCantGo : "";
}

export function bottomRow(i: { role: Viewer; state: PageState; response: string | null }): BottomRow {
  if (i.role !== "guest") return i.state === "open" ? { kind: "host" } : { kind: "again" };
  if (i.state === "cancelled") return { kind: "none" };
  if (i.state === "open" && !answered(i.response)) return { kind: "answer" };
  if (answered(i.response)) return { kind: "reply", text: replyText(i.response!), change: i.state === "open" };
  return { kind: "none" };
}

/**
 * Who brought a guest and their level (CO-P8), from their attendee row. A row without them (a browser stub, an old
 * cache, a database before the circles migration) reads as nobody's, level 1; a level is kept within 1–4 (a host's
 * guest, then up to three hops), as the database's check holds it.
 */
export function broughtFrom(row: { brought_by?: unknown; level?: unknown }): { broughtById: string | null; level: number } {
  const level = row.level;
  return {
    broughtById: typeof row.brought_by === "string" && row.brought_by ? row.brought_by : null,
    level: typeof level === "number" && Number.isSafeInteger(level) && level >= 1 ? Math.min(level, 4) : 1,
  };
}

/**
 * Whom the signed-in guest brought, for "You brought …": the first names of their brought guests who are still in
 * (not answered, Going or Maybe), then their own unanswered links (the stored name, else the number).
 */
export function broughtNames(i: { guests: readonly Guest[]; invited: readonly InvitedPerson[]; userId: string | null }): string[] {
  if (!i.userId) return [];
  const still: readonly string[] = ["pending", "accepted", "maybe"];
  const guests = i.guests
    .filter((g) => g.broughtById === i.userId && still.includes(g.response))
    .map((g) => firstName(g.name) || g.name);
  return [...guests, ...i.invited.map((p) => p.name)];
}

/**
 * Whether to read a guest's own links (`plan_phone_invitations`, for "You brought …" and their rows on the people list):
 * only when the circle lets guests bring (`invites`, the plan's), or the guest is known to have brought someone: a
 * guest row they brought, whatever its answer, or `known` (the last read found a link of theirs, or this phone keeps a
 * code for the resbite). A sent invitation stands after the host lowers the circle (CO-P15), so those links are still
 * read; on a resbite whose circle is Nobody, with nothing brought, there are none, and the read is skipped.
 */
export function readsOwnLinks(i: { invites: number; userId: string | null; guests: readonly Guest[]; known: boolean }): boolean {
  if (!i.userId) return false;
  return i.invites > 0 || i.known || i.guests.some((g) => g.broughtById === i.userId);
}

export type BringRow = { kind: "bring"; hint: string } | { kind: "brought"; text: string };

/**
 * The resbite page's "Bring someone" row (CO-05), right after the people row: only for a guest who is Going or Maybe
 * on an open resbite and whose allowance lets them bring (`mayBring`: the host's circle isn't Nobody and they are within
 * its levels). While invites are left it opens bring mode; once all are used it reads whom they brought, with no
 * chevron. `host` is the organizer's first name.
 */
export function bringRow(i: {
  role: Viewer;
  state: PageState;
  response: string | null;
  allowance: Allowance | null;
  broughtNames: string[];
  host: string;
}): BringRow | null {
  const a = i.allowance;
  if (i.role !== "guest" || i.state !== "open" || (i.response !== "accepted" && i.response !== "maybe") || !a?.mayBring)
    return null;
  if (a.remaining > 0)
    return { kind: "bring", hint: a.used === 0 ? CIRCLE_COPY.bringHint(i.host, a.allowed) : CIRCLE_COPY.bringHintMore(i.host, a.remaining) };
  if (a.remaining === 0 && i.broughtNames.length > 0) return { kind: "brought", text: CIRCLE_COPY.youBrought(i.broughtNames) };
  return null;
}

/**
 * The Chat row's words. Open: its title ("Chat", or "Group chat" on a group), the preview line (null: none to show) and
 * the unread dot. Closed: the count as its only line, never a dot.
 */
export type ChatRow =
  | { closed: false; title: string; text: string | null; dot: boolean }
  | { closed: true; text: string; dot: false };

/** How much of the row's line its label says (H37 Q6): a long message isn't read out in full from the resbite page. */
const CHAT_LABEL_LINE = 120;

/**
 * The resbite page's Chat row (CH-P14, CH-01), right after the people row and Bring someone, from the series' summary.
 * - No row without a summary: the reader isn't in the chat (42501) or the read failed (K-S13).
 * - Open: "Chat", or "Group chat" on a group, the latest line (`rowText`: "Leo: I can bring the snacks", a system line in
 *   the group's words, "No messages yet") and the dot when unread. A line this build can't word gives no preview line,
 *   never "null" (H20).
 * - Closed: "Chat closed · 23 messages" with no dot; and no row at all for a closed chat with no message, so an old
 *   resbite's backfilled chat doesn't show "0 messages" (K-S13, a departure from CH-P14).
 */
export function chatRow(summary: ChatSummary | null, viewerId: string): ChatRow | null {
  if (!summary) return null;
  if (!summary.open)
    return summary.messageCount > 0 ? { text: CHAT_COPY.closedRow(summary.messageCount), dot: false, closed: true } : null;
  return {
    title: summary.isGroup ? CHAT_COPY.groupChat : CHAT_COPY.chat,
    text: rowText(summary.last, summary.names, viewerId, summary.isGroup) || null,
    dot: summary.unread,
    closed: false,
  };
}

/**
 * The Chat row's label: "Chat. <the line, at most 120 characters>" ("Group chat. …" on a group), ", unread messages" for
 * the dot; closed, the count.
 */
export function chatRowLabel(row: ChatRow): string {
  if (row.closed) return row.text;
  const line = row.text ? cutLine(row.text, CHAT_LABEL_LINE) : null;
  return [row.title, line].filter(Boolean).join(". ") + (row.dot ? `, ${CHAT_COPY.unreadMessages}` : "");
}

export type MoreRow = "calendar" | "mute" | "unmute" | "again" | "changeReply" | "cancel" | "reportOrBlock" | "leaveGroup";
/**
 * The More sheet's rows. `calendar` is UX3's rule (`canAddToCalendar`: the organizer and Going or Maybe guests), so a
 * Can’t go guest or an admin who hasn't answered gets no Add to calendar. A guest who hasn't answered (`pending`) gets
 * Report or block while the page is open, with or without an announcement (plan 3, B1, B4): the people who invited them.
 * A guest of a group (`isGroup`), whatever their reply, gets Leave this group last while its chat is open (`chatOpen`:
 * the Chat row's summary says so, so a failed or refused read hides it); on an ended or cancelled page it is their only
 * row (G-N13). Hosts can't leave. Left out, the two read false: a one-off's rows.
 */
export function moreRows(i: {
  role: Viewer;
  state: PageState;
  muted: boolean;
  response: string | null;
  calendar: boolean;
  isGroup?: boolean;
  chatOpen?: boolean;
}): MoreRow[] {
  const leave: MoreRow[] = i.role === "guest" && i.isGroup === true && i.chatOpen === true ? ["leaveGroup"] : [];
  if (i.state !== "open") return leave;
  const report: MoreRow[] = i.role === "guest" && i.response === "pending" ? ["reportOrBlock"] : [];
  const mute: MoreRow = i.muted ? "unmute" : "mute";
  const rows: MoreRow[] =
    i.role === "owner"
      ? ["calendar", mute, "again", "cancel"]
      : i.role === "admin"
        ? ["calendar", mute, "again", "changeReply", "cancel"]
        : answered(i.response)
          ? ["calendar", mute]
          : [];
  return [...(i.calendar ? rows : rows.filter((row) => row !== "calendar")), ...report, ...leave];
}

export function whenLines(
  plan: Timed & { status: string; repeat_weeks: 1 | 2 | null },
  zone: string,
  now = Date.now(),
): { line: string; second: string | null } {
  const ended = pageState(plan, now) === "ended";
  const line = whenLine(plan.starts_at, plan.ends_at ?? null, zone);
  const repeat = repeatLine(plan.starts_at, zone, plan.repeat_weeks);
  return {
    line: ended ? `${line}${SEPARATOR}${EVENT_COPY.ended}` : line,
    second: repeat && ended ? `${repeat}${SEPARATOR}${EVENT_COPY.nextInMyResbites}` : repeat,
  };
}

export function placeLine(
  plan: { place_tbd: boolean; place_label: string; area?: string | null },
  i: { role: Viewer; response: string | null },
): { text: string; maps: boolean } {
  if (plan.place_tbd) return { text: EVENT_COPY.placeTbd, maps: false };
  const place = eventPlace({ owner: i.role !== "guest", response: i.response, place: plan.place_label, area: plan.area });
  return place.exact ? { text: place.line, maps: true } : { text: place.line ?? EXACT_ADDRESS_LATER, maps: false };
}

export function hostLabel(role: Viewer): string | null {
  return role === "owner" ? EVENT_COPY.hosting : role === "admin" ? EVENT_COPY.admin : null;
}
export const byline = (hostName: string): string => `${EVENT_COPY.hostedBy} ${hostName}`;

export type PeopleCounts = { going: number; maybe: number; cantGo: number; invited: number; waiting: number };
/** The answers alone, as `plan_people_counts` gives them to someone who reads only their own guest row. */
export type AnswerCounts = Pick<PeopleCounts, "going" | "maybe" | "cantGo">;

/** `plan_people_counts`'s reply (`{going, maybe, cant_go}`) as AnswerCounts; anything else is refused. */
export function answerCountsFrom(reply: unknown): AnswerCounts {
  const count = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);
  const row = typeof reply === "object" && reply !== null ? (reply as Record<string, unknown>) : {};
  const [going, maybe, cantGo] = [count(row.going), count(row.maybe), count(row.cant_go)];
  if (going === null || maybe === null || cantGo === null) throw Error("Unexpected people counts");
  return { going, maybe, cantGo };
}
const GROUP_RESPONSES = {
  going: ["accepted"],
  maybe: ["maybe"],
  cantGo: ["declined", "withdrawn"],
  pending: ["pending"],
} as const;
const inGroup = (guests: readonly Guest[], group: keyof typeof GROUP_RESPONSES) =>
  guests.filter((g) => (GROUP_RESPONSES[group] as readonly string[]).includes(g.response));

/**
 * The people row's numbers: from the guest rows, or from the server's `counts` when the viewer reads only their own. A
 * host's "N invited" counts the links their guests sent bringing someone too (`broughtLinks`, CO-07), which their own
 * list (`invited`) leaves out.
 */
export function peopleCounts(i: {
  guests: Guest[];
  invited: InvitedPerson[];
  requests: HostRequest[];
  counts?: AnswerCounts | null;
  broughtLinks?: readonly BroughtLink[];
}): PeopleCounts {
  return {
    going: i.counts?.going ?? inGroup(i.guests, "going").length,
    maybe: i.counts?.maybe ?? inGroup(i.guests, "maybe").length,
    cantGo: i.counts?.cantGo ?? inGroup(i.guests, "cantGo").length,
    invited: i.invited.length + (i.broughtLinks?.length ?? 0) + inGroup(i.guests, "pending").length,
    waiting: i.requests.length,
  };
}

export function peopleRowText(c: PeopleCounts, host: boolean): string {
  const parts = [`${EVENT_COPY.going} ${c.going}`];
  if (c.maybe > 0) parts.push(`${EVENT_COPY.maybe} ${c.maybe}`);
  parts.push(`${EVENT_COPY.cantGo} ${c.cantGo}`);
  if (host && c.invited > 0) parts.push(`${c.invited} ${EVENT_COPY.invitedCount}`);
  if (host && c.waiting > 0) parts.push(`${c.waiting} ${EVENT_COPY.waitingCount}`);
  return parts.join(SEPARATOR);
}

export function namesLine(names: string[]): string {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} ${EVENT_COPY.and} ${rest} ${EVENT_COPY.more}`;
  if (shown.length < 2) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} ${EVENT_COPY.and} ${shown[shown.length - 1]}`;
}

export type CancelQuestion = {
  title: typeof EVENT_COPY.cancelTitle;
  line: string | null;
  actions:
    | { key: "cancel"; title: typeof EVENT_COPY.cancelYes; stop: false }[]
    | [
        { key: "one"; title: typeof EVENT_COPY.cancelOne; stop: false },
        { key: "stop"; title: typeof EVENT_COPY.cancelStop; stop: true },
      ];
  keep: typeof EVENT_COPY.keep;
};
export function cancelQuestion(plan: Timed & { repeat_weeks: 1 | 2 | null }, zone: string): CancelQuestion {
  const repeat = repeatLine(plan.starts_at, zone, plan.repeat_weeks);
  const base = { title: EVENT_COPY.cancelTitle, keep: EVENT_COPY.keep } as const;
  if (!repeat) {
    return { ...base, line: null, actions: [{ key: "cancel", title: EVENT_COPY.cancelYes, stop: false }] };
  }
  return {
    ...base,
    line: `${EVENT_COPY.itRepeats} ${repeat.charAt(0).toLowerCase()}${repeat.slice(1)}. ${EVENT_COPY.everyoneTold}`,
    actions: [
      { key: "one", title: EVENT_COPY.cancelOne, stop: false },
      { key: "stop", title: EVENT_COPY.cancelStop, stop: true },
    ],
  };
}

export type PersonAction =
  | "connect"
  | "cancelRequest"
  | "acceptConnection"
  | "declineConnection"
  | "makeAdmin"
  | "removeAdmin"
  | "remove"
  | "sendAgain"
  | "removeInvite"
  | "approve"
  | "decline"
  // Plan 3: report the person, and block or unblock them (G-S9, G-S10).
  | "report"
  | "block"
  | "unblock";
export type PersonRow = {
  key: string;
  name: string;
  status: string | null;
  /**
   * The person's answer (Going, Maybe, Can’t go), or Hosting for the owner, for the sheet head, where the group title is
   * out of sight; null otherwise.
   */
  reply: string | null;
  admin: boolean;
  kind: "owner" | "guest" | "appInvite" | "linkInvite" | "request";
  userId?: string;
  phone?: string;
  /**
   * The viewer's connection with this person (CO-01). Null for a row without an account (a personal link), for the
   * viewer's own row, for someone waiting for approval (not on the resbite yet, so the server says nothing of them),
   * and while the states are unknown.
   */
  connection: ConnectionState | null;
  /** The viewer's own row: no dots, whoever they are. */
  me: boolean;
  /** The viewer blocked this person (plan 3): the "Blocked" badge, which only the blocker ever sees. */
  blocked: boolean;
  actions: PersonAction[];
  /**
   * How far in this row sits under the person who brought them (CO-07): 0 for someone nobody brought, or whose bringer
   * isn't in the same group; one more per hop, at most 3. Display only: the level stays the server's.
   */
  depth: 0 | 1 | 2 | 3;
  /**
   * The first name of whoever brought them (`plan_bringers`, or a guest's link's own); null for someone nobody brought,
   * and for a bringer with no name to show (an account being deleted, or a name not known yet: rule 10).
   */
  broughtByName: string | null;
  /**
   * The viewer brought them, host or not (C28, C31): "Brought by you" or "· brought by you", and Remove is the viewer's
   * own take-back, not a host's removal.
   */
  broughtByMe: boolean;
  /** A link a guest sent, as a host sees it (`plan_brought_invitations`): Remove takes it back by this id. */
  invitationId?: string;
};

const inviteStatus = (via: "whatsapp" | "messages" | undefined) =>
  via === "whatsapp" ? EVENT_COPY.invitedByWhatsApp : via === "messages" ? EVENT_COPY.invitedByMessages : EVENT_COPY.invitedByLink;

/** What the viewer may do about their connection with someone (CO-01); Connect only for someone who may be asked here. */
function connectionActions(state: ConnectionState | null, askable: boolean): PersonAction[] {
  switch (state) {
    case "none":
      return askable ? ["connect"] : [];
    case "requested_by_me":
      return ["cancelRequest"];
    case "requested_by_them":
      return ["acceptConnection", "declineConnection"];
    default:
      return [];
  }
}

/** A row before its place in the chain is known, with who brought them (an account id, or null). */
type Placed = { row: Omit<PersonRow, "depth">; by: string | null };

/**
 * A group's rows in chain order (CO-07): each person right after whoever brought them, when that person is in the same
 * group, recursively, siblings in their own order; everyone else where they were. `depth` counts the hops from the first
 * person in the chain who is not brought, or whose bringer is not in the group, capped at 3. Rows naming each other (not
 * something the server writes) still show, once each, from the first of them.
 */
function chained(items: readonly Placed[]): PersonRow[] {
  const ids = new Set(items.map((x) => x.row.userId).filter((id): id is string => !!id));
  const under = new Map<string, Placed[]>();
  const roots: Placed[] = [];
  for (const x of items) {
    if (x.by && x.by !== x.row.userId && ids.has(x.by)) under.set(x.by, [...(under.get(x.by) ?? []), x]);
    else roots.push(x);
  }
  const rows: PersonRow[] = [];
  const placed = new Set<Placed>();
  const place = (x: Placed, depth: number) => {
    if (placed.has(x)) return;
    placed.add(x);
    rows.push({ ...x.row, depth: Math.min(depth, 3) as PersonRow["depth"] });
    for (const next of (x.row.userId && under.get(x.row.userId)) || []) place(next, depth + 1);
  };
  for (const x of roots) place(x, 0);
  for (const x of items) place(x, 0);
  return rows;
}

/**
 * The people list's groups and each person's actions. Hosts act only while the resbite is open: after the end, or once
 * it is cancelled, the list is read-only. Only the owner makes or removes admins (Make admin on a Going guest; Remove as
 * admin on any admin, whatever their answer, since Maybe keeps the role and a rolled occurrence starts them pending), and
 * only the owner removes an admin from the resbite. Send again needs this phone's code for the person (`stored`).
 *
 * The connection actions (CO-01, CO-P2) come first, for hosts and guests alike and after the end too (CO rule 7), on
 * every row with an account but the viewer's own (`userId`, null with nobody signed in). `connections` is the server's
 * state with each person (`plan_connection_states`), read only where names show; null when it wasn't read or the read
 * failed, which offers none. Someone it leaves out has no pair with the viewer. Connect is offered only to someone the
 * server lets be asked here: a guest who has answered, or a host (the owner, an admin); a request of theirs can be
 * answered from any row.
 *
 * The owner (`owner`, null when not known or where names are hidden) heads Going, marked Hosting, so a guest connects
 * with the host here too; nobody has a host action on that row. Each group's title counts the rows shown in it, the
 * owner's included ("Going · 6" for the owner and five guests); the event page's people row counts the guests alone.
 *
 * The chain (CO-07, CO-P11): in each group a brought person sits under whoever brought them (`chained`). An answered one
 * reads "Brought by Pedro"; an unanswered one adds "· brought by Pedro" to how they were invited; the viewer's own read
 * "Brought by you" and "· brought by you", host or not (C28, C31). The names are `bringerNames` (`plan_bringers`) once
 * read: a bringer it leaves out (an account being deleted) gets no words (rule 10). Until it is read (null), a bringer's
 * first name comes from their own row when the list shows it, never from the placeholder name (`unnamed`) (C28). A host's Invited group also lists the links their guests sent (`broughtLinks`) by their
 * last digits, with Remove but no Send again (the host has no code); their own links are in `invited`, marked
 * `brought`, with Send again and their own take-back (C31). A guest who isn't a host gets an Invited group of
 * their own invitations only (CO-P10): the links they sent (`invited`, which the server gives them alone) and the in-app
 * invitees they brought, with Remove (and Send again where this phone holds the code) while the resbite is open; Remove
 * stays off a host's row, which the server never lets them withdraw (C18-I1). Everyone else's unanswered rows stay
 * hidden from guests (UX2-D6).
 *
 * A group (`isGroup`, plan 2, G-B5): a guest, answered or not, sees everyone in it. After Going, Maybe and Can't go
 * comes "Not answered yet", every pending in-app invitee once, their own brought ones among them with "brought by you"
 * and their take-back while open (confirmation S4); their own links stay in the Invited group, and no one else's link
 * (it carries a number) or waiting request is ever theirs to see. Anyone with an account is askable there, so Connect
 * is offered on a pending row too (CH-P21). Hosts see what they saw before. Left out, `isGroup` reads false: the
 * one-off rule, which shows less.
 *
 * Report and Block (plan 3, G-S9, G-S10) come last on every row with an account but the viewer's own, for hosts and
 * guests alike and after the end too: Report, then Block, or Unblock for someone the viewer blocked (`blocks`, the
 * server's `my_blocks`). A waiting join requester isn't on the resbite, so their row gets Block or Unblock, never Report.
 * A blocked person's row is marked `blocked` and has no connection action. `blocks` is null until its read lands, or
 * when it failed, as `connections` is: then no row offers Block, Unblock or Connect, since any of them could be wrong
 * for someone blocked, and Report stays (N13).
 */
export function peopleGroups(i: {
  role: Viewer;
  state: PageState;
  guests: Guest[];
  invited: InvitedPerson[];
  requests: HostRequest[];
  admins: readonly string[];
  owner: { userId: string; name: string } | null;
  userId: string | null;
  connections: Record<string, ConnectionState> | null;
  /** The people the viewer blocked (`my_blocks`, plan 3); null while not known. */
  blocks: ReadonlySet<string> | null;
  /** The bringers' first names by account id (`plan_bringers`); null (or left out) until a read lands. */
  bringerNames?: Readonly<Record<string, string>> | null;
  /** The name a guest row carries when its profile has none (`UNNAMED_GUEST`): never a bringer's name. */
  unnamed?: string;
  /** The links the hosts' guests sent bringing someone (`plan_brought_invitations`); a host's only. */
  broughtLinks?: readonly BroughtLink[];
  /** The resbite is a group's (`series_is_group`) and the viewer is in it. */
  isGroup?: boolean;
}): { title: string; rows: PersonRow[] }[] {
  const host = i.role !== "guest";
  // A guest of a group sees every member, answered or not (G-B5); a host's list is the same either way.
  const member = !host && i.isGroup === true;
  const acts = host && i.state === "open";
  // A guest takes back only their own unanswered invitations, while the resbite is open.
  const bringerActs = !host && i.state === "open";
  const owner = i.role === "owner";
  const connectionOf = (userId: string): ConnectionState | null =>
    i.connections === null || userId === i.userId ? null : (i.connections[userId] ?? "none");
  const blocked = (userId: string): boolean => userId !== i.userId && i.blocks !== null && i.blocks.has(userId);
  /** Report (not for a join requester), then Block or Unblock once the blocks are known; none on the viewer's own row. */
  const safetyActions = (userId: string, reportable: boolean): PersonAction[] => {
    if (userId === i.userId) return [];
    const block: PersonAction[] = i.blocks === null ? [] : [blocked(userId) ? "unblock" : "block"];
    return reportable ? ["report", ...block] : block;
  };
  /**
   * A row for someone with an account: their connection, and its actions before the host's, then Report and Block;
   * none on the viewer's own. Connect waits until the blocks are known, and is never offered to someone blocked.
   */
  const person = (userId: string, askable: boolean, hostActions: PersonAction[]) => {
    const me = userId === i.userId;
    const connection = connectionOf(userId);
    const connecting = blocked(userId) ? [] : connectionActions(connection, askable && i.blocks !== null);
    return {
      userId,
      connection,
      me,
      blocked: blocked(userId),
      actions: me ? [] : [...connecting, ...hostActions, ...safetyActions(userId, true)],
    };
  };
  // Until the bringers' names are read, a bringer's own row on the list names them (C28): the rows this viewer sees.
  const ownRows = new Map<string, string>();
  if (!i.bringerNames)
    for (const g of i.guests) {
      const shown = host || member || g.response !== "pending" || (!!i.userId && g.broughtById === i.userId);
      const first = g.name === i.unnamed ? "" : firstName(g.name);
      if (shown && first) ownRows.set(g.userId, first);
    }
  /** A bringer's first name, or null when there is no bringer or no name to show. */
  const nameOf = (bringer: string | null | undefined): string | null => {
    if (!bringer) return null;
    if (!i.bringerNames) return ownRows.get(bringer) ?? null;
    const name = i.bringerNames[bringer];
    return typeof name === "string" && name.trim() ? name.trim() : null;
  };
  const mine = (bringer: string | null | undefined): boolean => !!bringer && bringer === i.userId;
  /** An unanswered row's status: how they were invited, then who brought them. */
  const unanswered = (status: string, bringer: string | null): string => {
    if (mine(bringer)) return `${status}${SEPARATOR}${EVENT_COPY.broughtByYou}`;
    const name = nameOf(bringer);
    return name ? `${status}${SEPARATOR}${EVENT_COPY.broughtByJoined(name)}` : status;
  };
  /** What a host may do to someone on the guest list (an answered guest or an app invitee). */
  const guestActions = (userId: string, canMakeAdmin: boolean): PersonAction[] => {
    if (!acts) return [];
    const admin = i.admins.includes(userId);
    const actions: PersonAction[] = [];
    if (owner && admin) actions.push("removeAdmin");
    else if (owner && canMakeAdmin) actions.push("makeAdmin");
    if (owner || !admin) actions.push("remove");
    return actions;
  };
  const guestItem = (g: Guest, reply: string, canMakeAdmin: boolean): Placed => {
    const by = nameOf(g.broughtById);
    return {
      by: g.broughtById,
      row: {
        key: `guest:${g.userId}`,
        name: g.name,
        status: mine(g.broughtById) ? EVENT_COPY.broughtByYouAnswered : by ? EVENT_COPY.broughtBy(by) : null,
        reply,
        admin: i.admins.includes(g.userId),
        kind: "guest",
        ...person(g.userId, true, guestActions(g.userId, canMakeAdmin)),
        broughtByName: by,
        broughtByMe: mine(g.broughtById),
      },
    };
  };
  const answeredGroup = (group: "going" | "maybe" | "cantGo", option: "going" | "maybe" | "cant") => {
    const title = optionText(option);
    return { title, items: inGroup(i.guests, group).map((g) => guestItem(g, title, group === "going")) };
  };
  const ownerItems: Placed[] = i.owner
    ? [
        {
          by: null,
          row: {
            key: `owner:${i.owner.userId}`,
            name: i.owner.name,
            status: null,
            reply: EVENT_COPY.hostingBadge,
            admin: false,
            kind: "owner",
            ...person(i.owner.userId, true, []),
            broughtByName: null,
            broughtByMe: false,
          },
        },
      ]
    : [];
  const going = answeredGroup("going", "going");
  // A guest's links are all their own (the server lists no one else's to a guest); a host's are nobody's, but for the
  // ones they brought before they were one (`brought`, C31).
  const linkItems: Placed[] = i.invited.map((p) => {
    const by = !host || p.brought ? i.userId : null;
    return {
      by,
      row: {
        key: `link:${p.phone}`,
        name: p.name,
        status: unanswered(inviteStatus(p.stored?.sentVia), by),
        reply: null,
        admin: false,
        kind: "linkInvite",
        phone: p.phone,
        connection: null,
        me: false,
        blocked: false,
        actions: !(host ? acts : bringerActs) ? [] : p.stored !== null ? ["sendAgain", "removeInvite"] : ["removeInvite"],
        broughtByName: nameOf(by),
        broughtByMe: mine(by),
      },
    };
  });
  // The links a host's guests sent: by the last two digits, as the host can't know the name (Revision 14).
  const broughtItems: Placed[] = host
    ? (i.broughtLinks ?? []).map((l) => {
        const by = l.broughtByName?.trim() || null;
        return {
          by: null,
          row: {
            key: `brought:${l.id}`,
            name: EVENT_COPY.numberEnding(l.ending),
            status: by ? `${EVENT_COPY.invitedByLink}${SEPARATOR}${EVENT_COPY.broughtByJoined(by)}` : EVENT_COPY.invitedByLink,
            reply: null,
            admin: false,
            kind: "linkInvite",
            invitationId: l.id,
            connection: null,
            me: false,
            blocked: false,
            actions: acts ? ["removeInvite"] : [],
            broughtByName: by,
            broughtByMe: false,
          },
        };
      })
    : [];
  // Not answered yet: only an admin may be asked (a host, whatever their reply), or anyone on a group, where a guest sees
  // them all. Elsewhere a guest sees only those they brought.
  const appItems: Placed[] = inGroup(i.guests, "pending")
    .filter((g) => host || member || (!!i.userId && g.broughtById === i.userId))
    .map((g) => {
      const admin = i.admins.includes(g.userId);
      return {
        by: g.broughtById,
        row: {
          key: `app:${g.userId}`,
          name: g.name,
          status: unanswered(EVENT_COPY.invitedInApp, g.broughtById),
          reply: null,
          admin,
          kind: "appInvite",
          ...person(
            g.userId,
            admin || member,
            host ? guestActions(g.userId, false) : bringerActs && !admin && mine(g.broughtById) ? ["removeInvite"] : [],
          ),
          broughtByName: nameOf(g.broughtById),
          broughtByMe: mine(g.broughtById),
        },
      };
    });
  const requestItems: Placed[] = i.requests.map((r) => ({
    by: null,
    row: {
      key: `request:${r.user_id}`,
      name: r.name,
      status: EVENT_COPY.askedThroughLink,
      reply: null,
      admin: false,
      kind: "request",
      userId: r.user_id,
      connection: null,
      me: false,
      blocked: blocked(r.user_id),
      actions: [...(acts ? (["approve", "decline"] as PersonAction[]) : []), ...safetyActions(r.user_id, false)],
      broughtByName: null,
      broughtByMe: false,
    },
  }));
  const groups = [
    { title: going.title, items: [...ownerItems, ...going.items] },
    answeredGroup("maybe", "maybe"),
    answeredGroup("cantGo", "cant"),
    ...(member
      ? [
          { title: EVENT_COPY.groupNotAnswered, items: appItems },
          { title: EVENT_COPY.groupInvited, items: linkItems },
        ]
      : [{ title: EVENT_COPY.groupInvited, items: [...linkItems, ...broughtItems, ...appItems] }]),
    ...(host ? [{ title: EVENT_COPY.groupWaiting, items: requestItems }] : []),
  ];
  return groups
    .map((g) => ({ title: g.title, rows: chained(g.items) }))
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ title: `${g.title}${SEPARATOR}${g.rows.length}`, rows: g.rows }));
}

/** The row with this key in the list as it is now, or null once it is gone: an open sheet follows it (C31 Q6). */
export function rowByKey(groups: readonly { rows: readonly PersonRow[] }[], key: string): PersonRow | null {
  for (const g of groups) for (const row of g.rows) if (row.key === key) return row;
  return null;
}

/**
 * The sheet's line under the name, where the group title is out of sight: the answer, then who brought them ("Going ·
 * brought by Pedro", "Going · brought by you"); otherwise how they were invited (which already says who brought them),
 * or the answer.
 */
export function sheetHead(row: PersonRow): string | null {
  if (row.reply && row.broughtByMe) return `${row.reply}${SEPARATOR}${EVENT_COPY.broughtByYou}`;
  if (row.reply && row.broughtByName) return `${row.reply}${SEPARATOR}${EVENT_COPY.broughtByJoined(row.broughtByName)}`;
  return row.status ?? row.reply;
}

const ENDING_PREFIX = EVENT_COPY.numberEnding("");
/** A row's name as a screen reader should say it: a guest's link by its digits without the bullets ("Number ending 23"). */
export function spokenName(row: Pick<PersonRow, "name" | "invitationId">): string {
  return row.invitationId && row.name.startsWith(ENDING_PREFIX)
    ? EVENT_COPY.numberEndingSpoken(row.name.slice(ENDING_PREFIX.length))
    : row.name;
}

/**
 * A row's spoken name (rule 11): "Clara, brought by Pedro" (or "Clara, brought by you") for a brought person whose
 * bringer is named, then the badges, then the rest of the status line, each part on its own ("Pat, brought by Pedro,
 * Invited in the app"). A guest's link by its digits is spoken without the bullets.
 */
export function personLabel(row: PersonRow): string {
  const name = spokenName(row);
  const parts = row.status ? row.status.split(SEPARATOR) : [];
  const bringer = row.broughtByName;
  const words = row.broughtByMe
    ? [EVENT_COPY.broughtByYouAnswered, EVENT_COPY.broughtByYou]
    : bringer
      ? [EVENT_COPY.broughtBy(bringer), EVENT_COPY.broughtByJoined(bringer)]
      : [];
  const brought = parts.length > 0 && words.includes(parts[parts.length - 1]);
  const lead = !brought ? name : row.broughtByMe ? `${name}, ${EVENT_COPY.broughtByYou}` : EVENT_COPY.broughtLabel(name, bringer!);
  return [
    lead,
    row.kind === "owner" ? EVENT_COPY.hostingBadge : null,
    row.admin ? EVENT_COPY.adminBadge : null,
    row.connection === "connected" ? CONNECTIONS_COPY.connectedBadge : null,
    ...(brought ? parts.slice(0, -1) : parts),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The avatar's letter: the first letter of the name (so an emoji first is skipped, never cut in half), upper case; null
 * when there is none (a number, a name of emoji) and for a guest's link a host sees by its digits: a phone stands in.
 */
export function avatarLetter(row: Pick<PersonRow, "name" | "invitationId">): string | null {
  if (row.invitationId) return null;
  const letter = row.name.match(/\p{L}/u)?.[0];
  return letter ? letter.toLocaleUpperCase() : null;
}

/**
 * How Remove takes someone off the list: a guest's link a host sees by its id (`revoke_brought_invitation`); an in-app
 * invitee the viewer brought, host or not, taken back (`withdraw_brought_invitation`, C31); any other link by its number
 * (`revoke_phone_invitation`, which admits a bringer for their own); anyone else as a host removes a guest today.
 */
export function removalOf(row: PersonRow, host: boolean): "brought" | "withdraw" | "link" | "guest" {
  if (row.invitationId) return "brought";
  if (row.kind === "linkInvite") return "link";
  if (row.kind === "appInvite" && (!host || row.broughtByMe)) return "withdraw";
  return "guest";
}

/**
 * The sheet's question before a remove or a decline, written and spoken (a link by its digits without the bullets). A
 * host removing someone who brought people adds that they stay (CO-P15, C31 Q1): the people on the list they brought.
 */
export function removeQuestion(
  row: PersonRow,
  i: { guests: readonly Guest[]; host: boolean; view: "remove" | "decline" },
): { text: string; spoken: string } {
  const ask = (name: string) => {
    if (i.view === "decline") return INVITE_COPY.declineQuestion(name);
    const base = row.kind === "guest" ? removeGuestQuestion(name) : INVITE_COPY.removeInvite(name);
    const brought = i.host && !!row.userId && i.guests.some((g) => g.broughtById === row.userId && g.userId !== row.userId);
    return brought ? `${base} ${EVENT_COPY.broughtStay}` : base;
  };
  return { text: ask(row.name), spoken: ask(spokenName(row)) };
}

/** Where focus goes once a row is removed: the next row on the list, else the one before; null when none is left. */
export function focusAfterRemove(groups: readonly { rows: readonly PersonRow[] }[], key: string): string | null {
  const rows = groups.flatMap((g) => g.rows);
  const at = rows.findIndex((r) => r.key === key);
  if (at < 0) return null;
  return rows[at + 1]?.key ?? rows[at - 1]?.key ?? null;
}
