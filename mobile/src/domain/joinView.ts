import { AGE_REQUIRED, type JoinState } from "../services/joinRequests";
import { offline } from "../services/contactInvites";
import { eventPicture, type EventPicture } from "./events";
import { INVITE_COPY } from "./inviteCopy";
import type { AnswerKey } from "./rsvp";

// Plan 3: an open event link opened in the app. Its answer is a request the host approves or declines;
// these turn a request's state into where the app goes, the words it shows and the chip in My resbites.

type RequestStatus = "waiting" | "declined";

/** Where opening the link lands: the owner and a guest on the event, anyone else on their request. */
export function joinDestination(result: { state: JoinState; plan_id: string }): {
  pathname: "/event" | "/waiting";
  params: { plan: string };
} {
  const event = result.state === "owner" || result.state === "already";
  return { pathname: event ? "/event" : "/waiting", params: { plan: result.plan_id } };
}

/** My resbites' chip for a request: "Waiting for Sam", or "Not added" once the host declined. */
export function requestChip(request: { status: RequestStatus; host: string }): {
  text: string;
  tone: "status" | "neutral";
} {
  return request.status === "waiting"
    ? { text: INVITE_COPY.waitingFor(request.host), tone: "status" }
    : { text: INVITE_COPY.notAdded, tone: "neutral" };
}

/** The waiting screen's heading and line. A declined request says only that; it can't change its answer. */
export function waitingCopy(request: { status: RequestStatus; host: string }): {
  title: string;
  body: string | null;
  answerable: boolean;
} {
  return request.status === "waiting"
    ? { title: INVITE_COPY.waitingFor(request.host), body: INVITE_COPY.confirmSpot(request.host), answerable: true }
    : { title: INVITE_COPY.notAddedLine, body: null, answerable: false };
}

/** A request's answer from the Going / Maybe / Can’t go control. Nobody is going yet, so Can’t go declines. */
export function requestResponse(key: AnswerKey): "accepted" | "maybe" | "declined" {
  return key === "going" ? "accepted" : key === "maybe" ? "maybe" : "declined";
}

/** The link's image (`invitation_page` and `my_join_requests`): a cover, an idea's artwork, or the mark. */
export function linkPicture(image: { kind: string; ref: string | null } | null | undefined): EventPicture {
  const ref = image?.ref || null;
  if (image?.kind === "cover" && ref) return eventPicture({ activity_id: null, cover_path: ref });
  return eventPicture({ activity_id: image?.kind === "activity" ? ref : null });
}

/** The card's place line: the rough area only (never the place), or no line at all. */
export function areaLine(area: string | null | undefined): string | null {
  return area?.trim() || null;
}

/**
 * A refused request the person can still fix on the invite screen: "tick" when the server has no 18+ tick for
 * the account, so the screen asks for it and sends the request again with the Terms version. A missing name
 * can't happen there (the About you gate comes first and the request carries its name), so it has no step.
 */
export function joinStep(message: string): "tick" | null {
  return message === AGE_REQUIRED ? "tick" : null;
}

/**
 * A request refused by the server (the link is off, the event started or was cancelled, or the account can't ask)
 * is final: the kept code goes, so a restart doesn't open the same error. A lost connection keeps it, and so does
 * a tick still to give (joinStep). A refusal the app has no words for reads as a lost connection (joinErrorMessage),
 * so it keeps the code too, and Go to My resbites drops it.
 */
export function joinRefusedForGood(message: string): boolean {
  // The gateway's own word for a lost connection (joinErrorMessage), so the two can't drift apart.
  return message !== offline && joinStep(message) === null;
}
