import test from "node:test";
import assert from "node:assert/strict";
import { CHAT_COPY as C } from "./chatCopy";

test("chat copy reads exactly", () => {
  assert.equal(C.chat, "Chat");
  assert.equal(C.noMessages, "No messages yet");
  assert.equal(C.closedRow(0), "Chat closed · 0 messages");
  assert.equal(C.closedRow(1), "Chat closed · 1 message");
  assert.equal(C.closedRow(23), "Chat closed · 23 messages");
  assert.equal(C.field, "Message");
  assert.equal(C.send, "Send");
  assert.equal(C.toGoing, "To: people going. People who join later can read this too.");
  assert.equal(C.announce, "Announce");
  assert.equal(C.newAnnouncement, "New announcement");
  assert.equal(C.whoGetsIt, "Who gets it");
  assert.equal(C.audienceGoing(6), "Going · 6");
  assert.equal(C.audienceEveryone(9), "Everyone invited · 9");
  assert.equal(C.announcePlaceholder, "Write an update for your guests");
  assert.equal(C.sendAnnouncement, "Send announcement");
  assert.equal(C.cancel, "Cancel");
  assert.equal(C.pinned, "PINNED");
  assert.equal(C.announcementTo("everyone"), "ANNOUNCEMENT · TO EVERYONE INVITED");
  assert.equal(C.announcementTo("going"), "ANNOUNCEMENT · TO GOING");
  assert.equal(C.peopleInChat(6), "People in this chat · 6");
  assert.equal(C.mute, "Mute chat");
  assert.equal(C.muteHint, "Changes and announcements still arrive");
  assert.equal(C.unmute, "Unmute chat");
  assert.equal(C.deleted, "Message deleted");
  assert.equal(C.removed, "Message removed by an admin");
  assert.equal(C.deleteMine, "Delete message");
  assert.equal(C.deleteQuestion, "Delete this message for everyone?");
  assert.equal(C.removeTheirs, "Remove message");
  assert.equal(C.removeQuestion, "Remove this message?");
  assert.equal(C.keep, "Keep");
  assert.equal(C.sending, "Sending…");
  assert.equal(C.notSent, "Not sent. Tap to retry.");
  assert.equal(C.closedOn("Mon 17 Nov"), "This chat closed on Mon 17 Nov.");
  assert.equal(
    C.closedWhy,
    "Resbite chats close 48 hours after the resbite, so the plan stays offline. You can still read everything here.",
  );
  assert.equal(C.cancelledClosed, "This chat is read-only because the resbite was cancelled.");
  assert.equal(C.nobodyGoing, "Nobody’s going yet");
  assert.equal(C.nobodyGoingHint, "Messages here reach everyone going. Invite people to get started.");
  assert.equal(C.invitePeople, "Invite people");
  assert.equal(C.invitationLine("Ana", "Doors open at 19:30"), "Announcement from Ana · Doors open at 19:30");
  assert.equal(C.notInChat, "You’re not in this chat.");
  assert.equal(C.hostsOnly, "Only hosts can do that.");
  assert.equal(C.closedShort, "This chat is closed.");
  assert.equal(C.slowDown, "You’re sending messages too fast. Wait a moment.");
  assert.equal(C.invalid, "Write something first, up to 1,000 characters.");
});

test("the copy the rulings added reads exactly", () => {
  assert.equal(C.someone, "Someone");
  assert.equal(C.you, "You");
  assert.equal(C.ended("Picnic in the park"), "Picnic in the park ended");
  assert.equal(C.tapToSee, "Tap to see");
  assert.equal(C.notYours, "You can only delete your own messages.");
  assert.equal(C.deleteUnsent, "Delete unsent message");
  assert.equal(C.openQuestion("example.com"), "Open example.com?");
  assert.equal(C.open, "Open");
  assert.equal(C.announcementLabel("everyone"), "Announcement to everyone invited");
  assert.equal(C.announcementLabel("going"), "Announcement to people going");
  // H20 (Q8): a cancelled one-off's header.
  assert.equal(C.cancelled, "Cancelled");
});

test("the copy Task 7's fix round added reads exactly (H31, H32)", () => {
  // H31: a link's accessibility action; H32 (Q13): the same host twice is numbered.
  assert.equal(C.openLink("example.com"), "Open example.com");
  assert.equal(C.openLink("example.com", 1), "Open example.com");
  assert.equal(C.openLink("example.com", 2), "Open example.com (2)");
  // H31: the spinner while an earlier page loads.
  assert.equal(C.loadingEarlier, "Loading earlier messages");
  // H32 (29): a message the close overtook.
  assert.equal(C.closedBeforeSent, "This chat closed before it was sent.");
  // H32 (Q35): the announcement limit.
  assert.equal(C.announceTooFast, "You can send one announcement a minute.");
  // H32 (Q26): a paste longer than the limit.
  assert.equal(C.tooLong, "Only the first 1,000 characters fit.");
  // H32 (Q46): the draft the close left behind.
  assert.equal(C.notSentDraft, "Not sent:");
});
