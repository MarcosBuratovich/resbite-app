export const CONNECTIONS_COPY = {
  heading: "Connections",
  requests: "Requests",
  connected: "Connected",
  accept: "Accept",
  notNow: "Not now",
  /** A request's Not now, for VoiceOver. */
  notNowFrom: (name: string) => `Not now, ${name}'s request`,
  remove: "Remove connection",
  removeQuestion: (name: string) => `Remove ${name} from your connections? Neither of you will be told.`,
  keep: "Keep",
  empty: "Nobody yet. You can connect with people who share a resbite with you, from its people list.",
  noSearch: "You can only connect with people who share a resbite with you. There is no search.",
  metAt: (title: string) => `Met at ${title}`,
  metOnResbite: "Met on Resbite",
  bothGoing: (title: string) => `You're both going to ${title}`,
  bothAt: (title: string) => `You were both at ${title}`,
  bothInvited: (title: string) => `You're both invited to ${title}`,
  wereBothInvited: (title: string) => `You were both invited to ${title}`,
  /** A request's resbite and no more, when the server can't say how the two stand on it. */
  from: (title: string) => `From ${title}`,
  connect: "Connect on Resbite",
  connectHint: (name: string) => `${name} decides. Then you can invite each other in the app.`,
  requestSent: "Request sent",
  cancelRequest: "Cancel request",
  connectedBadge: "Connected",
  acceptFrom: (name: string) => `Accept ${name}'s request`,
  yourConnections: "Your connections",
  invitedAlready: "Invited",
  /** A connection's row on Invite people, for VoiceOver. */
  selectPerson: (name: string) => `Select ${name}`,
  searchConnections: "Search connections",
  /**
   * Invite people, when connections' invitations are refused (they may no longer use the app): how many, and that the
   * others were invited only when another connection or a number was.
   */
  inviteRefused: (n: number, othersWent: boolean) =>
    `${n === 1 ? "One connection" : `${n} connections`} you picked can't be invited right now.` +
    (othersWent ? " The others were invited." : ""),
  profileRow: "Connections",
  /** Profile's Connections row with requests waiting, for VoiceOver: the whole count, whatever the badge shows. */
  waitingLabel: (n: number) => (n === 1 ? "Connections, 1 request" : `Connections, ${n} requests`),
  /** The requests waiting, on Profile's Connections row: the count, capped so it stays a short badge. */
  badge: (n: number) => (n > 99 ? "99+" : String(n)),
  /** The Connections screen's first read, for VoiceOver. */
  loading: "Loading your connections",
  peopleListsRow: "People lists",
  namesFirst: "Answer first to connect with people here.",
  notHere: "That person isn't on this resbite.",
  failed: "Couldn't do that. Try again.",
};

/**
 * A request card's line: how the two stand on the resbite its request names, as the request's push says ('going',
 * 'invited', 'were_invited'; 'met' or anything else reads as met there). 'from' names the resbite only: the server
 * can't say how the two stand on it. With no resbite left to name, Resbite.
 */
export function requestLine(context: string | undefined, title: string | null): string {
  const C = CONNECTIONS_COPY;
  if (title === null) return C.metOnResbite;
  if (context === "going") return C.bothGoing(title);
  if (context === "invited") return C.bothInvited(title);
  if (context === "were_invited") return C.wereBothInvited(title);
  if (context === "from") return C.from(title);
  return C.bothAt(title);
}
