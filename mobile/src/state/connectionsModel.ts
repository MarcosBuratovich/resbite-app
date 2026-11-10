import type { ConnectionPerson, MyConnections } from "../services/connections";
import { errorField } from "../services/contactInvites";

/** What the person decided on the Connections screen (CO-02): a request accepted or declined, a connection removed. */
export type ConnectionDecision = "accept" | "decline" | "remove";

/**
 * The list once the server has taken a decision, so the card or row changes without a second read. Accepting moves
 * the person from the requests to the connections, in name order as the server lists them, without the request's
 * context; declining drops the request; removing drops the connection. Someone not where the decision applies
 * changes nothing. The data given is never changed in place.
 */
export function applyDecision(data: MyConnections, userId: string, decision: ConnectionDecision): MyConnections {
  if (decision === "remove") {
    if (!data.connected.some((p) => p.userId === userId)) return data;
    return { requests: data.requests, connected: data.connected.filter((p) => p.userId !== userId) };
  }
  const asked = data.requests.find((p) => p.userId === userId);
  if (!asked) return data;
  const requests = data.requests.filter((p) => p.userId !== userId);
  if (decision === "decline") return { requests, connected: data.connected };
  const { context: _context, ...person } = asked;
  return { requests, connected: inNameOrder(data.connected.filter((p) => p.userId !== userId), person) };
}

/** Puts `person` before the first connection whose name sorts after theirs; the others keep the server's order. */
function inNameOrder(connected: ConnectionPerson[], person: ConnectionPerson): ConnectionPerson[] {
  const at = connected.findIndex((p) => p.name.localeCompare(person.name) > 0);
  return at < 0 ? [...connected, person] : [...connected.slice(0, at), person, ...connected.slice(at)];
}

/**
 * The server holds no such request any more: the requester withdrew it, or it was answered elsewhere (42501 'No
 * request', from accept and decline). Nothing went wrong for the person: the list is read again and the card goes.
 */
export const requestGone = (e: unknown) => errorField(e, "code") === "42501" && errorField(e, "message") === "No request";
