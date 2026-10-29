import test from "node:test";
import assert from "node:assert/strict";
import { VIDEO_CALL_MESSAGE, hasVideoCallLink, videoLinkFields } from "./videoLinks.ts";
import { EMPTY_FORM } from "./planForm.ts";

test("video-call links are refused", () => {
  for (const text of [
    "join https://meet.google.com/abc-defg-hij",
    "us02web.zoom.us/j/123",
    "HTTPS://TEAMS.MICROSOFT.COM/l/x",
    "teams.live.com/meet/1",
    "zoom.us/j/1",
  ]) {
    assert.equal(hasVideoCallLink(text), true, text);
  }
});

test("other text is allowed", () => {
  for (const text of ["https://zoom.useful.com/x", "my zoom room at home", "https://maps.app.goo.gl/x", ""]) {
    assert.equal(hasVideoCallLink(text), false, text);
  }
});

test("videoLinkFields names the offending fields in screen order", () => {
  const form = { ...EMPTY_FORM, description: "see zoom.us/j/1", meetingDetails: "https://meet.google.com/a-b-c" };
  assert.deepEqual(videoLinkFields(form), ["description", "meetingDetails"]);
  assert.deepEqual(videoLinkFields(EMPTY_FORM), []);
  assert.deepEqual(
    videoLinkFields({ ...EMPTY_FORM, guestNote: "teams.live.com/x", title: "zoom.us", place: "meet.google.com", area: "zoom.us" }),
    ["title", "place", "area", "guestNote"],
  );
});

test("the message is the plan copy", () => {
  assert.equal(VIDEO_CALL_MESSAGE, "Resbite is for meeting in person. Take out the video-call link.");
});
