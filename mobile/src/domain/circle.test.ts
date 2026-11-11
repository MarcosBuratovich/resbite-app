import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { circleOf, circleSave, circleSentence, firstGuestName, firstName, type Circle, type CircleSaveState } from "./circle";

// The placeholder name readGuests gives a guest without one, read from its source: rsvp.ts loads the Supabase client.
const RSVP = readFileSync(new URL("../services/rsvp.ts", import.meta.url), "utf8");
const UNNAMED = /export const UNNAMED_GUEST = "([^"]+)";/.exec(RSVP)?.[1] ?? "(not exported)";

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

test("the sentence names a going guest who isn't a host, alphabetically, else Each guest", () => {
  const guests = [
    { userId: "maybe", name: "Marta Paz", response: "maybe" },
    { userId: "admin", name: "Leo Ríos", response: "accepted" },
    { userId: "blank", name: "  ", response: "accepted" },
    { userId: "sol", name: "Sol", response: "accepted" },
    { userId: "pedro", name: "Pedro Gómez", response: "accepted" },
  ];
  assert.equal(firstGuestName(guests, ["owner", "admin"], UNNAMED), "Pedro");
  assert.equal(firstGuestName(guests, [], UNNAMED), "Leo");
  assert.equal(firstGuestName(guests, ["owner", "admin", "pedro", "sol"], UNNAMED), "Each guest");
  assert.equal(firstGuestName([{ userId: "m", name: "Marta", response: "maybe" }], [], UNNAMED), "Each guest");
  assert.equal(firstGuestName([], ["owner"], UNNAMED), "Each guest");
});

test("the example name is the same whatever order the guests come in (C16)", () => {
  const guests = [
    { userId: "u-sol", name: "Sol", response: "accepted" },
    { userId: "u-ana-2", name: "ana Ruiz", response: "accepted" },
    { userId: "u-bea", name: "Bea", response: "accepted" },
    { userId: "u-ana-1", name: "Ana Paz", response: "accepted" },
    { userId: "u-cy", name: "cy", response: "accepted" },
    { userId: "u-owner", name: "Aaron", response: "accepted" },
  ];
  const seen = new Set<string>();
  // Every rotation and its reverse: the pick never depends on the server's row order.
  for (let i = 0; i < guests.length; i++) {
    const turned = [...guests.slice(i), ...guests.slice(0, i)];
    seen.add(firstGuestName(turned, ["u-owner"], UNNAMED));
    seen.add(firstGuestName([...turned].reverse(), ["u-owner"], UNNAMED));
  }
  // "Ana" and "ana" sort together whatever their case; the tie goes to the smaller user id.
  assert.deepEqual([...seen], ["Ana"]);
  assert.equal(firstGuestName([guests[0], guests[2], guests[4]], [], UNNAMED), "Bea");
  assert.equal(firstGuestName([guests[4], guests[0]], [], UNNAMED), "cy", "case-insensitive: cy before Sol");
});

test("the placeholder readGuests gives a guest without a name is never the example (Q40)", () => {
  assert.equal(UNNAMED, "Tester");
  assert.ok(RSVP.includes("display_name || UNNAMED_GUEST"), "readGuests fills in the exported constant");
  const guests = [
    { userId: "a", name: UNNAMED, response: "accepted" },
    { userId: "b", name: "Pedro", response: "accepted" },
  ];
  assert.equal(firstGuestName(guests, [], UNNAMED), "Pedro");
  assert.equal(firstGuestName([guests[0]], [], UNNAMED), "Each guest");
  assert.equal(
    circleSentence({ name: firstGuestName([guests[0]], [], UNNAMED), invites: 1, levels: 1 }),
    "Each guest can bring 1 person. Only people with a Resbite account.",
  );
});

const at = (invites: 0 | 1 | 2 | 3, levels: 1 | 2 | 3): Circle => ({ invites, levels });
const settled = (circle: Circle, version: number): CircleSaveState => ({ saved: circle, shown: circle, saving: false, version });
const saved12 = settled(at(1, 2), 5);

test("a tap shows the value at once and starts a save", () => {
  assert.deepEqual(circleSave(saved12, { type: "tap", value: at(2, 2) }), {
    saved: at(1, 2),
    shown: at(2, 2),
    saving: true,
    version: 5,
  });
});

test("a tap while saving is ignored", () => {
  const savingOne = circleSave(settled(at(0, 1), 1), { type: "tap", value: at(1, 1) });
  assert.deepEqual(savingOne.shown, at(1, 1));
  assert.equal(circleSave(savingOne, { type: "tap", value: at(2, 1) }), savingOne);
});

