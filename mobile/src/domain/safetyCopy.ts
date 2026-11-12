import type { ChatNames, ChatOverview } from "../services/chat";
import { CHAT_COPY } from "./chatCopy";
import { cleanName, hasHiddenCharacter, pendingCardNote } from "./chatRules";

/** Report and block (chat plan 3), as the rulings word them. The apostrophe is the curly one, as in chat core's copy. */
export const SAFETY_COPY = {
  // The report sheet.
  report: "Report",
  reportMessage: "Report message",
  reportPerson: (name: string) => `Report ${name}`,
  /** The chat menu's entry, the resbite page's More row and the button beside its announcement line (B1, B4). */
  reportOrBlock: "Report or block",
  why: "What’s wrong?",
  /** The four reasons, in the radios' order (Decision 4); the keys are what the server stores. */
  reasons: { harassment: "Harassment", spam: "Spam", inappropriate: "Not appropriate", other: "Something else" },
  detailsLabel: "Anything else? (optional)",
  sendReport: "Send report",
  pickReason: "Pick a reason to send the report.",
  thanks: "Thanks. The Resbite team will look at it.",

  // Block and unblock.
  block: (name: string) => `Block ${name}`,
  unblock: (name: string) => `Unblock ${name}`,
  blocked: "Blocked",
  /** Connections, once a block went through and its card or row is gone (fix round 1, ruling SR6 Q4). */
  blockedName: (name: string) => `Blocked ${name}.`,
  /**
   * The block confirm (G-N9), naming the person, never a pronoun: a reader who hosts is told what they give up; a host
   * being blocked loses their announcements too (NOTE 7). The last sentence says what a block does to a connection, and
   * that Unblock doesn't undo it (N9, G-B1).
   */
  blockQuestion: (name: string, youHost: boolean, theyHost: boolean) =>
    youHost
      ? `Block ${name}? You won’t see ${name}’s messages or announcements, and you won’t be able to remove ${name}’s messages. Any connection between you ends, and unblocking won’t bring it back.`
      : theyHost
        ? `Block ${name}? You won’t see ${name}’s messages or announcements, and ${name} won’t know. Any connection between you ends, and unblocking won’t bring it back.`
        : `Block ${name}? You won’t see ${name}’s messages, and ${name} won’t know. Any connection between you ends, and unblocking won’t bring it back.`,
  /**
   * Owner question R-Q6's default, under a host's block confirm only: a block hides the person's messages from the blocker
   * alone, hosts included (CH-P13); removing them from the resbite stops them for everyone.
   */
  hostBlockNote: "This hides their messages from you only. To stop them for everyone, remove them from the resbite.",

  // The refusals, in words.
  unavailable: "You can’t report that any more.",
  unblockFirst: "Unblock this person first.",
  /** A blocked term (G-B4(a)). */
  notAllowed: "That message can’t be sent.",
  /** The 21st report in 24 hours (I7). */
  reportLimit: "You’ve sent a lot of reports today. Try again later.",

  // The chat rules (G-B4(d)).
  rulesTitle: "Chat rules",
  rules:
    "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account.",
  agree: "I agree",
  /** A rules refusal and a failed I agree, each its own line, none the connection line (I6). */
  rulesFirst: "Agree to the chat rules first.",
  rulesHeldMessage: (n: number) =>
    n === 1
      ? "Your message hasn’t been sent. Agree to the chat rules to send it."
      : `${n} messages haven’t been sent. Agree to the chat rules to send them.`,
  rulesHeldAnnouncement: "Your announcement hasn’t been sent. Agree to the chat rules to send it.",
  /** An announcement and messages both held for the rules (fix round 1, review M6). */
  rulesHeldBoth: (n: number) =>
    n === 1
      ? "Your announcement and a message haven’t been sent. Agree to the chat rules to send them."
      : `Your announcement and ${n} messages haven’t been sent. Agree to the chat rules to send them.`,
  rulesNotSaved: "That didn’t go through, so nothing was sent. Try again.",

  // Blocked people (G-S10). A row reads "Unblock" beside the name, spoken as "Unblock <name>" (`unblock`), and says
  // "Unblocked <name>." once it went through (ruling SR4).
  blockedPeople: "Blocked people",
  noneBlocked: "You haven’t blocked anyone.",
  unblockAction: "Unblock",
  unblocked: (name: string) => `Unblocked ${name}.`,

  // The contact address (G-N10).
  contact: (address: string) => `Questions, or something wrong in a chat? Write to ${address}.`,
  copyAddress: "Copy address",
  copied: "Copied",

  /** Data & privacy's line on reports (G-S11, N9, I11): a person as well as a message, the reporter's own, the period. */
  reportsPrivacy:
    "If you report a message or a person, the Resbite team reads the report and keeps a copy of what was reported, even if the message or that person’s account is deleted. If you delete your account, the reports you sent are deleted too. A report is deleted 180 days after the team closes it.",
  /** Data & privacy's line on blocks (ruling SR4, owner question R-Q7's default; I10's 7-day read). */
  blocksPrivacy: "Blocks stay until you undo them. The Resbite team can see who blocked whom for 7 days.",
} as const;

