import test from "node:test";
import assert from "node:assert/strict";
import { ERROR_HOLD_MS, dismissed, holdError, heldUntil } from "./heldError";

test("an error shown stays at least 4 s: a read that clears it sooner leaves it up until then (H35)", () => {
  assert.equal(ERROR_HOLD_MS, 4000);
  let h = holdError(null, "Offline", true, 0);
  assert.deepEqual(h, { message: "Offline", shownAt: 0 });
  assert.equal(heldUntil(h), 4000);
  h = holdError(h, null, true, 1000);
  assert.deepEqual(h, { message: "Offline", shownAt: 0 });
  h = holdError(h, null, true, 3999);
  assert.equal(h?.message, "Offline");
  assert.equal(holdError(h, null, true, 4000), null);
  // Shown for 4 s already: a read clears it at once.
  assert.equal(holdError({ message: "Offline", shownAt: 0 }, null, true, 9000), null);
});

test("an error that comes while nothing can show it waits, unseen, and gets its 4 s once shown (H35)", () => {
  let h = holdError(null, "Offline", false, 0);
  assert.deepEqual(h, { message: "Offline", shownAt: null });
  assert.equal(heldUntil(h), null);
  // The session cleared it meanwhile: still waiting to be seen.
  h = holdError(h, null, false, 10_000);
  assert.deepEqual(h, { message: "Offline", shownAt: null });
  // The sheet closed: the band shows it now, for 4 s.
  h = holdError(h, null, true, 12_000);
  assert.deepEqual(h, { message: "Offline", shownAt: 12_000 });
  assert.equal(holdError(h, null, true, 15_999)?.message, "Offline");
  assert.equal(holdError(h, null, true, 16_000), null);
});

test("a new error replaces the one held; the same error keeps its clock (H35)", () => {
  const h = holdError(null, "Offline", true, 0);
  assert.equal(holdError(h, "Offline", true, 2000), h);
  assert.deepEqual(holdError(h, "Only hosts can do that.", true, 2000), { message: "Only hosts can do that.", shownAt: 2000 });
  assert.equal(holdError(null, null, true, 0), null);
});

test("dismissed: Cancel takes away an error that was shown, and keeps one that wasn't (H35)", () => {
  assert.equal(dismissed({ message: "Offline", shownAt: 0 }), null);
  const unseen = { message: "Offline", shownAt: null };
  assert.equal(dismissed(unseen), unseen);
  assert.equal(dismissed(null), null);
});
