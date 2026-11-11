import test from "node:test";
import assert from "node:assert/strict";
import { INVITE_COPY, requestDetail } from "./inviteCopy";

test("a waiting row reads answer, via event link and the number's ending when there is one", () => {
  assert.equal(requestDetail("Going", "34"), "Going · via event link · ••34");
  assert.equal(requestDetail("Maybe", null), "Maybe · via event link");
});

test("approval copy names the person and uses curly apostrophes", () => {
  assert.equal(INVITE_COPY.declineQuestion("Bea"), "Decline Bea? They’ll see they weren’t added.");
  assert.equal(INVITE_COPY.approveLabel("Bea"), "Approve Bea");
  assert.equal(INVITE_COPY.declineLabel("Bea"), "Decline Bea");
  assert.equal(INVITE_COPY.waitingForYou, "Waiting for you");
});

test("Invite people names its phone contacts apart from the connections, and the event link says who waits", () => {
  assert.equal(INVITE_COPY.phoneContacts, "Phone contacts");
  assert.equal(INVITE_COPY.eventLinkHint, "Anyone who answers through the link waits for your approval.");
  assert.equal("linkInfoLine" in INVITE_COPY, false, "the old hint is gone");
});
