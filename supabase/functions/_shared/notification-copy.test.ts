import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_COPY, notificationCopy } from "./notification-copy.ts";

const base = {
  title: "Picnic in the park",
  starts_at: "2026-10-17T09:00:00Z",
  time_zone: "Europe/London",
  actor_name: "Sam",
};

test("each kind and detail has its wording under the event title", () => {
  const cases: [string, string | null, string][] = [
    ["rsvp", "accepted", "Sam is going."],
    ["rsvp", "maybe", "Sam might come."],
    ["rsvp", "declined", "Sam can’t go."],
    ["rsvp", "withdrawn", "Sam can’t go now."],
    ["invitation", null, "Sam joined from your invite."],
    ["plan_changed", "time", "New time: Sat 17 Oct, 10:00."],
    ["plan_changed", "place", "The place changed."],
    ["plan_changed", "time_place", "New time: Sat 17 Oct, 10:00, and a new place."],
    ["plan_cancelled", null, "This resbite was cancelled."],
    ["guest_note", null, "Sam posted a note to guests."],
  ];
  for (const [kind, detail, body] of cases)
    assert.deepEqual(notificationCopy({ ...base, kind, detail }), { title: "Picnic in the park", body }, `${kind}/${detail}`);
});

test("times are in the event's time zone with a 24-hour clock", () => {
  assert.equal(
    notificationCopy({ ...base, kind: "plan_changed", detail: "time", starts_at: "2026-10-17T23:30:00Z", time_zone: "Asia/Tokyo" }).body,
    "New time: Sun 18 Oct, 08:30.",
  );
});

test("anything missing or unexpected falls back to the generic text", () => {
  const fallbacks = [
    {},
    { ...base, kind: "rsvp", detail: "maybe", actor_name: null },
    { ...base, kind: "rsvp", detail: "maybe", actor_name: "   " },
    { ...base, kind: "invitation", detail: null, actor_name: null },
    { ...base, kind: "guest_note", detail: null, actor_name: null },
    { ...base, kind: "rsvp", detail: "constructor" },
    { ...base, kind: "rsvp", detail: "pending" },
    { ...base, kind: "plan_changed", detail: null },
    { ...base, kind: "plan_changed", detail: "time", time_zone: "Not/AZone" },
    { ...base, kind: "plan_changed", detail: "time", starts_at: "garbage" },
    { ...base, kind: "plan_changed", detail: "time", starts_at: null },
    { ...base, kind: "something_new", detail: null },
    { ...base, title: "  ", kind: "plan_cancelled", detail: null },
    { ...base, title: null, kind: "plan_cancelled", detail: null },
  ];
  for (const input of fallbacks) assert.deepEqual(notificationCopy(input), GENERIC_COPY, JSON.stringify(input));
  assert.deepEqual(GENERIC_COPY, { title: "Resbite", body: "You have an update. Open Resbite to see it." });
});

test("the place, notes and descriptions never reach the text, even if a job carried them", () => {
  const leaky = {
    ...base,
    place_label: "Secret café",
    note: "Secret note",
    guest_note: "Secret announcement",
    description: "Secret description",
    cover_description: "Secret photo",
  } as Parameters<typeof notificationCopy>[0];
  for (const [kind, detail] of [
    ["rsvp", "accepted"],
    ["invitation", null],
    ["plan_changed", "time_place"],
    ["plan_changed", "place"],
    ["plan_cancelled", null],
    ["guest_note", null],
  ] as const) {
    const copy = notificationCopy({ ...leaky, kind, detail });
    assert.ok(!JSON.stringify(copy).includes("Secret"), `${kind}/${detail}`);
  }
});

test("invitation and join request kinds have their wording under the event title", () => {
  const cases: [string, string][] = [
    ["invited", "Sam invited you."],
    ["join_request", "Sam asked to join."],
    ["join_approved", "Sam approved your request."],
  ];
  for (const [kind, body] of cases)
    assert.deepEqual(notificationCopy({ ...base, kind, detail: null }), { title: "Picnic in the park", body }, kind);
});

test("the new kinds fall back to the generic text without a name", () => {
  for (const kind of ["invited", "join_request", "join_approved"])
    for (const actor_name of [null, undefined, "   "])
      assert.deepEqual(notificationCopy({ ...base, kind, detail: null, actor_name }), GENERIC_COPY, `${kind}/${actor_name}`);
});

test("the new kinds never reveal a place, note, description or phone number", () => {
  const leaky = {
    ...base,
    place: "Secret café",
    place_label: "Secret café",
    note: "Secret note",
    description: "Secret description",
    phone: "+447700900123",
    phone_number: "07700900123",
  } as Parameters<typeof notificationCopy>[0];
  for (const kind of ["invited", "join_request", "join_approved"]) {
    for (const actor_name of ["Sam", null]) {
      const copy = notificationCopy({ ...leaky, kind, detail: null, actor_name });
      const text = JSON.stringify(copy);
      assert.ok(!/place|note|description|Secret/i.test(copy.body), `${kind} body`);
      assert.ok(!/\d{4,}/.test(text), `${kind} digits`);
    }
  }
});

