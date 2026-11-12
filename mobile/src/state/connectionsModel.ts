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
 * What a read leaves held, given whether it failed: a failure keeps the list already held, so a failed refresh leaves
 * it on screen with the error above it; with none held yet (a first read) there is still none, and the screen offers
 * Try again. Only a failure keeps it: a read that brought a list puts its own in place.
 */
export const keepOnFailure = (previous: MyConnections | null, failed: boolean): MyConnections | null =>
  failed ? previous : null;

/** A decision that failed: whose card (Accept, Not now) or sheet (Remove) says why. */
export type ActionError = { userId: string; decision: ConnectionDecision; message: string };

/**
 * Two errors, in two places (Ruling 8). A read's sits above the list, with Try again: it stays through a retry, a sheet
 * and a decision, and goes only when a read succeeds. A decision's sits in the card or sheet it belongs to: it goes
 * when the next decision starts or a sheet opens or closes; reads leave it.
 */
export type ConnectionErrors = { read: string | null; action: ActionError | null };
export type ErrorEvent =
  | { type: "readStarted" }
  | { type: "readSucceeded" }
  | { type: "readFailed"; message: string }
  | { type: "decisionStarted" }
  | ({ type: "decisionFailed" } & ActionError)
  | { type: "sheet" };

export const NO_ERRORS: ConnectionErrors = { read: null, action: null };

export function nextErrors(errors: ConnectionErrors, event: ErrorEvent): ConnectionErrors {
  switch (event.type) {
    case "readStarted":
      return errors;
    case "readSucceeded":
      return errors.read === null ? errors : { ...errors, read: null };
    case "readFailed":
      return { ...errors, read: event.message };
    case "decisionStarted":
    case "sheet":
      return errors.action === null ? errors : { ...errors, action: null };
    case "decisionFailed": {
      const { type: _type, ...action } = event;
      return { ...errors, action };
    }
  }
}

/** Why `userId`'s decision failed, for its card (Accept, Not now) or its sheet (Remove); null anywhere else. */
export function actionErrorFor(action: ActionError | null, userId: string, place: "card" | "sheet"): string | null {
  if (!action || action.userId !== userId) return null;
  return (action.decision === "remove") === (place === "sheet") ? action.message : null;
}

/**
 * The server holds no such request any more: the requester withdrew it, or it was answered elsewhere (42501 'No
 * request', from accept and decline). Nothing went wrong for the person: the list is read again and the card goes.
 */
export const requestGone = (e: unknown) => errorField(e, "code") === "42501" && errorField(e, "message") === "No request";
