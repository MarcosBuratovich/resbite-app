import type { Guest } from "../services/rsvp";
import type { HostRequest } from "../services/joinRequests";
import type { InvitedPerson } from "../state/useEvent";
import { ANSWER_OPTIONS } from "./rsvp";
import { EXACT_ADDRESS_LATER, eventPlace } from "./eventView";
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
  invitedByWhatsApp: "Invited by WhatsApp",
  invitedByMessages: "Invited by Messages",
  invitedByLink: "Invited by link",
  invitedInApp: "Invited in the app",
  askedThroughLink: "Asked through the link",
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
  adminBadge: "Admin",
  invite: "Invite",
  edit: "Edit",
  moreButton: "More",
  change: "Change",
  doThisAgain: "Do this again",
  addToCalendar: "Add to calendar",
  mute: "Mute this resbite",
  unmute: "Unmute this resbite",
  changeMyReply: "Change my reply",
  cancelResbite: "Cancel resbite",
  yourAnswer: "Your answer",
  cancelled: "Your resbite is cancelled.",
  shareLink: "Or share the event link",
} as const;

const SEPARATOR = " · ";
const optionText = (key: "going" | "maybe" | "cant") => ANSWER_OPTIONS.find((o) => o.key === key)!.text;

type Timed = { starts_at: string; ends_at?: string | null };

/** The end in ms, or the start when there is none: the one boundary between "open" and "ended". */
export function planEnd(plan: Timed): number {
  return Date.parse(plan.ends_at ?? plan.starts_at);
}

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

export type MoreRow = "calendar" | "mute" | "unmute" | "again" | "changeReply" | "cancel";
export function moreRows(i: { role: Viewer; state: PageState; muted: boolean; response: string | null }): MoreRow[] {
  if (i.state !== "open") return [];
  const mute: MoreRow = i.muted ? "unmute" : "mute";
  if (i.role === "owner") return ["calendar", mute, "again", "cancel"];
  if (i.role === "admin") return ["calendar", mute, "again", "changeReply", "cancel"];
  return answered(i.response) ? ["calendar", mute] : [];
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
const GROUP_RESPONSES = {
  going: ["accepted"],
  maybe: ["maybe"],
  cantGo: ["declined", "withdrawn"],
  pending: ["pending"],
} as const;
const inGroup = (guests: readonly Guest[], group: keyof typeof GROUP_RESPONSES) =>
  guests.filter((g) => (GROUP_RESPONSES[group] as readonly string[]).includes(g.response));

export function peopleCounts(i: { guests: Guest[]; invited: InvitedPerson[]; requests: HostRequest[] }): PeopleCounts {
  return {
    going: inGroup(i.guests, "going").length,
    maybe: inGroup(i.guests, "maybe").length,
    cantGo: inGroup(i.guests, "cantGo").length,
    invited: i.invited.length + inGroup(i.guests, "pending").length,
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

export type PersonAction = "makeAdmin" | "removeAdmin" | "remove" | "sendAgain" | "removeInvite" | "approve" | "decline";
export type PersonRow = {
  key: string;
  name: string;
  status: string | null;
  admin: boolean;
  kind: "guest" | "appInvite" | "linkInvite" | "request";
  userId?: string;
  phone?: string;
  actions: PersonAction[];
};

const inviteStatus = (via: "whatsapp" | "messages" | undefined) =>
  via === "whatsapp" ? EVENT_COPY.invitedByWhatsApp : via === "messages" ? EVENT_COPY.invitedByMessages : EVENT_COPY.invitedByLink;

export function peopleGroups(i: {
  role: Viewer;
  guests: Guest[];
  invited: InvitedPerson[];
  requests: HostRequest[];
  admins: readonly string[];
  sentHere: ReadonlySet<string>;
}): { title: string; rows: PersonRow[] }[] {
  const host = i.role !== "guest";
  const guestRow = (g: Guest, canMakeAdmin: boolean): PersonRow => {
    const admin = i.admins.includes(g.userId);
    const actions: PersonAction[] = [];
    if (i.role === "owner" && canMakeAdmin) actions.push(admin ? "removeAdmin" : "makeAdmin");
    if (host) actions.push("remove");
    return { key: `guest:${g.userId}`, name: g.name, status: null, admin, kind: "guest", userId: g.userId, actions };
  };
  const answeredGroup = (title: string, group: keyof typeof GROUP_RESPONSES, canMakeAdmin: boolean) => {
    const rows = inGroup(i.guests, group).map((g) => guestRow(g, canMakeAdmin));
    return { title, rows };
  };
  const linkRows: PersonRow[] = i.invited.map((p) => ({
    key: `link:${p.phone}`,
    name: p.name,
    status: inviteStatus(p.stored?.sentVia),
    admin: false,
    kind: "linkInvite",
    phone: p.phone,
    actions: i.sentHere.has(p.phone) ? ["sendAgain", "removeInvite"] : ["removeInvite"],
  }));
  const appRows: PersonRow[] = inGroup(i.guests, "pending").map((g) => ({
    key: `app:${g.userId}`,
    name: g.name,
    status: EVENT_COPY.invitedInApp,
    admin: false,
    kind: "appInvite",
    userId: g.userId,
    actions: ["remove"],
  }));
  const requestRows: PersonRow[] = i.requests.map((r) => ({
    key: `request:${r.user_id}`,
    name: r.name,
    status: EVENT_COPY.askedThroughLink,
    admin: false,
    kind: "request",
    userId: r.user_id,
    actions: ["approve", "decline"],
  }));
  const groups = [
    answeredGroup(optionText("going"), "going", true),
    answeredGroup(optionText("maybe"), "maybe", false),
    answeredGroup(optionText("cant"), "cantGo", false),
    ...(host
      ? [
          { title: EVENT_COPY.groupInvited, rows: [...linkRows, ...appRows] },
          { title: EVENT_COPY.groupWaiting, rows: requestRows },
        ]
      : []),
  ];
  return groups.filter((g) => g.rows.length > 0).map((g) => ({ title: `${g.title}${SEPARATOR}${g.rows.length}`, rows: g.rows }));
}
