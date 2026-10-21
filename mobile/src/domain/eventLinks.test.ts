import test from "node:test";
import assert from "node:assert/strict";
import { claimLinkErrorMessage, inactiveInvitation, linkErrorMessage } from "./eventLinks";

test("joining by an event link: an inactive, started or cancelled event says so; anything else is a retry", () => {
  assert.equal(claimLinkErrorMessage({ code: "42501", message: "Invitation unavailable" }), inactiveInvitation);
  assert.equal(
    inactiveInvitation,
    "This invitation is no longer active, or the event has started or was cancelled.",
  );
  for (const other of [{ code: "08006" }, { message: "Failed to fetch" }, new Error("abort"), null, "x"])
    assert.equal(
      claimLinkErrorMessage(other),
      "This invitation could not be opened. Check your connection and try again.",
    );
});

test("the organizer's link calls name what failed, and never include the code", () => {
  for (const action of ["link", "rotate", "remove"] as const) {
    assert.match(linkErrorMessage(action, { code: "42501" }), /^Only the organizer of an upcoming resbite can /);
    assert.match(linkErrorMessage(action, { code: "PGRST301" }), /^Only the organizer/);
    assert.match(linkErrorMessage(action, new Error("Ab3_-xYz0123456789abcd")), /Check your connection and try again\.$/);
    assert.doesNotMatch(linkErrorMessage(action, { code: "", message: "Ab3_-xYz0123456789abcd" }), /Ab3_/);
  }
  assert.equal(linkErrorMessage("remove", { code: "22023" }), "The organizer can’t be removed from their own resbite.");
  assert.equal(
    linkErrorMessage("rotate", { code: "57014" }),
    "Couldn’t confirm the link was turned off. Check your connection and try again.",
  );
});
