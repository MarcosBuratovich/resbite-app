import type { JoinState } from "../services/joinRequests";
import { eventPicture, type EventPicture } from "./events";
import { INVITE_COPY } from "./inviteCopy";
import { answerKey, type AnswerKey } from "./rsvp";

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

/** The control's selection for a request's stored answer; none while it is still "pending". */
export function requestAnswer(response: string): AnswerKey | null {
  return answerKey(response);
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
 * A request refused by the server (the link is off, the event started or was cancelled, or the account can't ask)
 * is final: the kept code goes, so a restart doesn't open the same error. Only a lost connection keeps it.
 */
export function joinRefusedForGood(message: string): boolean {
  return message !== INVITE_COPY.offline;
}
