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

test("the cut counts graphemes, so no emoji, flag or accent is ever split (K-N3, H3)", () => {
  const chat = { kind: "chat_message", title: "Board game night", actor_name: "Leo Martínez" };
  const letters = "c".repeat(119);
  const body = notificationCopy({ ...chat, message_body: `${letters}🎉x` }).body;
  assert.equal(body, `Leo: ${letters}🎉…`);
  // No lone surrogate anywhere: a UTF-16 cut at 120 would leave half of the emoji.
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(body));
  // 120 graphemes that are 121 UTF-16 units stay whole.
  assert.equal(notificationCopy({ ...chat, message_body: `${letters}🎉` }).body, `Leo: ${letters}🎉`);
  // A family (7 code points), a flag (2), a skin tone (2) and a decomposed accent (2) are each one grapheme.
  for (const [name, glyph] of [
    ["family", "👨\u200d👩\u200d👧\u200d👦"],
    ["flag", "🇬🇧"],
    ["skin tone", "👍🏽"],
    ["accent", "e\u0301"],
  ]) {
    assert.equal(notificationCopy({ ...chat, message_body: `${letters}${glyph}z` }).body, `Leo: ${letters}${glyph}…`, `${name} at the cut`);
    assert.equal(notificationCopy({ ...chat, message_body: `${letters}${glyph}` }).body, `Leo: ${letters}${glyph}`, `${name} as the 120th`);
    assert.equal(notificationCopy({ ...chat, message_body: glyph.repeat(120) }).body, `Leo: ${glyph.repeat(120)}`, `120 ${name}s`);
    assert.equal(notificationCopy({ ...chat, message_body: glyph.repeat(121) }).body, `Leo: ${glyph.repeat(120)}…`, `121 ${name}s`);
  }
});

test("a cut never leaves a space before the ellipsis (H3)", () => {
  const chat = { kind: "chat_message", title: "Board game night", actor_name: "Leo" };
  assert.equal(notificationCopy({ ...chat, message_body: `${"x".repeat(119)} hello` }).body, `Leo: ${"x".repeat(119)}…`);
  // The five spaces count as one: 114 + 1 + 5 is 120.
  assert.equal(notificationCopy({ ...chat, message_body: `${"x".repeat(114)}     hello world` }).body, `Leo: ${"x".repeat(114)} hello…`);
  assert.equal(notificationCopy({ ...chat, kind: "announcement", message_body: `${"x".repeat(119)}\n\nhello` }).body, `Announcement from Leo: ${"x".repeat(119)}…`);
});

test("a chat push's words are one clean line: white space collapsed, controls and bidi controls gone, well formed (H18)", () => {
  const chat = { kind: "chat_message", title: "Board game night", actor_name: "Leo" };
  const words = (message_body: string) => notificationCopy({ ...chat, message_body }).body;
  // Runs of spaces, newlines and tabs read as one space; the ends are trimmed.
  assert.equal(words("hi\nthere\tyou\r\nbye"), "Leo: hi there you bye");
  assert.equal(words("\n\n  see   you \u3000 at\u00a0\u00a08 \n"), "Leo: see you at 8");
  // 200 lines of "a" read "a a a …": 120 graphemes are 60 letters and 60 spaces, and the last space is trimmed.
  assert.equal(words("a\n".repeat(200)), `Leo: ${"a ".repeat(59)}a…`);
  // Controls go, C0 and C1 alike; the words around them stay.
  assert.equal(words("a\u0000b\u0007c\u001b[31mred\u007f\u0085\u009b!"), "Leo: abc[31mred!");
  assert.equal(words("a \u0007 b"), "Leo: a b");
  // Embeddings, overrides and isolates go, so nothing flips the rest of the banner.
  for (const bidi of ["\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"])
    assert.equal(words(`${bidi}evil${bidi} text`), "Leo: evil text", JSON.stringify(bidi));
  // Lone surrogates go, so the provider gets a well-formed string.
  assert.equal(words("a\ud800b\udc00c"), "Leo: abc");
  assert.equal(words(`${"a".repeat(119)}\ud800zz`), `Leo: ${"a".repeat(119)}z…`);
  // A joiner inside an emoji, and right-to-left words, are kept as written.
  assert.equal(words("👨\u200d👩\u200d👧 שלום"), "Leo: 👨\u200d👩\u200d👧 שלום");
  // So does the announcement.
  assert.equal(notificationCopy({ ...chat, kind: "announcement", message_body: "\u202eDoors\n\nat 8" }).body, "Announcement from Leo: Doors at 8");
});