/** A report's reason, as the server stores it. */
export type ReportReason = keyof typeof SAFETY_COPY.reasons;

/**
 * The support address from the build's `EXPO_PUBLIC_SUPPORT_ADDRESS`, trimmed; null when unset or blank, or when it isn't
 * an address (one `@` with text before it, a dot with text either side in the part after it, no blank), or when it holds
 * a control (C0 or C1), bidi, zero-width or format character (`hasHiddenCharacter`), so a broken `mailto:` or a flipped
 * contact line is never shown and the release gate catches the value (G-N10, N9, ruling SR2).
 */
export function supportAddress(env: string | undefined): string | null {
  const value = typeof env === "string" ? env.trim() : "";
  if (hasHiddenCharacter(value)) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : null;
}

/**
 * A person's name as Report, Block and Unblock name them on the people list (and their questions): cleaned as every name
 * in a chat is (`cleanName`), as the invitation card and Blocked people do, and "Someone" when nothing is left (ruling
 * SR2).
 */
export const shownName = (name: unknown): string => cleanName(name) || CHAT_COPY.someone;

/** What a sent report says: the thanks, and the contact line when there is an address (G-N10). */
export const thanksLines = (address: string | null): string[] =>
  address ? [SAFETY_COPY.thanks, SAFETY_COPY.contact(address)] : [SAFETY_COPY.thanks];

/** The chat menu's "Report or block": hidden when nobody else is in the chat (G-N7). */
export const showsReportOrBlock = (otherPeople: number): boolean => Number.isFinite(otherPeople) && otherPeople > 0;

/** What a report is about (G-N6): a message by id, or a person on a series, with the name the sheet shows. */
export type ReportTarget = { kind: "message"; id: number } | { kind: "user"; userId: string; series: string; name: string };

/** One entry of an unanswered invitation's Report and Block (Decision 14). `theyHost` picks the block question. */
export type InvitationAction =
  | { kind: "reportMessage"; id: number }
  | { kind: "reportPerson"; userId: string; name: string }
  | { kind: "block"; userId: string; name: string; theyHost: boolean };

/**
 * What an unanswered invitee may report or block, on the invitation card and the resbite page alike (P3-Q1, B4, R-Q1,
 * I-2, Decision 14): Report message when there is an announcement (not the viewer's own); then for the announcement's
 * author, the person who invited them and the owner the card and the page name, in that order, each person once at the
 * first place they can be named, Report <name> and Block <name>. The author's and the inviter's names come from the
 * overview's `names`, the owner's from `owner.name`, each cleaned as the chat cleans a name; the viewer, and anyone with
 * no name to show, are never listed. `theyHost` (NOTE 7): the author (only a host announces) and the owner are hosts; an
 * inviter who is neither is not.
 */
