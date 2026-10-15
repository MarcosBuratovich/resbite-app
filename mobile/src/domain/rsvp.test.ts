import test from "node:test";
import assert from "node:assert/strict";
import {
  answerKey,
  canReadSample,
  cantGoResponse,
  reconcileRsvp,
  responseFor,
  type RsvpSnapshot,
  type RsvpAttempt,
} from "./rsvp";
const snapshot: RsvpSnapshot = {
  plan: {
    id: "plan",
    activity_id: "walk",
    title: "Walk and talk",
    description: "",
    categories: ["physical", "community"],
    starts_at: "2099-01-01T00:00:00Z",
    place_label: "Park",
    note: "",
    status: "active",
    version: 1,
  },
  attendee: { response: "pending", version: 1 },
};
const attempt: RsvpAttempt = {
  planId: "plan",
  planVersion: 1,
  version: 1,
  response: "accepted",
};
test("RSVP recovery distinguishes unchanged, committed and competing responses", () => {
  assert.equal(reconcileRsvp(attempt, snapshot), "retry");
  assert.equal(
    reconcileRsvp(attempt, {
      ...snapshot,
      attendee: { response: "accepted", version: 2 },
    }),
    "confirmed",
  );
  assert.equal(
    reconcileRsvp(attempt, {
      ...snapshot,
      attendee: { response: "declined", version: 2 },
    }),
    "review",
  );
  assert.equal(
    reconcileRsvp(attempt, {
      ...snapshot,
      attendee: { response: "accepted", version: 4 },
    }),
    "review",
  );
});
test("plan changes require review and closed plans reject retries", () => {
  assert.equal(
    reconcileRsvp(attempt, {
      ...snapshot,
      plan: { ...snapshot.plan, version: 2 },
    }),
    "review",
  );
  assert.equal(
    reconcileRsvp(attempt, {
      ...snapshot,
      plan: { ...snapshot.plan, status: "cancelled" },
    }),
    "unavailable",
  );
  assert.equal(
    reconcileRsvp(attempt, snapshot, Date.parse("2099-01-01T00:00:00Z")),
    "unavailable",
  );
});
test("sample access requires accepted response and future active plan", () => {
  assert.equal(canReadSample(snapshot), false);
  const accepted = {
    ...snapshot,
    attendee: { response: "accepted", version: 2 },
  };
  assert.equal(canReadSample(accepted), true);
  assert.equal(
    canReadSample({
      ...accepted,
      plan: { ...snapshot.plan, status: "cancelled" },
    }),
    false,
  );
  assert.equal(
    canReadSample(accepted, Date.parse("2099-01-01T00:00:00Z")),
    false,
  );
});

test("Can’t go withdraws after Going and declines before ever accepting; the control reads stored answers", () => {
  assert.equal(cantGoResponse("accepted"), "withdrawn");
  assert.equal(cantGoResponse("withdrawn"), "withdrawn");
  assert.equal(cantGoResponse("pending"), "declined");
  assert.equal(cantGoResponse("declined"), "declined");
  assert.equal(answerKey("accepted"), "going");
  assert.equal(answerKey("declined"), "cant");
  assert.equal(answerKey("withdrawn"), "cant");
  assert.equal(answerKey("pending"), null);
});

test("UX2: Maybe is its own answer; Can’t go after Maybe declines", () => {
  assert.equal(answerKey("maybe"), "maybe");
  assert.equal(cantGoResponse("maybe"), "declined");
  assert.equal(responseFor("going", "pending"), "accepted");
  assert.equal(responseFor("maybe", "accepted"), "maybe");
  assert.equal(responseFor("cant", "accepted"), "withdrawn");
  assert.equal(responseFor("cant", "withdrawn"), "withdrawn");
  assert.equal(responseFor("cant", "maybe"), "declined");
  assert.equal(responseFor("cant", "pending"), "declined");
  // Only Going opens the sample chat.
  assert.equal(canReadSample({ ...snapshot, attendee: { response: "maybe", version: 2 } }), false);
});
