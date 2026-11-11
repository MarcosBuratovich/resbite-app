import test from "node:test";
import assert from "node:assert/strict";
import { circleOf, circleSave, circleSentence, firstGuestName, firstName, type CircleSaveState } from "./circle";

test("the sentence says what the two choices mean, with a first name", () => {
  assert.equal(
    circleSentence({ name: "Pedro", invites: 1, levels: 2 }),
    "Pedro can bring 1 person, and that person can bring 1 more. Only people with a Resbite account.",
  );
  assert.equal(
    circleSentence({ name: "Each guest", invites: 2, levels: 3 }),
    "Each guest can bring 2 people, and each of them can bring 2 more, and so on for 3 levels. Only people with a Resbite account.",
  );
  assert.equal(circleSentence({ name: "Pedro", invites: 3, levels: 1 }), "Pedro can bring 3 people. Only people with a Resbite account.");
  assert.equal(circleSentence({ name: "Pedro", invites: 1, levels: 1 }), "Pedro can bring 1 person. Only people with a Resbite account.");
  assert.equal(
    circleSentence({ name: "Pedro", invites: 2, levels: 2 }),
    "Pedro can bring 2 people, and each of them can bring 2 more. Only people with a Resbite account.",
  );
  assert.equal(
    circleSentence({ name: "Pedro", invites: 1, levels: 3 }),
    "Pedro can bring 1 person, and each of them can bring 1 more, and so on for 3 levels. Only people with a Resbite account.",
  );
});

test("Nobody has no sentence", () => {
  assert.equal(circleSentence({ name: "Pedro", invites: 0, levels: 2 }), "");
  assert.equal(circleSentence({ name: "Pedro", invites: 0, levels: 1 }), "");
});

test("a plan without the circle columns reads as Nobody, one level", () => {
  assert.deepEqual(circleOf({}), { invites: 0, levels: 1 });
  assert.deepEqual(circleOf({ bring_invites: 2, bring_levels: 3 }), { invites: 2, levels: 3 });
  assert.deepEqual(circleOf({ bring_invites: 1 }), { invites: 1, levels: 1 });
  assert.deepEqual(circleOf({ bring_levels: 2 }), { invites: 0, levels: 2 });
});

test("a value outside the circle's range reads as the default", () => {
  const odd = { bring_invites: 7, bring_levels: 0 } as unknown as Parameters<typeof circleOf>[0];
  assert.deepEqual(circleOf(odd), { invites: 0, levels: 1 });
  const nulls = { bring_invites: null, bring_levels: null } as unknown as Parameters<typeof circleOf>[0];
  assert.deepEqual(circleOf(nulls), { invites: 0, levels: 1 });
});

test("a first name is the first word of the display name", () => {
  assert.equal(firstName("Pedro Gómez"), "Pedro");
  assert.equal(firstName("  Clara   Ruiz "), "Clara");
  assert.equal(firstName("Ana"), "Ana");
  assert.equal(firstName(""), "");
  assert.equal(firstName("   "), "");
  assert.equal(firstName(null), "");
  assert.equal(firstName(undefined), "");
});

test("the sentence names the first guest who is going and isn't a host, else Each guest", () => {
  const guests = [
    { userId: "maybe", name: "Marta Paz", response: "maybe" },
    { userId: "admin", name: "Leo Ríos", response: "accepted" },
    { userId: "blank", name: "  ", response: "accepted" },
    { userId: "pedro", name: "Pedro Gómez", response: "accepted" },
    { userId: "sol", name: "Sol", response: "accepted" },
  ];
  assert.equal(firstGuestName(guests, ["owner", "admin"]), "Pedro");
  assert.equal(firstGuestName(guests, []), "Leo");
  assert.equal(firstGuestName([{ userId: "m", name: "Marta", response: "maybe" }], []), "Each guest");
  assert.equal(firstGuestName([], ["owner"]), "Each guest");
});

const saved12: CircleSaveState = { saved: { invites: 1, levels: 2 }, shown: { invites: 1, levels: 2 }, saving: false };

test("a tap shows the value at once and starts a save", () => {
  assert.deepEqual(circleSave(saved12, { type: "tap", value: { invites: 2, levels: 2 } }), {
    saved: { invites: 1, levels: 2 },
    shown: { invites: 2, levels: 2 },
    saving: true,
  });
});

test("a tap while saving is ignored", () => {
  const s0: CircleSaveState = { saved: { invites: 0, levels: 1 }, shown: { invites: 0, levels: 1 }, saving: false };
  const savingOne = circleSave(s0, { type: "tap", value: { invites: 1, levels: 1 } });
  assert.deepEqual(savingOne.shown, { invites: 1, levels: 1 });
  assert.equal(circleSave(savingOne, { type: "tap", value: { invites: 2, levels: 1 } }), savingOne);
});

test("a tap on what is shown starts nothing", () => {
  assert.equal(circleSave(saved12, { type: "tap", value: { invites: 1, levels: 2 } }), saved12);
});

test("a saved save becomes the saved value", () => {
  const saving = circleSave(saved12, { type: "tap", value: { invites: 2, levels: 2 } });
  assert.deepEqual(circleSave(saving, { type: "saved", value: { invites: 2, levels: 2 } }), {
    saved: { invites: 2, levels: 2 },
    shown: { invites: 2, levels: 2 },
    saving: false,
  });
});

test("a failed save shows the saved value again, not the one tapped", () => {
  const saving = circleSave(saved12, { type: "tap", value: { invites: 2, levels: 2 } });
  const failed = circleSave(saving, { type: "failed" });
  assert.deepEqual(failed, { saved: { invites: 1, levels: 2 }, shown: { invites: 1, levels: 2 }, saving: false });
  // After the failure the next tap saves again.
  assert.equal(circleSave(failed, { type: "tap", value: { invites: 3, levels: 2 } }).saving, true);
});

test("both choices are disabled from a tap until its save is answered, and every tap between is ignored", () => {
  let s = circleSave(saved12, { type: "tap", value: { invites: 2, levels: 2 } });
  assert.equal(s.saving, true, "disabled while the save is in flight");
  for (const value of [{ invites: 0, levels: 2 }, { invites: 2, levels: 3 }, { invites: 1, levels: 2 }] as const)
    assert.equal(circleSave(s, { type: "tap", value }), s, "a tap while saving changes nothing");
  s = circleSave(s, { type: "saved", value: { invites: 2, levels: 2 } });
  assert.equal(s.saving, false, "enabled once saved");
  s = circleSave(s, { type: "tap", value: { invites: 2, levels: 3 } });
  assert.equal(s.saving, true);
  s = circleSave(s, { type: "failed" });
  assert.equal(s.saving, false, "enabled once failed");
});

test("a run of taps and saves keeps only what the server confirmed", () => {
  let s: CircleSaveState = { saved: { invites: 0, levels: 1 }, shown: { invites: 0, levels: 1 }, saving: false };
  s = circleSave(s, { type: "tap", value: { invites: 1, levels: 1 } });
  s = circleSave(s, { type: "saved", value: { invites: 1, levels: 1 } });
  s = circleSave(s, { type: "tap", value: { invites: 1, levels: 2 } });
  s = circleSave(s, { type: "saved", value: { invites: 1, levels: 2 } });
  s = circleSave(s, { type: "tap", value: { invites: 2, levels: 2 } });
  s = circleSave(s, { type: "failed" });
  assert.deepEqual(s, saved12);
});
