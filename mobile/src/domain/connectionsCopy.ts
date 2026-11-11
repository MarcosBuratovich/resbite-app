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
  /** Invite people, when a connection's invitation is refused (they may no longer use the app) but others went. */
  inviteRefused: "One of your connections can't be invited right now. The others were.",
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