test("a tap on what is shown starts nothing", () => {
  assert.equal(circleSave(saved12, { type: "tap", value: at(1, 2) }), saved12);
});

test("a saved save becomes the saved value, with the version the server returned", () => {
  const saving = circleSave(saved12, { type: "tap", value: at(2, 2) });
  assert.deepEqual(circleSave(saving, { type: "saved", value: at(2, 2), version: 6 }), settled(at(2, 2), 6));
});

test("a failed save shows the saved value again, not the one tapped", () => {
  const saving = circleSave(saved12, { type: "tap", value: at(2, 2) });
  const failed = circleSave(saving, { type: "failed" });
  assert.deepEqual(failed, saved12);
  // After the failure the next tap saves again.
  assert.equal(circleSave(failed, { type: "tap", value: at(3, 2) }).saving, true);
});

test("both choices are disabled from a tap until its save is answered, and every tap between is ignored", () => {
  let s = circleSave(saved12, { type: "tap", value: at(2, 2) });
  assert.equal(s.saving, true, "disabled while the save is in flight");
  for (const value of [at(0, 2), at(2, 3), at(1, 2)]) assert.equal(circleSave(s, { type: "tap", value }), s, "a tap while saving changes nothing");
  s = circleSave(s, { type: "saved", value: at(2, 2), version: 6 });
  assert.equal(s.saving, false, "enabled once saved");
  s = circleSave(s, { type: "tap", value: at(2, 3) });
  assert.equal(s.saving, true);
  s = circleSave(s, { type: "failed" });
  assert.equal(s.saving, false, "enabled once failed");
});

test("a run of taps and saves keeps only what the server confirmed", () => {
  let s = settled(at(0, 1), 3);
  s = circleSave(s, { type: "tap", value: at(1, 1) });
  s = circleSave(s, { type: "saved", value: at(1, 1), version: 4 });
  s = circleSave(s, { type: "tap", value: at(1, 2) });
  s = circleSave(s, { type: "saved", value: at(1, 2), version: 5 });
  s = circleSave(s, { type: "tap", value: at(2, 2) });
  s = circleSave(s, { type: "failed" });
  assert.deepEqual(s, saved12);
});

test("a plan read older than the last confirmed save is ignored (D8)", () => {
  // Nobody at v1; "1" saved as v2; "2" saved as v3. A refresh read taken at v2 lands last.
  let s = settled(at(0, 1), 1);
  s = circleSave(s, { type: "tap", value: at(1, 1) });
  s = circleSave(s, { type: "saved", value: at(1, 1), version: 2 });
  assert.equal(circleSave(s, { type: "read", value: at(0, 1), version: 1 }), s, "the screen's first read, v1");
  s = circleSave(s, { type: "tap", value: at(2, 1) });
  s = circleSave(s, { type: "saved", value: at(2, 1), version: 3 });
  const late = circleSave(s, { type: "read", value: at(1, 1), version: 2 });
  assert.equal(late, s, "the late v2 read changes nothing");
  assert.deepEqual(late, settled(at(2, 1), 3));
  // The next tap changes only what was tapped, from what the server holds.
  assert.deepEqual(circleSave(late, { type: "tap", value: at(2, 2) }).shown, at(2, 2));
});

test("a plan read at or past the confirmed version is what the server holds", () => {
  // A co-host's change, newer than anything this card saved.
  assert.deepEqual(circleSave(saved12, { type: "read", value: at(3, 3), version: 7 }), settled(at(3, 3), 7));
  // The read of this card's own save: the same numbers and version change nothing.
  assert.equal(circleSave(saved12, { type: "read", value: at(1, 2), version: 5 }), saved12);
  // The same version with other numbers (a save whose answer was lost, then read back) is taken.
  assert.deepEqual(circleSave(saved12, { type: "read", value: at(3, 2), version: 5 }), settled(at(3, 2), 5));
});

test("a plan read while a save is in flight waits for that save's answer", () => {
  const saving = circleSave(saved12, { type: "tap", value: at(2, 2) });
  assert.equal(circleSave(saving, { type: "read", value: at(3, 3), version: 9 }), saving);
});

test("a confirmed version never goes back", () => {
  const saving = circleSave(settled(at(1, 2), 8), { type: "tap", value: at(2, 2) });
  assert.equal(circleSave(saving, { type: "saved", value: at(2, 2), version: 6 }).version, 8);
});
