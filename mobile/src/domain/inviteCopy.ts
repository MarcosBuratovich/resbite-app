function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export const INVITE_COPY = {
  heading: "Invite people",
  search: "Search contacts",
  onResbite: "On Resbite",
  invite: (n: number) => `Invite ${n}`,
  lookupNote: "Resbite checks only the numbers you pick.",
  almostHeading: "Almost there",
  invitedInApp: (names: string[]) =>
    `${joinNames(names)} ${names.length === 1 ? "is" : "are"} invited. They’ll see it in Resbite.`,
  notYet: "Not on Resbite yet",
  whatsapp: "WhatsApp",
  messages: "Messages",
  sentWhatsapp: "Sent on WhatsApp",
  sentMessages: "Sent on Messages",
  linkNote: "Each link only works for that person’s number.",
  done: "Done",
  addNumber: "Add a number",
  chooseNumber: "Which number?",
  skipped: (n: number) => `${n} skipped`,
  invitedGroup: "Invited",
  resend: "Send again",
  removeInvite: (name: string) => `Remove the invitation for ${name}?`,
  invitationsHeading: "Invitations",
  invitedYou: (host: string) => `${host} invited you`,
};
