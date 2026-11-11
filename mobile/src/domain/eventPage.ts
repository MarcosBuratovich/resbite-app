import type { Guest } from "../services/rsvp";
import type { HostRequest } from "../services/joinRequests";
import type { ConnectionState } from "../services/connections";
import type { Allowance, BroughtLink } from "../services/circle";
import { CIRCLE_COPY } from "./circleCopy";
import { CONNECTIONS_COPY } from "./connectionsCopy";
import { firstName } from "./circle";
import type { InvitedPerson } from "../state/useEvent";
import { ANSWER_OPTIONS } from "./rsvp";
import { EXACT_ADDRESS_LATER, eventPlace } from "./eventView";
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
  /** A brought person's spoken name: the indent in words (rule 11). */
  broughtLabel: (name: string, bringer: string) => `${name}, brought by ${bringer}`,
  /** A guest's link as a host sees it, by the number's last two digits (never the number). */
  numberEnding: (ending: string) => `Number ending ••${ending}`,
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

/** Who sees the names of those going and may open the people list: the hosts, and guests who have answered. */
export function showsNames(role: Viewer, response: string | null): boolean {
  return role !== "guest" || answered(response);
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

export type MoreRow = "calendar" | "mute" | "unmute" | "again" | "changeReply" | "cancel";
/**
 * The More sheet's rows. `calendar` is UX3's rule (`canAddToCalendar`: the organizer and Going or Maybe guests), so a
 * Can’t go guest or an admin who hasn't answered gets no Add to calendar.
 */
export function moreRows(i: { role: Viewer; state: PageState; muted: boolean; response: string | null; calendar: boolean }): MoreRow[] {
  if (i.state !== "open") return [];
  const mute: MoreRow = i.muted ? "unmute" : "mute";
  const rows: MoreRow[] =
    i.role === "owner"
      ? ["calendar", mute, "again", "cancel"]
      : i.role === "admin"
        ? ["calendar", mute, "again", "changeReply", "cancel"]
        : answered(i.response)
          ? ["calendar", mute]
          : [];
  return i.calendar ? rows : rows.filter((row) => row !== "calendar");
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
  | "decline";
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
 * reads "Brought by Pedro"; an unanswered one adds "· brought by Pedro" to how they were invited, or "· brought by you"
 * for the viewer's own. A bringer with no name in `bringerNames` (`plan_bringers`; an account being deleted, or not read
 * yet) gets no words (rule 10). A host's Invited group also lists the links their guests sent (`broughtLinks`) by their
 * last digits, with Remove but no Send again (the host has no code). A guest who isn't a host gets an Invited group of
 * their own invitations only (CO-P10): the links they sent (`invited`, which the server gives them alone) and the in-app
 * invitees they brought, with Remove (and Send again where this phone holds the code) while the resbite is open; Remove
 * stays off a host's row, which the server never lets them withdraw (C18-I1). Everyone else's unanswered rows stay
 * hidden from guests (UX2-D6).
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
  /** The bringers' first names by account id (`plan_bringers`); none when not read. */
  bringerNames?: Readonly<Record<string, string>>;
  /** The links the hosts' guests sent bringing someone (`plan_brought_invitations`); a host's only. */
  broughtLinks?: readonly BroughtLink[];
}): { title: string; rows: PersonRow[] }[] {
  const host = i.role !== "guest";
  const acts = host && i.state === "open";
  // A guest takes back only their own unanswered invitations, while the resbite is open.
  const bringerActs = !host && i.state === "open";
  const owner = i.role === "owner";
  const connectionOf = (userId: string): ConnectionState | null =>
    i.connections === null || userId === i.userId ? null : (i.connections[userId] ?? "none");
  /** A row for someone with an account: their connection, and its actions before the host's; none on the viewer's own. */
  const person = (userId: string, askable: boolean, hostActions: PersonAction[]) => {
    const me = userId === i.userId;
    const connection = connectionOf(userId);
    return { userId, connection, me, actions: me ? [] : [...connectionActions(connection, askable), ...hostActions] };
  };
  /** A bringer's first name, or null when there is no bringer or no name to show. */
  const nameOf = (bringer: string | null | undefined): string | null => {
    const name = bringer ? i.bringerNames?.[bringer] : undefined;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  };
  /** An unanswered row's status: how they were invited, then who brought them. */
  const unanswered = (status: string, bringer: string | null): string => {
    if (bringer && bringer === i.userId) return `${status}${SEPARATOR}${EVENT_COPY.broughtByYou}`;
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
        status: by ? EVENT_COPY.broughtBy(by) : null,
        reply,
        admin: i.admins.includes(g.userId),
        kind: "guest",
        ...person(g.userId, true, guestActions(g.userId, canMakeAdmin)),
        broughtByName: by,
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
          },
        },
      ]
    : [];
  const going = answeredGroup("going", "going");
  // A host's own links, nobody's; a guest's are all their own (the server lists no one else's to a guest).
  const linkItems: Placed[] = i.invited.map((p) => {
    const by = host ? null : i.userId;
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
        actions: !(host ? acts : bringerActs) ? [] : p.stored !== null ? ["sendAgain", "removeInvite"] : ["removeInvite"],
        broughtByName: nameOf(by),
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
            actions: acts ? ["removeInvite"] : [],
            broughtByName: by,
          },
        };
      })
    : [];
  // Not answered yet: only an admin may be asked (a host, whatever their reply). A guest sees only those they brought.
  const appItems: Placed[] = inGroup(i.guests, "pending")
    .filter((g) => host || (!!i.userId && g.broughtById === i.userId))
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
          ...person(g.userId, admin, host ? guestActions(g.userId, false) : bringerActs && !admin ? ["removeInvite"] : []),
          broughtByName: nameOf(g.broughtById),
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
      actions: acts ? ["approve", "decline"] : [],
      broughtByName: null,
    },
  }));
  const groups = [
    { title: going.title, items: [...ownerItems, ...going.items] },
    answeredGroup("maybe", "maybe"),
    answeredGroup("cantGo", "cant"),
    { title: EVENT_COPY.groupInvited, items: [...linkItems, ...broughtItems, ...appItems] },
    ...(host ? [{ title: EVENT_COPY.groupWaiting, items: requestItems }] : []),
  ];
  return groups
    .map((g) => ({ title: g.title, rows: chained(g.items) }))
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ title: `${g.title}${SEPARATOR}${g.rows.length}`, rows: g.rows }));
}

