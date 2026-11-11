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

test("a host hears who brought the person who answered (circles of trust)", () => {
  const rsvp = { kind: "rsvp", title: "Board game night", actor_name: "Clara", brought_by_name: "Pedro" };
  const cases: [string, string][] = [
    ["accepted", "Clara is going · brought by Pedro."],
    ["maybe", "Clara might come · brought by Pedro."],
    ["declined", "Clara can’t go · brought by Pedro."],
    ["withdrawn", "Clara can’t go now · brought by Pedro."],
  ];
  for (const [detail, body] of cases)
    assert.deepEqual(notificationCopy({ ...rsvp, detail }), { title: "Board game night", body }, detail);
  // Without the field the text is unchanged.
  assert.deepEqual(notificationCopy({ kind: "rsvp", detail: "accepted", title: "Board game night", actor_name: "Clara" }), {
    title: "Board game night",
    body: "Clara is going.",
  });
  for (const brought_by_name of [null, undefined, "", "   "])
    assert.equal(notificationCopy({ ...rsvp, detail: "maybe", brought_by_name }).body, "Clara might come.", String(brought_by_name));
  // The person who answered keeps their full display name; the bringer is the first name the claim gives.
  assert.equal(notificationCopy({ ...rsvp, detail: "accepted", actor_name: "Clara Pérez" }).body, "Clara Pérez is going · brought by Pedro.");
  // Only an answer says who brought them: an invitation ignores the field.
  assert.deepEqual(notificationCopy({ kind: "invited", detail: null, title: "Board game night", actor_name: "Clara", brought_by_name: "Pedro" }), {
    title: "Board game night",
    body: "Clara invited you.",
  });
  // A first name that ends a sentence itself takes no second full stop, as a title in the connection copy (C27).
  for (const [bringer, body] of [
    ["Dr.", "Nico N might come · brought by Dr."],
    ["J.R.", "Nico N might come · brought by J.R."],
    ["Pedro!", "Nico N might come · brought by Pedro!"],
    ["Pedro?", "Nico N might come · brought by Pedro?"],
    ["Pedro…", "Nico N might come · brought by Pedro…"],
  ])
    assert.equal(notificationCopy({ ...rsvp, detail: "maybe", actor_name: "Nico N", brought_by_name: bringer }).body, body, bringer);
  // Without the answerer's name or a known answer it still falls back.
  assert.deepEqual(notificationCopy({ ...rsvp, detail: "accepted", actor_name: null }), GENERIC_COPY);
  assert.deepEqual(notificationCopy({ ...rsvp, detail: "pending" }), GENERIC_COPY);
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

test("a chat message and an announcement carry the sender's first name and their words under the event title", () => {
  const chat = { title: "Board game night", actor_name: "Leo Martínez", message_body: "See you at 8, I'll bring snacks" };
  assert.deepEqual(notificationCopy({ ...chat, kind: "chat_message" }), {
    title: "Board game night",
    body: "Leo: See you at 8, I'll bring snacks",
  });
  assert.deepEqual(notificationCopy({ ...chat, kind: "announcement" }), {
    title: "Board game night",
    body: "Announcement from Leo: See you at 8, I'll bring snacks",
  });
  // The first word of the name the claim gives, whatever the spacing around it (K-N3, rule 8).
  for (const actor_name of ["Leo", "  Leo   Martínez ", "Leo\tMartínez"])
    assert.equal(notificationCopy({ ...chat, kind: "chat_message", actor_name }).body, "Leo: See you at 8, I'll bring snacks", actor_name);
  // Other kinds keep the name as the claim gives it.
  assert.equal(notificationCopy({ ...chat, kind: "rsvp", detail: "accepted" }).body, "Leo Martínez is going.");
  assert.equal(notificationCopy({ ...chat, kind: "invited" }).body, "Leo Martínez invited you.");
});

test("a chat push cuts the words at 120 characters with an ellipsis", () => {
  const chat = { kind: "chat_message", title: "Board game night", actor_name: "Leo Martínez" };
  const long = "a".repeat(130);
  assert.equal(notificationCopy({ ...chat, message_body: long }).body, `Leo: ${"a".repeat(120)}…`);
  assert.equal(notificationCopy({ ...chat, kind: "announcement", message_body: long }).body, `Announcement from Leo: ${"a".repeat(120)}…`);
  // Exactly 120 stays whole; 121 is cut.
  assert.equal(notificationCopy({ ...chat, message_body: "b".repeat(120) }).body, `Leo: ${"b".repeat(120)}`);
  assert.equal(notificationCopy({ ...chat, message_body: "b".repeat(121) }).body, `Leo: ${"b".repeat(120)}…`);
});

test("the cut counts code points, so an emoji is never split (K-N3)", () => {
  const chat = { kind: "chat_message", title: "Board game night", actor_name: "Leo Martínez" };
  const letters = "c".repeat(119);
  const body = notificationCopy({ ...chat, message_body: `${letters}🎉x` }).body;
  assert.equal(body, `Leo: ${letters}🎉…`);
  // No lone surrogate anywhere: a UTF-16 cut at 120 would leave half of the emoji.
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(body));
  // 120 code points that are 121 UTF-16 units stay whole.
  assert.equal(notificationCopy({ ...chat, message_body: `${letters}🎉` }).body, `Leo: ${letters}🎉`);
});

test("a chat push without a name, words or title falls back to the generic text", () => {
  const chat = { title: "Board game night", actor_name: "Leo Martínez", message_body: "Hello" };
  for (const kind of ["chat_message", "announcement"]) {
    for (const actor_name of [null, undefined, "", "   "])
      assert.deepEqual(notificationCopy({ ...chat, kind, actor_name }), GENERIC_COPY, `${kind}/name ${JSON.stringify(actor_name)}`);
    for (const message_body of [null, undefined, "", "   "])
      assert.deepEqual(notificationCopy({ ...chat, kind, message_body }), GENERIC_COPY, `${kind}/body ${JSON.stringify(message_body)}`);
    for (const title of [null, "  "])
      assert.deepEqual(notificationCopy({ ...chat, kind, title }), GENERIC_COPY, `${kind}/title ${JSON.stringify(title)}`);
  }
});

test("only the two chat kinds carry the message's words", () => {
  const leaky = { ...base, message_body: "Secret words" };
  for (const [kind, detail] of [
    ["rsvp", "accepted"],
    ["invitation", null],
    ["invited", null],
    ["invited", "again"],
    ["guest_note", null],
    ["plan_changed", "time_place"],
    ["plan_cancelled", null],
    ["admin_added", null],
    ["connection_request", "going"],
    ["connection_accepted", null],
  ] as const)
    assert.ok(!JSON.stringify(notificationCopy({ ...leaky, kind, detail })).includes("Secret"), `${kind}/${detail}`);
});

test("the first name reads as the chat's own helper gives it: every Unicode space splits, control characters go", () => {
  const chat = { kind: "chat_message", title: "Board game night", message_body: "Hi" };
  for (const actor_name of ["Leo Martínez", "Leo Martínez", "Leo　Martínez", "﻿Leo Martínez", "Le\u0007o Martínez", "\u0000Leo\u001b Martínez"])
    assert.equal(notificationCopy({ ...chat, actor_name }).body, "Leo: Hi", JSON.stringify(actor_name));
  // A name that is only control characters is no name.
  assert.deepEqual(notificationCopy({ ...chat, actor_name: "\u0007\u0008 Martínez" }), GENERIC_COPY);
});
