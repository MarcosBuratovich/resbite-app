/** The circle of trust's words (CO-04, CO-07). */
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
};