/**
 * The sheet's line under the name, where the group title is out of sight: the answer, then who brought them ("Going ·
 * brought by Pedro"); otherwise how they were invited (which already says who brought them), or the answer.
 */
export function sheetHead(row: PersonRow): string | null {
  if (row.broughtByName && row.reply) return `${row.reply}${SEPARATOR}${EVENT_COPY.broughtByJoined(row.broughtByName)}`;
  return row.status ?? row.reply;
}

/**
 * A row's spoken name (rule 11): "Clara, brought by Pedro" for a brought person whose bringer is named, then the badges,
 * then the rest of the status line, each part on its own ("Pat, brought by Pedro, Invited in the app"). A row the
 * viewer brought keeps its own words ("Juli, Invited by WhatsApp, brought by you").
 */
export function personLabel(row: PersonRow): string {
  const parts = row.status ? row.status.split(SEPARATOR) : [];
  const bringer = row.broughtByName;
  const words = bringer ? [EVENT_COPY.broughtBy(bringer), EVENT_COPY.broughtByJoined(bringer)] : [];
  const brought = !!bringer && parts.length > 0 && words.includes(parts[parts.length - 1]);
  return [
    brought ? EVENT_COPY.broughtLabel(row.name, bringer) : row.name,
    row.kind === "owner" ? EVENT_COPY.hostingBadge : null,
    row.admin ? EVENT_COPY.adminBadge : null,
    row.connection === "connected" ? CONNECTIONS_COPY.connectedBadge : null,
    ...(brought ? parts.slice(0, -1) : parts),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * How Remove takes someone off the list: a guest's link a host sees by its id (`revoke_brought_invitation`); an in-app
 * invitee a guest brought, withdrawn by that guest (`withdraw_brought_invitation`); any other link by its number
 * (`revoke_phone_invitation`, which admits a bringer for their own); anyone else as a host removes a guest today.
 */
export function removalOf(row: PersonRow, host: boolean): "brought" | "withdraw" | "link" | "guest" {
  if (row.invitationId) return "brought";
  if (row.kind === "linkInvite") return "link";
  if (row.kind === "appInvite" && !host) return "withdraw";
  return "guest";
}
