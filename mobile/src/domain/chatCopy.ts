/**
 * Who an announcement went to: on a one-off, people going (Going and Maybe) or everyone invited; on a group, people going
 * this week or everyone in the group.
 */
export type ChatAudience = "going" | "everyone";

// A one-off's going words, which a group's fall back to when its day can't be read (Ruling GR1).
const audienceGoing = (n: number) => `Going · ${n}`;
const toGoing = "ANNOUNCEMENT · TO GOING";
const toPeopleGoing = "Announcement to people going";
/** A weekday to name, or none: "" or white space is no day, and nothing reads "this " with nothing after it. */
const named = (day: string) => day.trim() !== "";

export const CHAT_COPY = {
  chat: "Chat",
  noMessages: "No messages yet",
  /** The Chat row once the chat has closed. */
  closedRow: (n: number) => `Chat closed · ${n} ${n === 1 ? "message" : "messages"}`,
  field: "Message",
  send: "Send",
  /** The line above the field on a one-off. */
  toGoing: "To: people going. People who join later can read this too.",
  announce: "Announce",
  newAnnouncement: "New announcement",
  whoGetsIt: "Who gets it",
  audienceGoing,
  audienceEveryone: (n: number) => `Everyone invited · ${n}`,
  announcePlaceholder: "Write an update for your guests",
  sendAnnouncement: "Send announcement",
  cancel: "Cancel",
  pinned: "PINNED",
  /** An announcement card's label, its audience in words. */
  announcementTo: (a: ChatAudience | null) =>
    a === "everyone" ? "ANNOUNCEMENT · TO EVERYONE INVITED" : toGoing,
  peopleInChat: (n: number) => `People in this chat · ${n}`,
  mute: "Mute chat",
  muteHint: "Changes and announcements still arrive",
  unmute: "Unmute chat",
  deleted: "Message deleted",
  removed: "Message removed by an admin",
  deleteMine: "Delete message",
  deleteQuestion: "Delete this message for everyone?",
  removeTheirs: "Remove message",
  removeQuestion: "Remove this message?",
  keep: "Keep",
  sending: "Sending…",
  notSent: "Not sent. Tap to retry.",
  closedOn: (day: string) => `This chat closed on ${day}.`,
  closedWhy:
    "Resbite chats close 48 hours after the resbite, so the plan stays offline. You can still read everything here.",
  cancelledClosed: "This chat is read-only because the resbite was cancelled.",
  nobodyGoing: "Nobody’s going yet",
  nobodyGoingHint: "Messages here reach everyone going. Invite people to get started.",
  invitePeople: "Invite people",
  /** The latest "Everyone invited" announcement on an invitation card in My resbites. */
  invitationLine: (name: string, body: string) => `Announcement from ${name} · ${body}`,
  notInChat: "You’re not in this chat.",
  hostsOnly: "Only hosts can do that.",
  closedShort: "This chat is closed.",
  slowDown: "You’re sending messages too fast. Wait a moment.",
  invalid: "Write something first, up to 1,000 characters.",
  /** A person whose name can't be shown: a deleted, deleting or folded account (K-B2). */
  someone: "Someone",
  /** The person reading, wherever a line names them (K-B2, K-S14). */
  you: "You",
  /** The separator the app shows at a one-off's end (K-S16). */
  ended: (title: string) => `${title} ended`,
  /** The end of a change chip, which opens the resbite (K-S3). */
  tapToSee: "Tap to see",
  notYours: "You can only delete your own messages.",
  /** A message that failed to send, taken off this phone (K-S7). */
  deleteUnsent: "Delete unsent message",
  /** The confirm before a link opens in the browser, naming its host (K-N14). */
  openQuestion: (host: string) => `Open ${host}?`,
  open: "Open",
  /** An announcement's audience for the screen reader (K-S14). */
  announcementLabel: (a: ChatAudience | null) =>
    a === "everyone" ? "Announcement to everyone invited" : toPeopleGoing,
  /** A cancelled one-off's header, in place of its date line (H20). */
  cancelled: "Cancelled",
  /** A link's accessibility action; a host that comes again in the same message is numbered (H31, H32 Q13). */
  openLink: (host: string, n = 1) => (n > 1 ? `Open ${host} (${n})` : `Open ${host}`),
  /** The spinner's name while an earlier page loads (H31). */
  loadingEarlier: "Loading earlier messages",
  /** An unsent message the close overtook: it can't be sent, only deleted (H32 29). */
  closedBeforeSent: "This chat closed before it was sent.",
  /** The announcement limit, one a minute per chat (K-S8, H32 Q35). */
  announceTooFast: "You can send one announcement a minute.",
  /** A paste longer than a message may be, cut where a character ends (H32 Q26). */
  tooLong: "Only the first 1,000 characters fit.",
  /** Over the words the field held when the chat closed (H32 Q46). */
  notSentDraft: "Not sent:",
  /** The unread dot in words, at the end of the Chat row's and a My resbites card's label (CH-P9, Task 8). */
  unreadMessages: "unread messages",

  // A group (chat plan 2): a repeating resbite's one chat, for everyone in it whatever their reply this week.
  /** The line above the field on a group. */
  toGroup: "To: everyone in the group, now and later",
  /** The Chat row's title on a group's resbite page. */
  groupChat: "Group chat",
  /** The "Next one" button's hint. */
  opensResbite: "Opens the resbite",
  /**
   * A group's two audiences (G-S7); `day` is the long weekday, "Thursday". With no day (a start that can't be read, or
   * an announcement from an earlier week), the going words are a one-off's (Ruling GR1).
   */
  audienceGroup: (n: number) => `Everyone in the group · ${n}`,
  audienceGoingDay: (day: string, n: number) => (named(day) ? `Going this ${day} · ${n}` : audienceGoing(n)),
  /** A group's announcement card label (confirmation NOTE 14). */
  announcementToGroup: (a: ChatAudience | null, day: string) =>
    a === "everyone"
      ? "ANNOUNCEMENT · TO EVERYONE IN THE GROUP"
      : named(day)
        ? `ANNOUNCEMENT · TO GOING THIS ${day.toUpperCase()}`
        : toGoing,
  /** The same, for the screen reader. */
  announcementLabelGroup: (a: ChatAudience | null, day: string) =>
    a === "everyone"
      ? "Announcement to everyone in the group"
      : named(day)
        ? `Announcement to people going this ${day}`
        : toPeopleGoing,
  announcePlaceholderGroup: "Write an update for the group",
  /** The owner alone in a group (CH-07). */
  groupEmptyHint: "Messages here reach everyone in the group.",
  peopleInGroup: (n: number) => `People in this group · ${n}`,
  /** A group's header: "Every Thursday · 9 in the group", and its last one once it stopped repeating (G-S7). */
  groupHeader: (repeat: string, n: number) => `${repeat} · ${n} in the group`,
  groupStoppedHeader: (day: string, n: number) => `Last one · ${day} · ${n} in the group`,
  /** The chat menu's row, and the resbite page's More row, then the question both ask (G-N13). */
  leaveGroup: "Leave group",
  leaveThisGroup: "Leave this group",
  /** With no day to name, it names what they stop getting without one (Ruling GR1). */
  leaveQuestion: (title: string, day: string) =>
    named(day)
      ? `Leave ${title}? You’ll stop getting its ${day}s and its chat.`
      : `Leave ${title}? You’ll stop getting its invitations and its chat.`,
  /** A group's closed card. */
  groupClosedOn: (day: string) => `This group’s chat closed on ${day}.`,
  /** Leaving's refusals (G-N13). */
  notInGroup: "You’re not in this group.",
  hostsCantLeave: "To leave, step down first: change your reply to Can’t go.",
  ownerCantLeave: "You own this group, so you can’t leave it.",
} as const;
