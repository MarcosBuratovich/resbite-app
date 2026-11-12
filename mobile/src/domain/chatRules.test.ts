import test from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage, ChatNames, ChatSummary } from "../services/chat";
import {
  BODY_LIMIT,
  authorName,
  canAnnounce,
  closedCard,
  closingLine,
  dayLabel,
  defaultAudience,
  fitBody,
  hasVisibleText,
  headerLine,
  isSeriesId,
  linkHost,
  linkParts,
  messageLabel,
  phoneZone,
  rowText,
  systemText,
  timeLabel,
} from "./chatRules";
import { CHAT_COPY } from "./chatCopy";

const ANA = "0a000000-0000-4000-8000-000000000001";
const LEO = "0a000000-0000-4000-8000-000000000002";
const MIA = "0a000000-0000-4000-8000-000000000003";
const SOL = "0a000000-0000-4000-8000-000000000004";
const PEDRO = "0a000000-0000-4000-8000-000000000005";
const CLARA = "0a000000-0000-4000-8000-000000000006";
const GONE = "0a000000-0000-4000-8000-000000000007";
const UNKNOWN = "0a000000-0000-4000-8000-000000000008";
const names: ChatNames = { [ANA]: "Ana", [LEO]: "Leo", [MIA]: "Mia", [SOL]: "Sol", [PEDRO]: "Pedro", [CLARA]: "Clara", [GONE]: null };
const LONDON = "Europe/London";
const HOUR = 3_600_000;
const MINUTE = 60_000;

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 1,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: "I can bring the snacks",
  state: "sent",
  authorId: LEO,
  createdAt: "2025-11-15T18:02:00Z",
  updatedAt: "2025-11-15T18:02:00Z",
  clientId: null,
  ...over,
});
const sys = (event: string, payload: Record<string, unknown>) =>
  msg({ kind: "system", event, payload, body: null, authorId: null });
const line = (event: string, payload: Record<string, unknown>, viewer = UNKNOWN) =>
  systemText(sys(event, payload), names, viewer, false, "Picnic in the park");

const summary = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  seriesId: "0b000000-0000-4000-8000-000000000001",
  planId: "0c000000-0000-4000-8000-000000000001",
  title: "Picnic in the park",
  startsAt: "2026-10-30T18:00:00Z",
  endsAt: "2026-10-30T21:00:00Z",
  timeZone: LONDON,
  status: "active",
  repeatWeeks: null,
  isGroup: false,
  stopped: false,
  closesAt: "2026-11-01T21:00:00Z",
  open: true,
  host: false,
  accepted: 6,
  members: 8,
  going: 8,
  everyone: 9,
  pinned: null,
  last: null,
  names: {},
  mutedChat: false,
  mutedResbite: false,
  lastReadId: null,
  unread: false,
  messageCount: 0,
  ...over,
});

test("closingLine counts whole hours down, floored, then minutes in the last hour (K-N4)", () => {
  const closes = "2025-11-17T18:00:00Z";
  const at = Date.parse(closes);
  const words = (left: string) => `This chat closes Mon 17 Nov at 18:00, in ${left}. Any final words?`;
  assert.equal(closingLine(closes, at - 31 * HOUR - 30 * MINUTE, LONDON), words("31 hours"));
  assert.equal(closingLine(closes, at - 48 * HOUR, LONDON), words("48 hours"));
  assert.equal(closingLine(closes, at - 2 * HOUR, LONDON), words("2 hours"));
  assert.equal(closingLine(closes, at - HOUR - 59 * MINUTE, LONDON), words("1 hour"));
  assert.equal(closingLine(closes, at - HOUR, LONDON), words("1 hour"));
  assert.equal(closingLine(closes, at - 50 * MINUTE - 30_000, LONDON), words("50 minutes"));
  assert.equal(closingLine(closes, at - 2 * MINUTE, LONDON), words("2 minutes"));
  assert.equal(closingLine(closes, at - MINUTE, LONDON), words("1 minute"));
  assert.equal(closingLine(closes, at - 30_000, LONDON), words("1 minute"));
  assert.equal(closingLine(closes, at - 1, LONDON), words("1 minute"));
});

test("closingLine is null with no close time, once it has passed, and more than 48 hours away", () => {
  const closes = "2025-11-17T18:00:00Z";
  const at = Date.parse(closes);
  assert.equal(closingLine(null, at, LONDON), null);
  assert.equal(closingLine(closes, at - 49 * HOUR, LONDON), null);
  assert.equal(closingLine(closes, at - 48 * HOUR - 1, LONDON), null);
  assert.equal(closingLine(closes, at, LONDON), null);
  assert.equal(closingLine(closes, at + MINUTE, LONDON), null);
});