test("words with nothing visible in them count as no words (H18)", () => {
  const chat = { title: "Board game night", actor_name: "Leo" };
  for (const kind of ["chat_message", "announcement"])
    for (const message_body of ["\u200b", "\u200b\u200b", "\u200d", "\u200c", "\ufeff", "\u2060", "\u00ad", "\u202e", "\u2066\u2069", "\ufe0f", "\u3164\u2800", "\u115f\u1160\uffa0", "\u0007", "\ud800", " \n\u200b\t\u200b "])
      assert.deepEqual(notificationCopy({ ...chat, kind, message_body }), GENERIC_COPY, `${kind} ${JSON.stringify(message_body)}`);
  // One visible character is enough.
  assert.equal(notificationCopy({ ...chat, kind: "chat_message", message_body: "\u200bhi" }).body, "Leo: \u200bhi");
  assert.equal(notificationCopy({ ...chat, kind: "chat_message", message_body: "\u200b." }).body, "Leo: \u200b.");
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

test("the first name: every Unicode space splits; controls, zero-width and format characters go first (H18)", () => {
  const chat = { kind: "chat_message", title: "Board game night", message_body: "Hi" };
  const name = (actor_name: string) => notificationCopy({ ...chat, actor_name }).body;
  for (const actor_name of [
    "Leo\u00a0Martínez",
    "Leo\u2009Martínez",
    "Leo\u3000Martínez",
    "\ufeffLeo Martínez",
    "Le\u0007o Martínez",
    "\u0000Leo\u001b Martínez",
    "\u200b Leo Martínez",
    "\u200b\u200c\u200dLeo Martínez",
    "Le\u200bo Martínez",
    "\u2068Leo\u2069 Martínez",
    "\u202aLeo\u202c Martínez",
    "Le\u00ado Martínez",
    "\u3164 Leo Martínez",
    "Leo\ud800 Martínez",
  ])
    assert.equal(name(actor_name), "Leo: Hi", JSON.stringify(actor_name));
  // A character that is both white space and a format character (U+FEFF) still splits, as private.first_name splits.
  assert.equal(name("Leo\ufeffMartínez"), "Leo: Hi");
  assert.equal(name("Leo\u200b\ufeff\u200bMartínez"), "Leo: Hi");
  // An override no longer flips the line: the letters stay in their stored order.
  assert.equal(name("\u202eoeL"), "oeL: Hi");
  // A control before the first word no longer hides it.
  assert.equal(name("\u0007\u0008 Martínez"), "Martínez: Hi");
});

test("the first name loses a trailing colon, comma or semicolon and is capped at 30 graphemes (H18)", () => {
  const chat = { kind: "chat_message", title: "Board game night", message_body: "Hi" };
  const name = (actor_name: string) => notificationCopy({ ...chat, actor_name }).body;
  assert.equal(name("Leo:"), "Leo: Hi");
  assert.equal(name("Leo::"), "Leo: Hi");
  assert.equal(name("O'Brien-Smith, J."), "O'Brien-Smith: Hi");
  assert.equal(name("Leo; Martínez"), "Leo: Hi");
  assert.equal(name("Leo,;: Martínez"), "Leo: Hi");
  // Other punctuation is part of the name.
  assert.equal(name("Dr. Who"), "Dr.: Hi");
  assert.equal(name("Leo! Martínez"), "Leo!: Hi");
  // 30 graphemes stay whole; more are cut to 30 and an ellipsis.
  assert.equal(name("A".repeat(30)), `${"A".repeat(30)}: Hi`);
  assert.equal(name("A".repeat(31)), `${"A".repeat(30)}…: Hi`);
  assert.equal(name(`${"A".repeat(500)} B`), `${"A".repeat(30)}…: Hi`);
  assert.equal(name("🇬🇧".repeat(31)), `${"🇬🇧".repeat(30)}…: Hi`);
  assert.equal(notificationCopy({ ...chat, kind: "announcement", actor_name: `${"A".repeat(40)}:` }).body, `Announcement from ${"A".repeat(30)}…: Hi`);
  // Other kinds keep the name as the claim gives it.
  assert.equal(notificationCopy({ kind: "invited", title: "Board game night", actor_name: "Leo: Martínez" }).body, "Leo: Martínez invited you.");
});

test("a first name that is blank once cleaned gives the generic text (H18)", () => {
  const chat = { title: "Board game night", message_body: "Hi" };
  for (const kind of ["chat_message", "announcement"])
    for (const actor_name of [":", ",;:", ": Leo", "\u200b", "\u200b\u200c", "\u202e", "\u2066\u2069", "\u3164", "\u2800", "\u0007\u0008", "\ufe0f", "\ud800", "\u200b:"])
      assert.deepEqual(notificationCopy({ ...chat, kind, actor_name }), GENERIC_COPY, `${kind} ${JSON.stringify(actor_name)}`);
});

test("without Intl.Segmenter the copy cuts by code point, never splitting a surrogate pair", () => {
  const saved = Intl.Segmenter;
  delete (Intl as { Segmenter?: unknown }).Segmenter;
  try {
    const chat = { kind: "chat_message", title: "Board game night", actor_name: "Leo Martínez" };
    assert.equal(notificationCopy({ ...chat, message_body: `${"c".repeat(119)}🎉x` }).body, `Leo: ${"c".repeat(119)}🎉…`);
    // A flag is two code points: the fallback keeps the first (well formed, though no longer the flag).
    assert.equal(notificationCopy({ ...chat, message_body: `${"c".repeat(119)}🇬🇧z` }).body, `Leo: ${"c".repeat(119)}🇬…`);
    assert.equal(notificationCopy({ ...chat, message_body: "See you\n at 8" }).body, "Leo: See you at 8");
    assert.equal(notificationCopy({ ...chat, actor_name: "A".repeat(31), message_body: "Hi" }).body, `${"A".repeat(30)}…: Hi`);
  } finally {
    (Intl as { Segmenter?: unknown }).Segmenter = saved;
  }
  // With it back, graphemes again.
  assert.equal(
    notificationCopy({ kind: "chat_message", title: "T", actor_name: "Leo", message_body: `${"c".repeat(119)}🇬🇧z` }).body,
    `Leo: ${"c".repeat(119)}🇬🇧…`,
  );
});
