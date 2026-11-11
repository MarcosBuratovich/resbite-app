import { joinNames } from "./inviteCopy";

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** The circle of trust's words (CO-04, CO-05, CO-06, CO-07). */
export const CIRCLE_COPY = {
  heading: "Circle of trust",
  hint: "Let the people you invite bring someone you don’t know. Whoever they bring is in, without your OK.",
  eachBrings: "Each person can bring",
  nobody: "Nobody",
  howFar: "How far it goes",
  /** How far it goes's options: "1 level", "2 levels", "3 levels". */
  levels: (n: number) => (n === 1 ? "1 level" : `${n} levels`),
  /** The spoken label of Each person can bring's options "1", "2" and "3". */
  bringsLabel: (n: number) => (n === 1 ? "1 person each" : `${n} people each`),
  accountsOnly: "Only people with a Resbite account.",
  /** The host's people list, under the title, when the circle is set (CO-07). */
  listLine: (invites: number, levels: 1 | 2 | 3) =>
    `Circle of trust: each person brings ${invites}, ${["one level", "two levels", "three levels"][levels - 1]}.`,
  saveFailed: "Couldn’t save the circle. Try again.",
  /** The sentence's name when no guest is going yet. */
  eachGuest: "Each guest",
  /** The resbite page's row for a guest who may bring someone (CO-05), and bring mode's title (CO-06). */
  bringSomeone: "Bring someone",
  /** The row's line before any invite is used: `host` is the organizer's first name, `n` the invites allowed. */
  bringHint: (host: string, n: number) => `${host} trusts you to bring ${people(n)}. They’re in, no approval needed.`,
  /** The row's line once some are used: `n` the invites left. */
  bringHintMore: (host: string, n: number) =>
    `${host} trusts you to bring ${n} more ${n === 1 ? "person" : "people"}. They’re in, no approval needed.`,
  /** The row once every invite is used, with no chevron. */
  youBrought: (names: string[]) => `You brought ${joinNames(names)}`,
  /** Bring mode's line under the title: `n` the invites left. */
  bringLine: (host: string, n: number, title: string) => `${host} trusts you to bring ${people(n)} to ${title}.`,
  /** Bring mode when the allowance doesn't allow bringing, and 42501 'Not allowed to bring people here'. */
  notAllowed: "You can’t bring anyone to this resbite now.",
  /** Bring mode with no invites left, and 22023 'No invites left'. */
  noneLeft: "You’ve used all your invites for this resbite.",
  /**
   * A batch refused with 'Not allowed to bring people here' while the allowance still allows bringing: one of the
   * people picked is someone the host removed (C5).
   */
  oneRefused: "One of these people can’t be brought here. Ask the host.",
  /** Bring mode's count under its line as picks fill: "1 left", "2 left", "None left". */
  left: (n: number) => (n > 0 ? `${n} left` : "None left"),
  /** Bring mode with more picked than the invites left (the allowance dropped): Invite waits until some are unticked. */
  overCap: "That’s more than you can bring now. Untick someone to continue.",
  /** The Add a number card at bring mode's cap, where Add is off. */
  cantAddMore: "You can’t bring more people now.",
  /** The spoken hint of a row that can't be picked at bring mode's cap. */
  cappedHint: "No invites left",
  /** Under the used-all line: where a bringer sends their own invitation again. */
  sendAgainHint: "To send an invitation again, open it on the people list.",
};