test("closingLine writes the date and time in the plan's zone, whatever the phone's", () => {
  const before = process.env.TZ;
  process.env.TZ = "Pacific/Auckland";
  try {
    const closes = "2025-11-17T18:00:00Z";
    assert.equal(
      closingLine(closes, Date.parse(closes) - 31 * HOUR, LONDON),
      "This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?",
    );
    // The same instant in a Buenos Aires plan reads its own clock.
    const ba = "2025-11-17T21:00:00Z";
    assert.equal(
      closingLine(ba, Date.parse(ba) - 31 * HOUR, "America/Argentina/Buenos_Aires"),
      "This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?",
    );
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test("dayLabel and timeLabel write the day and the clock in the zone they're given", () => {
  assert.equal(dayLabel("2025-11-15T18:02:00Z", LONDON), "Sat 15 Nov");
  assert.equal(timeLabel("2025-11-15T18:02:00Z", LONDON), "18:02");
  assert.equal(timeLabel("2025-11-15T18:02:00Z", "America/Argentina/Buenos_Aires"), "15:02");
  assert.equal(dayLabel("2025-11-15T23:30:00Z", "Europe/Madrid"), "Sun 16 Nov");
});

test("systemText: joined names the person who joined, whoever acted, and who brought them (K-B2)", () => {
  assert.equal(line("joined", { actor: MIA, user: MIA }), "Mia joined");
  assert.equal(line("joined", { actor: ANA, user: MIA }), "Mia joined", "a host's approval names Mia");
  assert.equal(line("joined", { actor: MIA, user: MIA }, MIA), "You joined");
  assert.equal(line("joined", { actor: GONE, user: GONE }), "Someone joined");
  assert.equal(line("joined", { actor: null, user: UNKNOWN }, ANA), "Someone joined", "a uuid missing from names");
  assert.equal(line("joined", { actor: CLARA, user: CLARA, brought_by: PEDRO }), "Clara joined · brought by Pedro");
  assert.equal(line("joined", { actor: CLARA, user: CLARA, brought_by: PEDRO }, PEDRO), "Clara joined · brought by you");
  assert.equal(line("joined", { actor: CLARA, user: CLARA, brought_by: PEDRO }, CLARA), "You joined · brought by Pedro");
  assert.equal(line("joined", { actor: CLARA, user: CLARA, brought_by: null }), "Clara joined");
  assert.equal(line("joined", { actor: CLARA, user: CLARA, brought_by: GONE }), "Clara joined", "a bringer with no name is left out");
});

test("systemText: can't go and admin lines name their person, and say You to the viewer", () => {
  assert.equal(line("cant_go", { actor: SOL, user: SOL }), "Sol can’t make it");
  assert.equal(line("cant_go", { actor: SOL, user: SOL }, SOL), "You can’t make it");
  assert.equal(line("cant_go", { actor: GONE, user: GONE }), "Someone can’t make it");
  assert.equal(line("admin", { actor: ANA, user: LEO }), "Leo is now an admin");
  assert.equal(line("admin", { actor: ANA, user: LEO }, LEO), "You are now an admin");
  assert.equal(line("admin", { actor: ANA, user: GONE }), "Someone is now an admin");
});

const change = (over: Record<string, unknown>) => ({
  actor: ANA,
  what: "time",
  from_start: "2025-11-14T19:00:00Z",
  to_start: "2025-11-14T19:00:00Z",
  from_end: "2025-11-14T22:00:00Z",
  to_end: "2025-11-14T22:00:00Z",
  from_zone: LONDON,
  to_zone: LONDON,
  place_label: "Nico's, Villa Crespo",
  ...over,
});

test("systemText: a time change reads each start in its own zone, the day only when it moves (K-S3)", () => {
  assert.equal(line("changed", change({ to_start: "2025-11-14T19:30:00Z" })), "Ana changed the time · 19:00 → 19:30");
  assert.equal(line("changed", change({ to_start: "2025-11-15T19:00:00Z" })), "Ana changed the time · Fri 19:00 → Sat 19:00");
  // A move of a week or more would read the same weekday twice, so it carries the dates.
  assert.equal(
    line("changed", change({ to_start: "2025-11-21T19:00:00Z" })),
    "Ana changed the time · Fri 14 Nov 19:00 → Fri 21 Nov 19:00",
  );
  assert.equal(line("changed", change({ to_end: "2025-11-14T23:00:00Z" })), "Ana changed the end · 22:00 → 23:00");
  assert.equal(
    line("changed", change({ to_end: "2025-11-15T02:00:00Z" })),
    "Ana changed the end · Fri 22:00 → Sat 02:00",
  );
  assert.equal(line("changed", change({ from_end: null, to_end: "2025-11-14T23:00:00Z" })), "Ana changed the end · 23:00");
  assert.equal(line("changed", change({ to_end: null })), "Ana changed the end");
  // A zone fix: Madrid's 19:00 and 22:00 are London's 18:00 and 21:00, so both read the same.
  assert.equal(
    line("changed", change({ to_start: "2025-11-14T18:00:00Z", to_end: "2025-11-14T21:00:00Z", to_zone: "Europe/Madrid" })),
    "Ana changed the time",
  );
  // The new start read in the new zone: 18:00 UTC is 19:00 in Madrid.
  assert.equal(
    line("changed", change({ to_start: "2025-11-14T18:30:00Z", to_zone: "Europe/Madrid" })),
    "Ana changed the time · 19:00 → 19:30",
  );
});

test("systemText: place, and time and place, carry the new label as the mockup shows", () => {
  assert.equal(line("changed", change({ what: "place" })), "Ana changed the place · Nico's, Villa Crespo");
  assert.equal(line("changed", change({ what: "place", place_label: null })), "Ana changed the place");
  assert.equal(
    line("changed", change({ what: "time_place", to_start: "2025-11-15T19:00:00Z" })),
    "Ana changed the time and place · Sat 19:00 · Nico's, Villa Crespo",
  );
  assert.equal(
    line("changed", change({ what: "time_place", to_start: "2025-11-15T19:00:00Z", place_label: "" })),
    "Ana changed the time and place · Sat 19:00",
  );
});

test("systemText: the actor reads You to the viewer, Someone with no name, and no person with no actor", () => {
  assert.equal(line("changed", change({ what: "place" }), ANA), "You changed the place · Nico's, Villa Crespo");
  assert.equal(line("changed", change({ to_start: "2025-11-14T19:30:00Z" }), ANA), "You changed the time · 19:00 → 19:30");
  assert.equal(line("cancelled", { actor: ANA }, ANA), "You cancelled the resbite");
  assert.equal(line("cancelled", { actor: ANA }), "Ana cancelled the resbite");
  assert.equal(line("cancelled", { actor: GONE }), "Someone cancelled the resbite");
  assert.equal(line("changed", change({ what: "place", actor: GONE })), "Someone changed the place · Nico's, Villa Crespo");
  assert.equal(line("changed", change({ what: "place", actor: null })), "The place changed · Nico's, Villa Crespo");
  assert.equal(line("changed", change({ actor: null, to_start: "2025-11-14T19:30:00Z" })), "The time changed · 19:00 → 19:30");
  assert.equal(line("changed", change({ actor: null, to_end: "2025-11-14T23:00:00Z" })), "The end changed · 22:00 → 23:00");
  assert.equal(
    line("changed", change({ actor: null, what: "time_place", to_start: "2025-11-15T19:00:00Z" })),
    "The time and place changed · Sat 19:00 · Nico's, Villa Crespo",
  );
  assert.equal(
    line("changed", change({ actor: null, to_start: "2025-11-14T18:00:00Z", to_end: "2025-11-14T21:00:00Z", to_zone: "Europe/Madrid" })),
    "The time changed",
  );
  assert.equal(line("cancelled", { actor: null }), "The resbite was cancelled");
  assert.equal(line("cancelled", {}), "The resbite was cancelled");
});

test("systemText: an ended line names the resbite, and an event this build doesn't know gives no line", () => {
  assert.equal(line("ended", { title: "Board game night" }), "Board game night ended");
  assert.equal(line("ended", {}), "Picnic in the park ended");
  assert.equal(line("something_new", { actor: ANA }), "");
  assert.equal(systemText(msg({ kind: "system", event: null, payload: null, authorId: null }), names, ANA, false, "x"), "");
});

test("rowText: the Chat row's latest line", () => {
  assert.equal(rowText(null, names, ANA, false), "No messages yet");
  assert.equal(rowText(msg(), names, ANA, false), "Leo: I can bring the snacks");
  assert.equal(rowText(msg(), names, LEO, false), "You: I can bring the snacks");
  assert.equal(rowText(msg({ authorId: GONE }), names, ANA, false), "Someone: I can bring the snacks");
  assert.equal(rowText(msg({ state: "deleted", body: null }), names, ANA, false), "Message deleted");
  assert.equal(rowText(msg({ state: "deleted", body: null, authorId: null }), names, ANA, false), "Message deleted");
  assert.equal(rowText(msg({ state: "removed", body: null }), names, ANA, false), "Message removed by an admin");
  assert.equal(rowText(sys("cant_go", { actor: SOL, user: SOL }), names, ANA, false), "Sol can’t make it");
  assert.equal(rowText(sys("changed", change({ what: "place" })), names, ANA, false), "You changed the place · Nico's, Villa Crespo");
  assert.equal(
    rowText(msg({ kind: "announcement", audience: "everyone", authorId: ANA, body: "Doors open at 19:30" }), names, LEO, false),
    "Announcement from Ana · Doors open at 19:30",
  );
});

test("headerLine: the date in the plan's zone and the event page's Going number (K-N7)", () => {
  const before = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(headerLine(summary(), before), "Fri 30 Oct · 6 going", "accepted, not the audience count");
  assert.equal(headerLine(summary({ accepted: 1 }), before), "Fri 30 Oct · 1 going");
  // 23:30 UTC on Friday is already Saturday in Madrid.
  assert.equal(headerLine(summary({ startsAt: "2026-10-30T23:30:00Z", endsAt: null, timeZone: "Europe/Madrid" }), before), "Sat 31 Oct · 6 going");
  const picnic = summary({ startsAt: "2025-11-15T13:00:00Z", endsAt: "2025-11-15T17:00:00Z", accepted: 7 });
  assert.equal(headerLine(picnic, Date.parse("2025-11-15T16:59:00Z")), "Sat 15 Nov · 7 going");
  assert.equal(headerLine(picnic, Date.parse("2025-11-15T17:00:00Z")), "Ended · Sat 15 Nov · 7 going");
  // With no end time, the start is the end.
  assert.equal(headerLine(summary({ endsAt: null }), Date.parse("2026-10-30T18:00:00Z")), "Ended · Fri 30 Oct · 6 going");
});

test("defaultAudience and canAnnounce", () => {
  assert.equal(defaultAudience(summary()), "going");
  assert.equal(defaultAudience(summary({ isGroup: true })), "everyone");
  assert.equal(canAnnounce(summary({ host: true })), true);
  assert.equal(canAnnounce(summary({ host: true, open: false })), false);
  assert.equal(canAnnounce(summary({ host: false })), false);
});

test("closedCard: a cancelled one-off, and a closed one with its date in the plan's zone", () => {
  assert.deepEqual(closedCard(summary({ status: "cancelled", closesAt: null, open: false })), {
    line: "This chat is read-only because the resbite was cancelled.",
    why: null,
  });
  const why = "Resbite chats close 48 hours after the resbite, so the plan stays offline. You can still read everything here.";
  assert.deepEqual(closedCard(summary({ closesAt: "2025-11-17T18:00:00Z", open: false })), {
    line: "This chat closed on Mon 17 Nov.",
    why,
  });
  assert.deepEqual(closedCard(summary({ closesAt: "2025-11-17T23:30:00Z", timeZone: "Europe/Madrid", open: false })), {
    line: "This chat closed on Tue 18 Nov.",
    why,
  });
  // No close time and not cancelled: still a closed card, with no date to give.
  assert.deepEqual(closedCard(summary({ closesAt: null, open: false })), { line: "This chat is closed.", why: null });
});

test("linkParts links http and https only, and linkHost names the host (K-N14)", () => {
  assert.deepEqual(linkParts("https://example.com/x"), [{ text: "https://example.com/x", href: "https://example.com/x" }]);
  assert.equal(linkHost("https://example.com/x"), "example.com");
  assert.deepEqual(linkParts("Menu: http://example.com/menu?day=1#top see you"), [
    { text: "Menu: " },
    { text: "http://example.com/menu?day=1#top", href: "http://example.com/menu?day=1#top" },
    { text: " see you" },
  ]);
  assert.deepEqual(linkParts("ftp://example.com"), [{ text: "ftp://example.com" }]);
  assert.deepEqual(linkParts("javascript:alert(1)"), [{ text: "javascript:alert(1)" }]);
  assert.deepEqual(linkParts("Call 07700 900123"), [{ text: "Call 07700 900123" }]);
  assert.deepEqual(linkParts("+44 7700 900123 or tel:+447700900123"), [{ text: "+44 7700 900123 or tel:+447700900123" }]);
  assert.deepEqual(linkParts(""), []);
});

test("linkParts leaves a host with a non-ASCII letter, or its punycode, as plain text (Decision 15)", () => {
  const cyrillic = "https://exаmple.com/login";
  assert.deepEqual(linkParts(cyrillic), [{ text: cyrillic }]);
  assert.deepEqual(linkParts(`see ${cyrillic} now`), [{ text: `see ${cyrillic} now` }]);
  assert.deepEqual(linkParts("https://xn--exmple-4nf.com/login"), [{ text: "https://xn--exmple-4nf.com/login" }]);
  assert.deepEqual(linkParts("https://ex%D0%B0mple.com/"), [{ text: "https://ex%D0%B0mple.com/" }]);
  // The path may carry any letter; only the host matters.
  assert.deepEqual(linkParts("https://example.com/café"), [{ text: "https://example.com/café", href: "https://example.com/café" }]);
});

test("linkParts trims the punctuation around a link and finds more than one", () => {
  assert.deepEqual(linkParts("Look: https://example.com/x."), [
    { text: "Look: " },
    { text: "https://example.com/x", href: "https://example.com/x" },
    { text: "." },
  ]);
  assert.deepEqual(linkParts("(https://example.com/x)"), [
    { text: "(" },
    { text: "https://example.com/x", href: "https://example.com/x" },
    { text: ")" },
  ]);
  assert.deepEqual(linkParts("https://en.wikipedia.org/wiki/Azul_(game)"), [
    { text: "https://en.wikipedia.org/wiki/Azul_(game)", href: "https://en.wikipedia.org/wiki/Azul_(game)" },
  ]);
  assert.deepEqual(linkParts("https://a.example, https://b.example!"), [
    { text: "https://a.example", href: "https://a.example" },
    { text: ", " },
    { text: "https://b.example", href: "https://b.example" },
    { text: "!" },
  ]);
  assert.deepEqual(linkParts("nothttps://example.com"), [{ text: "nothttps://example.com" }]);
  assert.deepEqual(linkParts("https://"), [{ text: "https://" }]);
  assert.deepEqual(linkParts("line one\nhttps://example.com"), [
    { text: "line one\n" },
    { text: "https://example.com", href: "https://example.com" },
  ]);
});

test("linkHost lowercases and drops the port, so the confirm names the host the link opens", () => {
  assert.equal(linkHost("HTTPS://Example.COM:8080/Path"), "example.com");
  assert.equal(linkHost("https://example.com./x"), "example.com");
  assert.equal(linkHost("ftp://example.com"), "");
  assert.equal(linkHost("not a link"), "");
});

test("messageLabel: author, text and time, the day when it isn't today, You and the send state (K-S14)", () => {
  const sunday = Date.parse("2025-11-16T12:00:00Z");
  const saturday = Date.parse("2025-11-15T20:00:00Z");
  assert.equal(messageLabel(msg(), names, ANA, saturday, LONDON), "Leo, I can bring the snacks, 18:02");
  assert.equal(messageLabel(msg(), names, ANA, sunday, LONDON), "Leo, I can bring the snacks, Sat 15 Nov, 18:02");
  assert.equal(messageLabel(msg(), names, ANA, saturday, "America/Argentina/Buenos_Aires"), "Leo, I can bring the snacks, 15:02");
  assert.equal(messageLabel(msg({ authorId: GONE }), names, ANA, saturday, LONDON), "Someone, I can bring the snacks, 18:02");
  const mine = msg({ authorId: ANA, body: "On my way" });
  assert.equal(messageLabel(mine, names, ANA, saturday, LONDON), "You, On my way, 18:02");
  assert.equal(messageLabel(mine, names, ANA, saturday, LONDON, "sending"), "You, On my way, 18:02, Sending…");
  assert.equal(messageLabel(mine, names, ANA, saturday, LONDON, "failed"), "You, On my way, 18:02, Not sent. Tap to retry.");
  assert.equal(messageLabel(msg({ state: "deleted", body: null }), names, ANA, saturday, LONDON), "Leo, Message deleted, 18:02");
  assert.equal(messageLabel(msg({ state: "removed", body: null }), names, ANA, saturday, LONDON), "Leo, Message removed by an admin, 18:02");
});

test("messageLabel: a system line is Resbite's, an announcement says its audience in words", () => {
  const saturday = Date.parse("2025-11-15T20:00:00Z");
  assert.equal(messageLabel(sys("joined", { actor: MIA, user: MIA }), names, ANA, saturday, LONDON), "Resbite: Mia joined");
  assert.equal(messageLabel(sys("joined", { actor: MIA, user: MIA }), names, MIA, saturday, LONDON), "Resbite: You joined");
  const announcement = (audience: "going" | "everyone") =>
    msg({ kind: "announcement", audience, authorId: ANA, body: "Doors open at 19:30" });
  assert.equal(
    messageLabel(announcement("everyone"), names, LEO, saturday, LONDON),
    "Announcement to everyone invited, Ana, Doors open at 19:30, 18:02",
  );
  assert.equal(
    messageLabel(announcement("going"), names, LEO, saturday, LONDON),
    "Announcement to people going, Ana, Doors open at 19:30, 18:02",
  );
  assert.equal(
    messageLabel(announcement("going"), names, ANA, saturday, LONDON, "sending"),
    "Announcement to people going, You, Doors open at 19:30, 18:02, Sending…",
  );
});

test("isSeriesId accepts a series uuid as the server writes it and nothing else (K-N14)", () => {
  assert.equal(isSeriesId("0b000000-0000-4000-8000-000000000001"), true);
  assert.equal(isSeriesId("123e4567-e89b-42d3-a456-426614174000"), true);
  // The server writes lowercase, and the channel's topic check takes lowercase only.
  assert.equal(isSeriesId("123E4567-E89B-42D3-A456-426614174000"), false);
  for (const bad of ["", "not-a-uuid", "123e4567-e89b-42d3-a456-42661417400", "123e4567-e89b-42d3-a456-4266141740000",
    " 123e4567-e89b-42d3-a456-426614174000", "123e4567e89b42d3a456426614174000", "chat:123e4567-e89b-42d3-a456-426614174000"])
    assert.equal(isSeriesId(bad), false, bad);
  for (const bad of [undefined, null, 7, ["123e4567-e89b-42d3-a456-426614174000"], {}])
    assert.equal(isSeriesId(bad), false);
});

const PHONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

test("linkParts leaves a user part, a backslash, or a control, bidi or zero-width character as plain text (H20)", () => {
  for (const plain of [
    "https://google.com@evil.example/login",
    "https://evil.example\\@google.com",
    "https://evil.com\\@bank.com/",
    "https://x.com\\evil.com",
    "https://bank.com:pass@evil.com/x",
    "https://@example.com/",
    "https://x.com/\u0000",
    "https://x.com/a\u0007b",
    "https://x.com/‮txt",
    "https://x.com/a⁦b",
    "https://x.com/a‏b",
    "https://x.com/a؜b",
    "https://x.com/a​b",
    "https://x.com/a­b",
  ])
    assert.deepEqual(linkParts(plain), [{ text: plain }], JSON.stringify(plain));
  assert.deepEqual(linkParts("see https://google.com@evil.example now"), [{ text: "see https://google.com@evil.example now" }]);
  assert.equal(linkHost("https://google.com@evil.example/login"), "");
  assert.equal(linkHost("https://evil.example\\@google.com"), "");
  // After the path starts, an @ is only text: the host is still the one before it.
  assert.deepEqual(linkParts("https://example.com/@ana"), [{ text: "https://example.com/@ana", href: "https://example.com/@ana" }]);
});

test("linkParts links domain hosts only: no IP in any form, no localhost, no single label, no port above 65535 (H20)", () => {
  for (const plain of [
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0x7f.0.0.1/",
    "https://0177.0.0.1/",
    "https://1.0x7f/",
    "https://192.168.1.1:8080/admin",
    "https://[::1]/",
    "https://[2001:db8::1]:8080/",
    "https://localhost/",
    "https://localhost./x",
    "https://app.localhost/",
    "https://a/",
    "https://intranet/x",
    "https://example.c0m/",
    "https://x.com:99999/",
    "https://x.com:65536/",
    "https://x.com:/",
  ])
    assert.deepEqual(linkParts(plain), [{ text: plain }], plain);
  for (const linked of ["https://x.com:65535/", "https://x.com:8080/a", "https://a.b.example.co.uk/x", "http://1password.com/"])
    assert.deepEqual(linkParts(linked), [{ text: linked, href: linked }], linked);
  assert.equal(linkHost("https://x.com:65535/"), "x.com");
});

test("a link stops at a quote or an angle bracket (H20)", () => {
  assert.deepEqual(linkParts('<a href="https://x.com/a">x</a>'), [
    { text: '<a href="' },
    { text: "https://x.com/a", href: "https://x.com/a" },
    { text: '">x</a>' },
  ]);
  assert.deepEqual(linkParts("<https://x.com/a>"), [
    { text: "<" },
    { text: "https://x.com/a", href: "https://x.com/a" },
    { text: ">" },
  ]);
  assert.deepEqual(linkParts('"https://x.com/a"'), [
    { text: '"' },
    { text: "https://x.com/a", href: "https://x.com/a" },
    { text: '"' },
  ]);
});

test("a bad zone falls back to the phone's zone and a bad time drops out; nothing throws (D2)", () => {
  const iso = "2025-11-15T18:02:00Z";
  assert.equal(dayLabel(iso, "Mars/Base"), dayLabel(iso, PHONE));
  assert.equal(timeLabel(iso, ""), timeLabel(iso, PHONE));
  assert.equal(dayLabel("x", LONDON), "");
  assert.equal(timeLabel("nope", LONDON), "");
  const closes = "2025-11-17T18:00:00Z";
  const at = Date.parse(closes) - 31 * HOUR;
  assert.equal(closingLine(closes, at, "Nope/Zone"), closingLine(closes, at, PHONE));
  assert.equal(closingLine(closes, NaN, LONDON), null);
  assert.equal(closingLine("garbage", at, LONDON), null);
  const before = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(headerLine(summary({ timeZone: "Mars/Base" }), before), headerLine(summary({ timeZone: PHONE }), before));
  assert.equal(typeof headerLine(summary(), NaN), "string");
  assert.deepEqual(closedCard(summary({ closesAt: "2025-11-17T18:00:00Z", timeZone: "Mars/Base", open: false })), {
    line: CHAT_COPY.closedOn(dayLabel("2025-11-17T18:00:00Z", PHONE)),
    why: CHAT_COPY.closedWhy,
  });
  assert.deepEqual(closedCard(summary({ closesAt: "garbage", open: false })), { line: "This chat is closed.", why: null });
  // A payload's bad zone reads in the phone's zone; a bad time is left out of the line.
  assert.equal(
    line("changed", change({ to_start: "2025-11-14T19:30:00Z", from_zone: "Mars/Base", to_zone: "Mars/Base" })),
    line("changed", change({ to_start: "2025-11-14T19:30:00Z", from_zone: PHONE, to_zone: PHONE })),
  );
  assert.equal(line("changed", change({ from_start: "garbage", to_start: "2025-11-14T19:30:00Z" })), "Ana changed the time");
  assert.equal(line("changed", change({ to_end: "later" })), "Ana changed the time");
  assert.equal(
    line("changed", change({ what: "time_place", to_start: "zzz" })),
    "Ana changed the time and place · Nico's, Villa Crespo",
  );
  const saturday = Date.parse("2025-11-15T20:00:00Z");
  assert.equal(messageLabel(msg({ createdAt: "nope" }), names, ANA, saturday, LONDON), "Leo, I can bring the snacks");
  assert.equal(messageLabel(msg(), names, ANA, NaN, LONDON), "Leo, I can bring the snacks, Sat 15 Nov, 18:02");
  assert.equal(messageLabel(msg(), names, ANA, saturday, "Bad/Zone"), messageLabel(msg(), names, ANA, saturday, PHONE));
});

test("a summary missing its start or its zone hides the header and closing lines (D4)", () => {
  const before = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(headerLine(summary({ startsAt: "" }), before), null);
  assert.equal(headerLine(summary({ startsAt: "garbage" }), before), null);
  assert.equal(headerLine(summary({ timeZone: "" }), before), null);
  const closes = "2025-11-17T18:00:00Z";
  assert.equal(closingLine(closes, Date.parse(closes) - HOUR, ""), null);
});

test("a cancelled one-off's header reads Cancelled in place of the date line (Q8)", () => {
  assert.equal(headerLine(summary({ status: "cancelled" }), Date.parse("2026-10-30T12:00:00Z")), "Cancelled");
  assert.equal(headerLine(summary({ status: "cancelled" }), Date.parse("2026-11-30T12:00:00Z")), "Cancelled");
  assert.equal(headerLine(summary({ status: "cancelled", startsAt: "" }), 0), "Cancelled");
});

test("the same start and end in a new zone reads as a change of time zone (Q1)", () => {
  const BA = "America/Argentina/Buenos_Aires";
  assert.equal(line("changed", change({ to_zone: BA })), "Ana changed the time zone");
  assert.equal(line("changed", change({ to_zone: BA }), ANA), "You changed the time zone");
  assert.equal(line("changed", change({ to_zone: BA, actor: null })), "The time zone changed");
  assert.equal(line("changed", change({ to_zone: BA, from_end: null, to_end: null })), "Ana changed the time zone");
  // The same instant and the same zone: nothing to show but the change itself.
  assert.equal(line("changed", change({})), "Ana changed the time");
  // The end moved while the zone changed: the end is what moved.
  assert.equal(line("changed", change({ to_zone: BA, to_end: "2025-11-15T02:00:00Z" })), "Ana changed the end · 22:00 → 23:00");
});

test("rowText and messageLabel give null for a line they can't word, and never show the body of an unknown kind or state (Q2, Q6)", () => {
  const saturday = Date.parse("2025-11-15T20:00:00Z");
  for (const m of [
    sys("something_new", { actor: ANA }),
    sys("ended", {}),
    sys("changed", change({ what: "title" })),
    msg({ kind: "weird" as ChatMessage["kind"] }),
    msg({ state: "hidden" as ChatMessage["state"], body: "secret" }),
    msg({ kind: "announcement", audience: "going", state: "hidden" as ChatMessage["state"], body: "secret" }),
  ]) {
    assert.equal(rowText(m, names, ANA, false), null, JSON.stringify(m));
    assert.equal(messageLabel(m, names, ANA, saturday, LONDON), null, JSON.stringify(m));
  }
  assert.equal(rowText(null, names, ANA, false), "No messages yet");
});

test("names: own keys only, cleaned of controls, bidi and zero-width characters, blank reads Someone, a null map reads empty (Q3)", () => {
  for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"])
    assert.equal(line("joined", { actor: key, user: key }), "Someone joined", key);
  const say = (name: string | null) => systemText(sys("joined", { user: MIA }), { [MIA]: name }, ANA, false, "x");
  assert.equal(say("  "), "Someone joined");
  assert.equal(say("​‮"), "Someone joined");
  assert.equal(say("Mia\n‮evil"), "Mia evil joined");
  assert.equal(say("M​i⁦a\u0007"), "Mia joined");
  assert.equal(say("Mia\ud800"), "Mia joined");
  assert.equal(say("  Mia  "), "Mia joined");
  assert.equal(say("Leo:"), "Leo joined");
  assert.equal(rowText(msg(), { [LEO]: "Leo:" }, ANA, false), "Leo: I can bring the snacks");
  assert.equal(systemText(sys("joined", { user: MIA }), null as unknown as ChatNames, ANA, false, "x"), "Someone joined");
  assert.equal(rowText(msg(), null as unknown as ChatNames, ANA, false), "Someone: I can bring the snacks");
  assert.equal(
    messageLabel(msg(), undefined as unknown as ChatNames, ANA, Date.parse("2025-11-15T20:00:00Z"), LONDON),
    "Someone, I can bring the snacks, 18:02",
  );
});

test("a place label or a title in a line is cleaned the same way", () => {
  assert.equal(line("changed", change({ what: "place", place_label: "Nico's\n‮Villa" })), "Ana changed the place · Nico's Villa");
  assert.equal(line("changed", change({ what: "place", place_label: "​ " })), "Ana changed the place");
  assert.equal(line("ended", { title: "Board‮ game\nnight" }), "Board game night ended");
});

test("authorName: the name over someone's bubble, from the read's names, cleaned; You for the reader; Someone otherwise", () => {
  assert.equal(authorName(msg({ authorId: LEO }), names, ANA), "Leo");
  assert.equal(authorName(msg({ authorId: ANA }), names, ANA), "You");
  assert.equal(authorName(msg({ authorId: GONE }), names, ANA), "Someone");
  assert.equal(authorName(msg({ authorId: UNKNOWN }), names, ANA), "Someone");
  assert.equal(authorName(msg({ authorId: null }), names, ANA), "Someone");
  assert.equal(authorName(msg({ authorId: LEO }), { [LEO]: "‮Leo:" }, ANA), "Leo");
  assert.equal(authorName(msg({ authorId: "constructor" }), names, ANA), "Someone");
});

test("hasVisibleText follows the server's chat_body: whitespace, controls, format and filler characters alone are nothing (H30, H32)", () => {
  for (const blank of ["", "   ", "\n\n", "\u2800\u2800", "\u3164", "\u200b", "\u115f\u1160", "\uffa0", "\u034f", "\ufe0f",
    "\u00ad", "\u2060", "\u202e", "\ufeff", "\u0085", "\u{e0041}", "\u{1d173}", "\u180e", "\u17b4", "\t\u000b\u0001"])
    assert.equal(hasVisibleText(blank), false, JSON.stringify(blank));
  for (const seen of ["a", " a ", "\u2800x", "🎉", "👨‍👩‍👧‍👦", "مرحبا", "\u200ba", "0", "."])
    assert.equal(hasVisibleText(seen), true, JSON.stringify(seen));
});

test("fitBody keeps at most 1000 characters by code point, cut where a character ends (H32 Q26)", () => {
  assert.equal(BODY_LIMIT, 1000);
  const same = "a".repeat(1000);
  assert.deepEqual(fitBody(same), { text: same, cut: false });
  // 5000 characters: the first 1000, and the notice.
  const long = fitBody("P".repeat(4990) + "THE END!!!");
  assert.equal(long.text, "P".repeat(1000));
  assert.equal(long.cut, true);
  // An emoji is one character, as the server counts: 999 letters and 😀 fit; 700 🎉 fit.
  assert.deepEqual(fitBody("a".repeat(999) + "😀"), { text: "a".repeat(999) + "😀", cut: false });
  assert.deepEqual(fitBody("🎉".repeat(700)), { text: "🎉".repeat(700), cut: false });
  // A family emoji is 7 code points: it goes whole, never split into a lone person.
  const family = "👨‍👩‍👧‍👦";
  assert.deepEqual(fitBody("a".repeat(995) + family), { text: "a".repeat(995), cut: true });
  // An accent stays with its letter; a flag's two halves stay together.
  assert.deepEqual(fitBody("a".repeat(999) + "e\u0301"), { text: "a".repeat(999), cut: true });
  assert.deepEqual(fitBody("a".repeat(999) + "🇬🇧"), { text: "a".repeat(999), cut: true });
  assert.deepEqual(fitBody("a".repeat(998) + "🇬🇧"), { text: "a".repeat(998) + "🇬🇧", cut: false });
  // Without Intl.Segmenter (Hermes may lack it), the same boundaries.
  const Segmenter = (Intl as { Segmenter?: unknown }).Segmenter;
  try {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    assert.deepEqual(fitBody("a".repeat(995) + family), { text: "a".repeat(995), cut: true });
    assert.deepEqual(fitBody("a".repeat(999) + "e\u0301"), { text: "a".repeat(999), cut: true });
    assert.deepEqual(fitBody("a".repeat(999) + "🇬🇧"), { text: "a".repeat(999), cut: true });
    assert.deepEqual(fitBody("a".repeat(998) + "👍🏽x"), { text: "a".repeat(998) + "👍🏽", cut: true });
    assert.deepEqual(fitBody("P".repeat(1200)), { text: "P".repeat(1000), cut: true });
  } finally {
    (Intl as { Segmenter?: unknown }).Segmenter = Segmenter;
  }
});

test("a date outside the current year shows the year (H32 Q50)", () => {
  const in2026 = Date.parse("2026-11-11T12:00:00Z");
  assert.equal(dayLabel("2025-11-15T18:00:00Z", LONDON, in2026), "Sat 15 Nov 2025");
  assert.equal(dayLabel("2026-11-15T18:00:00Z", LONDON, in2026), "Sun 15 Nov");
  // Without a now, as before.
  assert.equal(dayLabel("2025-11-15T18:00:00Z", LONDON), "Sat 15 Nov");
  // The year is the zone's: 23:30Z on 31 Dec is already 1 Jan in Auckland.
  assert.equal(dayLabel("2026-12-31T23:30:00Z", "Pacific/Auckland", in2026), "Fri 1 Jan 2027");
  const old = summary({ startsAt: "2025-11-15T14:00:00Z", endsAt: "2025-11-15T18:00:00Z", closesAt: "2025-11-17T18:00:00Z", open: false });
  assert.equal(headerLine(old, in2026), `Ended · Sat 15 Nov 2025 · ${old.accepted} going`);
  assert.deepEqual(closedCard(old, in2026), { line: "This chat closed on Mon 17 Nov 2025.", why: CHAT_COPY.closedWhy });
  assert.deepEqual(closedCard(old), { line: "This chat closed on Mon 17 Nov.", why: CHAT_COPY.closedWhy });
  assert.equal(
    messageLabel(msg({ createdAt: "2025-11-15T19:00:00Z" }), names, ANA, in2026, LONDON),
    "Leo, I can bring the snacks, Sat 15 Nov 2025, 19:00",
  );
  // Over New Year the closing line names the year it closes in.
  assert.equal(
    closingLine("2027-01-01T18:00:00Z", Date.parse("2026-12-31T18:00:00Z"), LONDON),
    "This chat closes Fri 1 Jan 2027 at 18:00, in 24 hours. Any final words?",
  );
});

test("an unsent message in a closed chat says the close overtook it (H32 29)", () => {
  const now = Date.parse("2025-11-15T18:30:00Z");
  assert.equal(
    messageLabel(msg({ authorId: ANA, createdAt: "2025-11-15T18:02:00Z" }), names, ANA, now, LONDON, "closed"),
    "You, I can bring the snacks, 18:02, This chat closed before it was sent.",
  );
});

test("phoneZone is the phone's zone, one helper for the whole chat", () => {
  assert.equal(phoneZone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
});
