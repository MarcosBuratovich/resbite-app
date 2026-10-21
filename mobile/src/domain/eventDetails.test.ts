import test from "node:test";
import assert from "node:assert/strict";
import {
  AREA_HINT,
  AREA_LABEL,
  AREA_MAX,
  AREA_PLACEHOLDER,
  areaLine,
  canPostGuestNote,
  guestNoteError,
  guestNoteTime,
  meetingDetailsView,
} from "./eventDetails.ts";

test("Meeting details: organizer, Going and Maybe see the text; others see a lock only when some exist", () => {
  const text = "Gate 4512";
  assert.deepEqual(meetingDetailsView({ owner: true, response: null, hasDetails: true, text }), { kind: "shown", text });
  assert.deepEqual(meetingDetailsView({ owner: false, response: "accepted", hasDetails: true, text }), { kind: "shown", text });
  assert.deepEqual(meetingDetailsView({ owner: false, response: "maybe", hasDetails: true, text: "  Gate 4512 " }), { kind: "shown", text });
  for (const response of [null, "pending", "declined", "withdrawn"]) {
    assert.deepEqual(meetingDetailsView({ owner: false, response, hasDetails: true, text: "" }), { kind: "locked" }, String(response));
    assert.deepEqual(meetingDetailsView({ owner: false, response, hasDetails: false, text: "" }), { kind: "none" }, String(response));
  }
  // An insider with nothing written sees nothing, never an empty card.
  assert.deepEqual(meetingDetailsView({ owner: true, response: null, hasDetails: false, text: "  " }), { kind: "none" });
});

test("Note to guests: 280 characters, posted time, and the posting window", () => {
  assert.equal(guestNoteError("x".repeat(280)), null);
  assert.equal(guestNoteError(` ${"x".repeat(280)} `), null);
  assert.equal(guestNoteError("x".repeat(281)), "Keep the note to 280 characters.");
  const now = new Date(2099, 9, 16, 12, 0);
  assert.equal(guestNoteTime(new Date(2099, 9, 16, 9, 41).toISOString(), now), "9:41");
  assert.equal(guestNoteTime(new Date(2099, 9, 15, 18, 5).toISOString(), now), "Thu 15 18:05");
  assert.equal(guestNoteTime(null, now), "");
  const start = new Date(2099, 9, 16, 10, 0).toISOString();
  const t = (h: number, m = 0) => new Date(2099, 9, 16, h, m).getTime();
  assert.equal(canPostGuestNote({ status: "active", starts_at: start }, t(10, 59)), true);
  assert.equal(canPostGuestNote({ status: "active", starts_at: start }, t(11, 0)), false);
  assert.equal(canPostGuestNote({ status: "active", starts_at: start, ends_at: new Date(2099, 9, 16, 13, 0).toISOString() }, t(12, 30)), true);
  assert.equal(canPostGuestNote({ status: "cancelled", starts_at: start }, t(9)), false);
});

test("Note to guests: the 280 limit counts characters, not UTF-16 units", () => {
  // 140 party poppers plus 140 letters: 280 characters, 420 UTF-16 units.
  const emojiNote = "🎉".repeat(140) + "a".repeat(140);
  assert.equal(guestNoteError(emojiNote), null);
  assert.equal(guestNoteError(`${emojiNote}a`), "Keep the note to 280 characters.");
  assert.equal(guestNoteError(`  ${"a".repeat(280)}  `), null);
});

test("GI1 area: the field's words, its length, and Review's line only when set", () => {
  assert.equal(AREA_LABEL, "Area, shown before people reply");
  assert.equal(AREA_PLACEHOLDER, "Near Old Street");
  assert.equal(AREA_HINT, "Anyone with the link sees this. The exact place shows after they reply.");
  assert.equal(AREA_MAX, 80);
  assert.equal(areaLine("  Near Old Street "), "Area · Near Old Street");
  for (const none of ["", "   ", null, undefined]) assert.equal(areaLine(none), null);
});
