import test from "node:test";
import assert from "node:assert/strict";
import {
  areaLine,
  joinDestination,
  joinRefusedForGood,
  linkPicture,
  requestAnswer,
  requestChip,
  requestResponse,
  waitingCopy,
} from "./joinView";
import { INVITE_COPY } from "./inviteCopy";
import { joinErrorMessage } from "../services/joinRequests";

test("the open link's words", () => {
  assert.equal(INVITE_COPY.waitingFor("Sam"), "Waiting for Sam");
  assert.equal(INVITE_COPY.waitingFor(" Sam "), "Waiting for Sam");
  assert.equal(INVITE_COPY.waitingFor("  "), "Waiting for your host");
  assert.equal(INVITE_COPY.confirmSpot("Sam"), "Sam will confirm your spot.");
  assert.equal(INVITE_COPY.confirmSpot(""), "Your host will confirm your spot.");
  assert.equal(INVITE_COPY.notAdded, "Not added");
  assert.equal(INVITE_COPY.notAddedLine, "You weren’t added to this resbite.");
  assert.equal(INVITE_COPY.signUpToReply, "Sign up to reply");
  assert.equal(INVITE_COPY.iHaveAccount, "I have an account");
  assert.equal(INVITE_COPY.yourAnswer("Picnic"), "Your answer to Picnic");
  assert.equal(INVITE_COPY.yourAnswer(" "), "Your answer to this resbite");
  // Test mode's code never shows in the app.
  assert.ok(!JSON.stringify(INVITE_COPY).includes("000000"));
});

test("the owner and a guest land on the event; a request lands on the waiting screen", () => {
  assert.deepEqual(joinDestination({ state: "owner", plan_id: "p1" }), { pathname: "/event", params: { plan: "p1" } });
  assert.deepEqual(joinDestination({ state: "already", plan_id: "p1" }), { pathname: "/event", params: { plan: "p1" } });
  assert.deepEqual(joinDestination({ state: "waiting", plan_id: "p2" }), { pathname: "/waiting", params: { plan: "p2" } });
  assert.deepEqual(joinDestination({ state: "declined", plan_id: "p3" }), { pathname: "/waiting", params: { plan: "p3" } });
});

test("a waiting request's chip names the host; a declined one says Not added", () => {
  assert.deepEqual(requestChip({ status: "waiting", host: " Sam " }), { text: "Waiting for Sam", tone: "status" });
  assert.deepEqual(requestChip({ status: "waiting", host: "" }), { text: "Waiting for your host", tone: "status" });
  assert.deepEqual(requestChip({ status: "declined", host: "Sam" }), { text: "Not added", tone: "neutral" });
});

test("the waiting screen's words by state; only a waiting request can change its answer", () => {
  assert.deepEqual(waitingCopy({ status: "waiting", host: "Sam" }), {
    title: "Waiting for Sam",
    body: "Sam will confirm your spot.",
    answerable: true,
  });
  assert.deepEqual(waitingCopy({ status: "declined", host: "Sam" }), {
    title: "You weren’t added to this resbite.",
    body: null,
    answerable: false,
  });
});

test("answers map both ways, and Can’t go declines (never withdrawn) while waiting", () => {
  assert.equal(requestResponse("going"), "accepted");
  assert.equal(requestResponse("maybe"), "maybe");
  assert.equal(requestResponse("cant"), "declined");
  assert.equal(requestAnswer("pending"), null);
  assert.equal(requestAnswer("accepted"), "going");
  assert.equal(requestAnswer("maybe"), "maybe");
  assert.equal(requestAnswer("declined"), "cant");
  assert.equal(requestAnswer(""), null);
});

test("the link's image becomes the event's picture", () => {
  const plain = { kind: "placeholder", category: "community" };
  assert.deepEqual(linkPicture({ kind: "activity", ref: "bbq" }), { kind: "artwork", key: "bbq" });
  assert.deepEqual(linkPicture({ kind: "activity", ref: "not-artwork" }), plain);
  assert.deepEqual(linkPicture({ kind: "cover", ref: "u/p/cover.jpg" }), {
    kind: "cover",
    path: "u/p/cover.jpg",
    fallback: plain,
  });
  assert.deepEqual(linkPicture({ kind: "cover", ref: null }), plain);
  assert.deepEqual(linkPicture({ kind: "mark", ref: "" }), plain);
  assert.deepEqual(linkPicture(undefined), plain);
});

test("the area line is trimmed, or there is none", () => {
  assert.equal(areaLine(" Soho "), "Soho");
  assert.equal(areaLine(""), null);
  assert.equal(areaLine("   "), null);
  assert.equal(areaLine(undefined), null);
  assert.equal(areaLine(null), null);
});

test("only a lost connection keeps the kept code for a retry", () => {
  assert.equal(joinRefusedForGood(joinErrorMessage({ code: "42501", message: "Invitation unavailable" })), true);
  assert.equal(joinRefusedForGood(joinErrorMessage({ code: "22023", message: "Age confirmation required" })), true);
  assert.equal(joinRefusedForGood(joinErrorMessage({ code: "08006" })), false);
  assert.equal(joinRefusedForGood(joinErrorMessage(new Error("abort"))), false);
  assert.equal(joinRefusedForGood(INVITE_COPY.offline), false);
});
