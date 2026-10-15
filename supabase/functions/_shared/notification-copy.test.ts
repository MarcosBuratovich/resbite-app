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
