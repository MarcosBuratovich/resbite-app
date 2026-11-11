import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTIONS_COPY as C, requestLine } from "./connectionsCopy";

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
  assert.equal(C.bothInvited("Picnic"), "You're both invited to Picnic");
  assert.equal(C.wereBothInvited("Picnic"), "You were both invited to Picnic");
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

test("a refusal on Invite people says how many were refused, and that the others were invited only when some were", () => {
  assert.equal(C.inviteRefused(1, false), "One connection you picked can't be invited right now.");
  assert.equal(C.inviteRefused(1, true), "One connection you picked can't be invited right now. The others were invited.");
  assert.equal(C.inviteRefused(2, false), "2 connections you picked can't be invited right now.");
  assert.equal(C.inviteRefused(3, true), "3 connections you picked can't be invited right now. The others were invited.");
});

test("a request card says how the two stand on its resbite; anything else reads as met there", () => {
  assert.equal(requestLine("going", "Picnic"), "You're both going to Picnic");
  assert.equal(requestLine("invited", "Picnic"), "You're both invited to Picnic");
  assert.equal(requestLine("were_invited", "Picnic"), "You were both invited to Picnic");
  assert.equal(requestLine("met", "Picnic"), "You were both at Picnic");
  assert.equal(requestLine("soon", "Picnic"), "You were both at Picnic");
  assert.equal(requestLine(undefined, "Picnic"), "You were both at Picnic");
  // No resbite left to name.
  assert.equal(requestLine("going", null), "Met on Resbite");
  assert.equal(requestLine("invited", null), "Met on Resbite");
});
