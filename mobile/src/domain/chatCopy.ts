/** Who an announcement went to: on a one-off, people going (Going and Maybe) or everyone invited. */
export type ChatAudience = "going" | "everyone";

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
  audienceGoing: (n: number) => `Going · ${n}`,
  audienceEveryone: (n: number) => `Everyone invited · ${n}`,
  announcePlaceholder: "Write an update for your guests",
  sendAnnouncement: "Send announcement",
  cancel: "Cancel",
  pinned: "PINNED",
  /** An announcement card's label, its audience in words. */
  announcementTo: (a: ChatAudience | null) =>
    a === "everyone" ? "ANNOUNCEMENT · TO EVERYONE INVITED" : "ANNOUNCEMENT · TO GOING",
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
    a === "everyone" ? "Announcement to everyone invited" : "Announcement to people going",
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
} as const;
