import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTIONS_COPY as C } from "./connectionsCopy";

test("connections copy reads exactly", () => {
  assert.equal(C.heading, "Connections");
  assert.equal(C.requests, "Requests");
  assert.equal(C.connected, "Connected");
  assert.equal(C.accept, "Accept");
  assert.equal(C.notNow, "Not now");
  assert.equal(C.remove, "Remove connection");
  assert.equal(C.removeQuestion("Bea"), "Remove Bea from your connections? Neither of you will be told.");
  assert.equal(C.keep, "Keep");
  assert.equal(C.empty, "Nobody yet. You can connect with people who share a resbite with you, from its people list.");
  assert.equal(C.noSearch, "You can only connect with people who share a resbite with you. There is no search.");
  assert.equal(C.metAt("Picnic"), "Met at Picnic");
  assert.equal(C.metOnResbite, "Met on Resbite");
  assert.equal(C.bothGoing("Picnic"), "You're both going to Picnic");
  assert.equal(C.bothAt("Picnic"), "You were both at Picnic");
  assert.equal(C.connect, "Connect on Resbite");
  assert.equal(C.connectHint("Bea"), "Bea decides. Then you can invite each other in the app.");
  assert.equal(C.requestSent, "Request sent");
  assert.equal(C.cancelRequest, "Cancel request");
  assert.equal(C.connectedBadge, "Connected");
  assert.equal(C.acceptFrom("Bea"), "Accept Bea's request");
  assert.equal(C.yourConnections, "Your connections");
  assert.equal(C.invitedAlready, "Invited");
  assert.equal(C.selectPerson("Marta"), "Select Marta");
  assert.equal(C.searchConnections, "Search connections");
  assert.equal(C.inviteRefused, "One of your connections can't be invited right now. The others were.");
  assert.equal(C.profileRow, "Connections");
  assert.equal(C.peopleListsRow, "People lists");
  assert.equal(C.namesFirst, "Answer first to connect with people here.");
  assert.equal(C.notHere, "That person isn't on this resbite.");
  assert.equal(C.failed, "Couldn't do that. Try again.");
  assert.equal(C.loading, "Loading your connections");
  assert.equal(C.notNowFrom("Bea"), "Not now, Bea's request");
  assert.equal(C.waitingLabel(1), "Connections, 1 request");
  assert.equal(C.waitingLabel(2), "Connections, 2 requests");
  assert.equal(C.waitingLabel(120), "Connections, 120 requests");
});

test("the requests badge is the count, capped at 99+", () => {
  assert.equal(C.badge(1), "1");
  assert.equal(C.badge(99), "99");
  assert.equal(C.badge(100), "99+");
  assert.equal(C.badge(1234), "99+");
});