test("admin_added names who made you an admin, under the actor's line, with the event title as the body", () => {
  assert.deepEqual(
    notificationCopy({ ...base, kind: "admin_added", detail: null, actor_name: "Marcos", title: "Board game night" }),
    { title: "Marcos made you an admin", body: "Board game night" },
  );
  assert.deepEqual(
    notificationCopy({ ...base, kind: "admin_added", actor_name: "  ", title: "Board game night" }),
    { title: "Someone made you an admin", body: "Board game night" },
  );
  assert.deepEqual(notificationCopy({ ...base, kind: "admin_added", title: "  " }), GENERIC_COPY);
});

test("invited again: the title says it is on again and the body is the start in the event's time zone", () => {
  const again = { ...base, kind: "invited", detail: "again", title: "Board game night", starts_at: "2026-11-05T19:00:00Z", time_zone: "Europe/London" };
  assert.deepEqual(notificationCopy(again), { title: "Board game night is on again", body: "Thu 5 Nov, 19:00" });
  assert.equal(notificationCopy({ ...again, starts_at: "2026-10-22T18:00:00Z" }).body, "Thu 22 Oct, 19:00");
  // No name is needed; without a usable start or title it falls back.
  assert.deepEqual(notificationCopy({ ...again, actor_name: null }), { title: "Board game night is on again", body: "Thu 5 Nov, 19:00" });
  for (const input of [{ ...again, starts_at: null }, { ...again, time_zone: "Not/AZone" }, { ...again, title: "  " }])
    assert.deepEqual(notificationCopy(input), GENERIC_COPY, JSON.stringify(input));
});

test("a connection request names how the two stand by its detail", () => {
  const req = { kind: "connection_request", title: "Picnic", actor_name: "Pedro" } as const;
  assert.deepEqual(notificationCopy({ ...req, detail: "going" }), { title: "Pedro wants to connect", body: "You're both going to Picnic." });
  assert.deepEqual(notificationCopy({ ...req, detail: "invited" }), { title: "Pedro wants to connect", body: "You're both invited to Picnic." });
  assert.deepEqual(notificationCopy({ ...req, detail: "met" }), { title: "Pedro wants to connect", body: "You were both at Picnic." });
  assert.deepEqual(notificationCopy({ ...req, starts_at: "2099-01-01T19:00:00Z" }), { title: "Pedro wants to connect", body: "You're both going to Picnic." });
  assert.deepEqual(notificationCopy({ ...req, detail: "met", starts_at: "2099-01-01T19:00:00Z" }), { title: "Pedro wants to connect", body: "You were both at Picnic." });
  assert.equal(notificationCopy({ ...req, title: "Wrap up.", detail: "going" }).body, "You're both going to Wrap up.");
  assert.equal(notificationCopy({ ...req, title: "Pizza night!", detail: "invited" }).body, "You're both invited to Pizza night!");
  assert.equal(notificationCopy({ ...req, title: "Wrap up.", detail: "met" }).body, "You were both at Wrap up.");
  assert.equal(notificationCopy({ ...req, title: "Why?", starts_at: "2099-01-01T19:00:00Z" }).body, "You're both going to Why?");
  assert.deepEqual(notificationCopy({ ...req, detail: "were_invited" }), { title: "Pedro wants to connect", body: "You were both invited to Picnic." });
  assert.equal(notificationCopy({ ...req, title: "Pizza night!", detail: "were_invited" }).body, "You were both invited to Pizza night!");
});

test("a connection request leads with who, and says where you met", () => {
  assert.deepEqual(notificationCopy({ kind: "connection_request", title: "Board game night", actor_name: "Pedro", starts_at: "2099-01-01T19:00:00Z", time_zone: "UTC" }),
    { title: "Pedro wants to connect", body: "You're both going to Board game night." });
  assert.deepEqual(notificationCopy({ kind: "connection_request", title: "Picnic", actor_name: "Pedro", starts_at: "2020-01-01T19:00:00Z", time_zone: "UTC" }),
    { title: "Pedro wants to connect", body: "You were both at Picnic." });
  assert.deepEqual(notificationCopy({ kind: "connection_accepted", title: "Picnic", actor_name: "Ana" }),
    { title: "You and Ana are now connected", body: "You can invite each other from Invite people." });
  assert.deepEqual(notificationCopy({ kind: "connection_request", title: "Picnic", actor_name: "" }), GENERIC_COPY);
});