export function invitationActions(i: {
  announcement: { id: number; authorId: string | null } | null;
  inviterId: string | null;
  owner: { userId: string; name: string } | null;
  viewerId: string;
  names: ChatNames;
}): InvitationAction[] {
  const named = (id: string | null): string =>
    id && typeof i.names === "object" && i.names !== null && Object.prototype.hasOwnProperty.call(i.names, id)
      ? cleanName(i.names[id])
      : "";
  const authorId = i.announcement?.authorId || null;
  const ownerId = i.owner?.userId || null;
  const people: Array<{ userId: string | null; name: string }> = [
    { userId: authorId, name: named(authorId) },
    { userId: i.inviterId || null, name: named(i.inviterId) },
    { userId: ownerId, name: cleanName(i.owner?.name) },
  ];
  const actions: InvitationAction[] = [];
  if (i.announcement && !(authorId && authorId === i.viewerId)) actions.push({ kind: "reportMessage", id: i.announcement.id });
  const listed = new Set<string>();
  for (const { userId, name } of people) {
    if (!userId || userId === i.viewerId || !name || listed.has(userId)) continue;
    listed.add(userId);
    actions.push(
      { kind: "reportPerson", userId, name },
      { kind: "block", userId, name, theyHost: userId === authorId || userId === ownerId },
    );
  }
  return actions;
}

/**
 * The block confirm's lines (G-N9, NOTE 7, R-Q6): the question for the cleaned name (`shownName`, ruling SR2), and for a
 * host of that resbite the line on what a block doesn't do.
 */
export function blockLines(name: unknown, youHost: boolean, theyHost: boolean): string[] {
  const question = SAFETY_COPY.blockQuestion(shownName(name), youHost, theyHost);
  return youHost ? [question, SAFETY_COPY.hostBlockNote] : [question];
}

/** What an unanswered invitee's overview says of one invitation (B1, B4): its announcement and who invited them. */
export type InvitationEntry = {
  /** The latest "Everyone invited" announcement, `text` worded as the card words it (`pendingCardNote`); null when none shows. */
  announcement: { id: number; authorId: string | null; name: string; text: string } | null;
  /** Who invited them (`inviters`), with the overview's name for them, "" when it has none. */
  inviter: { userId: string; name: string } | null;
};

/**
 * One invitation's entry in `my_chat_overview` for someone who hasn't answered (P3-Q1, B4): the announcement only while
 * the card or the page shows its line (until the resbite ends), and the inviter whatever the line. Null parts when the
 * overview isn't read yet or names neither.
 */
export function invitationEntry(
  plan: { id: string; starts_at: string; ends_at?: string | null },
  overview: ChatOverview | null,
  viewerId: string,
  now: number,
): InvitationEntry {
  if (!overview) return { announcement: null, inviter: null };
  const nameOf = (id: string | null) =>
    id && Object.prototype.hasOwnProperty.call(overview.names, id) && typeof overview.names[id] === "string" ? (overview.names[id] as string) : "";
  const text = pendingCardNote(plan, "pending", overview, viewerId, now);
  const a = overview.announcements[plan.id];
  const inviterId = overview.inviters?.[plan.id];
  return {
    announcement: text && a ? { id: a.id, authorId: a.authorId, name: nameOf(a.authorId), text } : null,
    inviter: typeof inviterId === "string" && inviterId !== "" ? { userId: inviterId, name: nameOf(inviterId) } : null,
  };
}

/** An invitation's action as its menu row says it: Report message, Report Pedro, Block Pedro. */
export function invitationActionLabel(action: InvitationAction): string {
  if (action.kind === "reportMessage") return SAFETY_COPY.reportMessage;
  return action.kind === "reportPerson" ? SAFETY_COPY.reportPerson(action.name) : SAFETY_COPY.block(action.name);
}

/** The same entries as the card's accessibility actions (S7), each named once by what it is about. */
export function invitationAccessibilityActions(actions: readonly InvitationAction[]): { name: string; label: string }[] {
  return actions.map((action) => ({
    name: action.kind === "reportMessage" ? `reportMessage:${action.id}` : `${action.kind}:${action.userId}`,
    label: invitationActionLabel(action),
  }));
}

/**
 * The rules sheet's line on what waits for the rules (I6, review M6): the messages held, the announcement held, or both
 * together; null when nothing waits (before a first send).
 */
export function rulesHeldLine(messages: number, announcement: boolean): string | null {
  if (announcement) return messages > 0 ? SAFETY_COPY.rulesHeldBoth(messages) : SAFETY_COPY.rulesHeldAnnouncement;
  return messages > 0 ? SAFETY_COPY.rulesHeldMessage(messages) : null;
}
