import assert from "node:assert/strict";
import test from "node:test";
import {
  GUEST_COPY,
  TERMS_VERSION,
  appleNameToSave,
  formatCountdown,
  nameFromSession,
  stateSentence,
} from "./guestAccount";

test("Apple's name wins over metadata", () => {
  assert.equal(nameFromSession({ user_metadata: { full_name: "Meta Name" } }, " Apple Name "), "Apple Name");
  assert.equal(nameFromSession({ user_metadata: { full_name: "Meta Name" } }, null), "Meta Name");
  assert.equal(nameFromSession(null, null), null);
});

test("metadata display_name, then full_name, then name", () => {
  assert.equal(nameFromSession({ user_metadata: { display_name: "D", full_name: "F", name: "N" } }, null), "D");
  assert.equal(nameFromSession({ user_metadata: { full_name: "F", name: "N" } }, null), "F");
  assert.equal(nameFromSession({ user_metadata: { name: "N" } }, null), "N");
  assert.equal(nameFromSession({ user_metadata: { display_name: "  ", name: 5 } }, null), null);
  assert.equal(nameFromSession({}, null), null);
});

test("an 81-character name is not a name", () => {
  assert.equal(nameFromSession({ user_metadata: { name: "a".repeat(81) } }, null), null);
  assert.equal(nameFromSession({ user_metadata: { name: "a".repeat(80) } }, null), "a".repeat(80));
  assert.equal(nameFromSession({ user_metadata: { name: "Fallback" } }, "a".repeat(81)), "Fallback");
  assert.equal(nameFromSession({ user_metadata: { name: ` ${"a".repeat(80)} ` } }, null), "a".repeat(80));
});

test("Apple's name is saved only when the account has no display name, as nameFromSession reads it", () => {
  assert.equal(appleNameToSave(" Ana Lima ", undefined), "Ana Lima");
  assert.equal(appleNameToSave("Ana Lima", {}), "Ana Lima");
  assert.equal(appleNameToSave("Ana Lima", { display_name: "  ", full_name: "Google Name" }), "Ana Lima");
  assert.equal(appleNameToSave("Ana Lima", { display_name: 5 }), "Ana Lima");
  assert.equal(appleNameToSave("Ana Lima", { display_name: "Chosen" }), null);
  assert.equal(appleNameToSave(null, {}), null);
  assert.equal(appleNameToSave("   ", {}), null);
  assert.equal(appleNameToSave("a".repeat(80), {}), "a".repeat(80));
  assert.equal(appleNameToSave("a".repeat(81), {}), null);
});

test("countdown formats", () => {
  assert.equal(formatCountdown(60), "1:00");
  assert.equal(formatCountdown(59), "0:59");
  assert.equal(formatCountdown(5), "0:05");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(-3), "0:00");
  assert.equal(GUEST_COPY.resendIn(5), "Didn’t get it? Send a new code in 0:05");
  assert.equal(TERMS_VERSION, "2026-10");
});

test("state sentences", () => {
  assert.equal(stateSentence("cancelled", "Sam"), "Sam cancelled this resbite.");
  assert.equal(stateSentence("cancelled", undefined), "The host cancelled this resbite.");
  assert.equal(stateSentence("happened", "Sam"), "This resbite has already happened.");
  assert.equal(stateSentence("inactive", undefined), "This invitation is no longer active.");
});
