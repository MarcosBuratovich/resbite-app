import test from "node:test";
import assert from "node:assert/strict";
import { buildEventLink } from "./appLinks";
import {
  claimLinkErrorMessage,
  inactiveInvitation,
  incompleteInvitation,
  isClaimRefusal,
  LINK_INFO,
  linkDate,
  linkErrorMessage,
  ownInvitation,
  removeGuestQuestion,
  shareMessage,
  TURN_OFF_MESSAGE,
  TURN_OFF_TITLE,
} from "./eventLinks";

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

test("a claim refused for good drops the kept link; only a connection failure keeps it for a retry", () => {
  assert.equal(incompleteInvitation, "This invitation link is incomplete.");
  // A per-person link (before GI1) refuses its own organizer with 22023.
  assert.equal(claimLinkErrorMessage({ code: "22023", message: "Owner cannot claim own invitation" }), ownInvitation);
  assert.equal(ownInvitation, "You organize this resbite. Open it from My resbites.");
  for (const refused of [inactiveInvitation, incompleteInvitation, ownInvitation]) assert.equal(isClaimRefusal(refused), true);
  for (const retry of [
    claimLinkErrorMessage({ code: "08006" }),
    claimLinkErrorMessage(new Error("abort")),
    "Sign-out is in progress.",
    "Invitation unavailable.",
  ])
    assert.equal(isClaimRefusal(retry), false, retry);
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

// Local times, so the expectations hold in any test zone.
const at = (d: number, h: number, m = 0) => new Date(2099, 9, d, h, m).toISOString();

test("the link's date reads as the web page writes it: day, date, month and the time range", () => {
  assert.equal(linkDate(at(23, 19, 30)), "Fri 23 Oct, 19:30");
  assert.equal(linkDate(at(23, 19, 30), at(23, 22)), "Fri 23 Oct, 19:30 – 22:00");
  assert.equal(linkDate(at(23, 22), at(24, 2)), "Fri 23 Oct, 22:00 – Sat 24 02:00");
  assert.equal(linkDate(null), "");
  assert.equal(linkDate("not a date"), "");
});

test("Share sends the title, the date and the link; the link is the owned page or the app scheme", () => {
  const code = "Ab3_-xYz0123456789abcd";
  const plan = { title: " Film club ", starts_at: at(23, 19, 30), ends_at: at(23, 22) };
  assert.equal(
    shareMessage(plan, buildEventLink(code, "https://link.resbite.com")),
    `Film club, Fri 23 Oct, 19:30 – 22:00. RSVP: https://link.resbite.com/r/${code}`,
  );
  assert.equal(
    shareMessage({ ...plan, ends_at: null }, buildEventLink(code)),
    `Film club, Fri 23 Oct, 19:30. RSVP: resbite://r/${code}`,
  );
});

test("turning the link off asks first, and the ⓘ sheet says what the link shows and hides", () => {
  assert.equal(TURN_OFF_TITLE, "Turn off this link?");
  assert.equal(TURN_OFF_MESSAGE, "People with the old link will see that it’s no longer active. You’ll get a new link.");
  const info = LINK_INFO.join(" ");
  for (const part of [/one invitation link/, /Anyone with the link sees the basics/, /exact place and Meeting details show only after they reply/, /event link, with Share, Copy and Turn off, is on the event page\./, /also stops any older per-person links you shared\./])
    assert.match(info, part);
  // Removing is not a ban: the sheet and the question both say so.
  assert.equal(LINK_INFO.at(-1), "Someone you remove can ask to join again with the link, and you’ll decide.");
  assert.match(LINK_INFO.join(" "), /Answers through the link wait for your approval\./);
  assert.equal(
    removeGuestQuestion("Bea"),
    "Remove Bea from this resbite? They can ask to join again with the event link, and you’ll decide.",
  );
  // Curly apostrophes only.
  assert.doesNotMatch(info + TURN_OFF_MESSAGE + ownInvitation, /'/);
});
