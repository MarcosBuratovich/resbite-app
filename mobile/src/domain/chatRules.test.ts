import test from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage, ChatNames, ChatSummary } from "../services/chat";
import {
  BODY_LIMIT,
  audienceOptions,
  authorName,
  canAnnounce,
  canLeave,
  cleanName,
  closedCard,
  closingLine,
  currentOccurrences,
  cutLine,
  dayFor,
  dayLabel,
  defaultAudience,
  emptyState,
  fitBody,
  fitEdit,
  groupDay,
  hasVisibleText,
  headerLine,
  invitationDot,
  invitationNote,
  isSeriesId,
  linkHost,
  linkParts,
  messageLabel,
  nextOpens,
  peopleLine,
  pendingCardNote,
  phoneZone,
  rowText,
  systemText,
  timeLabel,
  unreadDot,
  wellFormedText,
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
  rulesAccepted: true,
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

test("fitEdit: an insertion past the limit keeps only what fits, so the text around it is never cut (H35)", () => {
  const full = "a".repeat(1000);
  // Typing in the middle of a full message is refused, and the message stays as it was.
  assert.deepEqual(fitEdit(full, full.slice(0, 500) + "XY" + full.slice(500)), { text: full, cut: true });
  // At the end too.
  assert.deepEqual(fitEdit(full, full + "Z"), { text: full, cut: true });
  // A paste into an empty field keeps its first 1000, as fitBody does.
  assert.deepEqual(fitEdit("", "P".repeat(4990) + "END"), { text: "P".repeat(1000), cut: true });
  // A paste in the middle keeps the tail, and as much of the paste as fits.
  const before = "a".repeat(500) + "b".repeat(497);
  assert.deepEqual(fitEdit(before, "a".repeat(500) + "XYZW" + "b".repeat(497)), { text: "a".repeat(500) + "XYZ" + "b".repeat(497), cut: true });
  // A family emoji with room for 3 code points goes whole or not at all.
  const room3 = "a".repeat(997);
  assert.deepEqual(fitEdit(room3, "a".repeat(500) + "👨‍👩‍👧‍👦" + "a".repeat(497)), { text: room3, cut: true });
  // An emoji typed next to another isn't split at the seam.
  const emoji = "🎉".repeat(999);
  assert.deepEqual(fitEdit(emoji, "🎉".repeat(500) + "😀😀" + "🎉".repeat(499)), { text: "🎉".repeat(500) + "😀" + "🎉".repeat(499), cut: true });
  // Within the limit, deleting, and replacing a selection that frees room: as typed.
  assert.deepEqual(fitEdit("abc", "abXc"), { text: "abXc", cut: false });
  assert.deepEqual(fitEdit(full, full.slice(1)), { text: full.slice(1), cut: false });
  const replaced = "a".repeat(400) + "XY" + "a".repeat(590);
  assert.deepEqual(fitEdit(full, replaced), { text: replaced, cut: false });
});

// Task 8: My resbites. The tile's dot (CH-P9) and the invitation card's announcement line (spec "The announcement on the
// invitation card"), from `my_chat_overview`.
test("a tile's dot: unread in a chat still open; none for a closed chat, a read one, or no entry", () => {
  const last = msg();
  assert.equal(unreadDot({ unread: true, open: true, last, count: 3 }), true);
  assert.equal(unreadDot({ unread: false, open: true, last, count: 3 }), false);
  // As the Chat row: a closed chat shows its count, never a dot.
  assert.equal(unreadDot({ unread: true, open: false, last, count: 3 }), false);
  assert.equal(unreadDot(undefined), false);
});

test("the invitation card's line: the latest Everyone invited announcement, its author from names (CHAT_COPY.invitationLine)", () => {
  const note = (over: Partial<{ id: number; authorId: string | null; body: string }> = {}) =>
    invitationNote({ id: 41, authorId: ANA, body: "Doors open at 19:30", ...over }, names, PEDRO);
  assert.equal(note(), "Announcement from Ana · Doors open at 19:30");
  assert.equal(note(), CHAT_COPY.invitationLine("Ana", "Doors open at 19:30"));
  // An author who can't be named (deleted, deleting, folded, or missing from the map) reads "Someone" (K-B2).
  assert.equal(note({ authorId: GONE }), "Announcement from Someone · Doors open at 19:30");
  assert.equal(note({ authorId: null }), "Announcement from Someone · Doors open at 19:30");
  assert.equal(note({ authorId: UNKNOWN }), "Announcement from Someone · Doors open at 19:30");
  // The card keeps to its lines: white space and line breaks read as single spaces, and nothing invisible shows.
  assert.equal(note({ body: "  Doors open\n\nat 19:30  " }), "Announcement from Ana · Doors open at 19:30");
  // No announcement, or one with nothing to show, gives no line.
  assert.equal(invitationNote(undefined, names, PEDRO), null);
  assert.equal(note({ body: "" }), null);
  assert.equal(note({ body: " \u200b " }), null);
});

test("the invitation card's line keeps what a person sees, emoji with their joiners, as the Chat row's does (H41 m1)", () => {
  const note = (body: string) => invitationNote({ id: 41, authorId: ANA, body }, names, PEDRO);
  assert.equal(note("Bring the 👨‍👩‍👧\nDoors 19:30"), "Announcement from Ana · Bring the 👨‍👩‍👧 Doors 19:30");
  assert.equal(note("Flags 🏳️‍🌈 and tones 👋🏽"), "Announcement from Ana · Flags 🏳️‍🌈 and tones 👋🏽");
  // Still one line that can't flip its words or hide a half.
  assert.equal(note("ok \u202Eemoc\u2066 x\u2069 \ud83d end\u0007"), "Announcement from Ana · ok emoc x end");
});

test("wellFormedText: a lone surrogate reads as U+FFFD and NUL goes; everything else stays as written (H41 m2)", () => {
  assert.equal(wellFormedText("hi \ud83d"), "hi \ufffd");
  assert.equal(wellFormedText("\ude00 low"), "\ufffd low");
  assert.equal(wellFormedText("\ud83d\ud83d\ude00"), "\ufffd😀");
  assert.equal(wellFormedText("a\u0000b\u0000"), "ab");
  const kept = "👨‍👩‍👧 café\n\u200b\u202e 🇬🇧";
  assert.equal(wellFormedText(kept), kept);
  assert.equal(wellFormedText(""), "");
});

test("fitEdit keeps the field well formed: a lone surrogate reads as U+FFFD and NUL goes, under the limit and over it (H41 m2)", () => {
  assert.deepEqual(fitEdit("hi", "hi \ud83d"), { text: "hi \ufffd", cut: false });
  assert.deepEqual(fitEdit("ab", "a\u0000b"), { text: "ab", cut: false });
  assert.deepEqual(fitEdit("", "\ude00"), { text: "\ufffd", cut: false });
  // A paste of NULs and 1003 letters keeps 1000 letters; one of 1000 with a NUL fits whole.
  assert.deepEqual(fitEdit("", "\u0000".repeat(5) + "a".repeat(1003)), { text: "a".repeat(1000), cut: true });
  assert.deepEqual(fitEdit("", "a".repeat(500) + "\u0000" + "a".repeat(500)), { text: "a".repeat(1000), cut: false });
  // Typing at the limit into a field whose paste brought a half: the half reads as U+FFFD, and nothing is split.
  const full = "a".repeat(999) + "\ufffd";
  assert.deepEqual(fitEdit(full, full + "\ud83d"), { text: full, cut: true });
});

test("fitEdit never leaves a lone half: replacing the last emoji at the limit with two keeps one whole (H41 m4)", () => {
  const before = "a".repeat(999) + "😀";
  const fit = fitEdit(before, "a".repeat(999) + "😁😁");
  assert.deepEqual(fit, { text: "a".repeat(999) + "😁", cut: true });
  assert.equal(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(fit.text), false);
  // From the other side too: two typed in front of the first emoji.
  const lead = "😀" + "a".repeat(999);
  assert.deepEqual(fitEdit(lead, "😁😁" + "a".repeat(999)), { text: "😁" + "a".repeat(999), cut: true });
});

// Fix round 1 (H37 D1): the Chat row's line is one cleaned line, so a message can't fake a second speaker or flip its text.
test("rowText gives one cleaned line: no line breaks, bidi controls, control characters or lone surrogates", () => {
  // The tester's newline spoof (1.20): one line, so "Ana: …" can't read as Ana's own message.
  assert.equal(rowText(msg({ body: "See you!\nAna: Cancelled, don’t come" }), names, ANA, false), "Leo: See you! Ana: Cancelled, don’t come");
  assert.equal(rowText(msg({ body: "a\r\n\r\nb\u2028c\u2029d\te" }), names, ANA, false), "Leo: a b c d e");
  // The bidi override (1.21) and the isolates go; the words stay in their stored order.
  assert.equal(rowText(msg({ body: "ok \u202Eemoc t’nod ,dellecnac" }), names, ANA, false), "Leo: ok emoc t’nod ,dellecnac");
  assert.equal(rowText(msg({ body: "\u2066x\u2069 \u202Ay\u202C" }), names, ANA, false), "Leo: x y");
  assert.equal(rowText(msg({ body: "bell\u0007 nul\u0000 del\u007f" }), names, ANA, false), "Leo: bell nul del");
  assert.equal(rowText(msg({ body: "half \ud83d pair" }), names, ANA, false), "Leo: half pair");
  // What a person sees is kept: emoji with their joiners, accents, and runs of spaces read as one.
  assert.equal(rowText(msg({ body: "  👩‍👩‍👧   café  " }), names, ANA, false), "Leo: 👩‍👩‍👧 café");
  // An announcement's words the same way, and a body with nothing left shows no line.
  assert.equal(
    rowText(msg({ kind: "announcement", audience: "going", authorId: ANA, body: "Doors\n\nopen\u202E at 19:30" }), names, LEO, false),
    "Announcement from Ana · Doors open at 19:30",
  );
  assert.equal(rowText(msg({ body: "\u202E\n\u0007" }), names, ANA, false), null);
});

test("cutLine keeps the first characters a person sees, never splitting one, and marks the cut", () => {
  assert.equal(cutLine("short", 120), "short");
  assert.equal(cutLine("x".repeat(120), 120), "x".repeat(120));
  assert.equal(cutLine("x".repeat(121), 120), `${"x".repeat(120)}…`);
  // White space before the cut goes before the mark.
  assert.equal(cutLine(`${"x".repeat(119)} yz`, 120), `${"x".repeat(119)}…`);
  // An emoji family or a flag counts as one and is never split.
  const family = "👩‍👩‍👧";
  assert.equal(cutLine(family.repeat(5), 3), `${family.repeat(3)}…`);
  assert.equal(cutLine("🇬🇧🇦🇷🇺🇾", 2), "🇬🇧🇦🇷…");
});

// H37 Q5: a pending card carries the announcement until the resbite has ended, started or not.
test("a pending card's announcement line, from its start until its end", () => {
  const now = Date.parse("2099-05-01T12:00:00Z");
  const overview = {
    chats: {},
    announcements: { p1: { id: 41, authorId: ANA, body: "Doors open at 19:30" } },
    names,
    inviters: {},
  };
  const plan = (starts_at: string, ends_at: string | null) => ({ id: "p1", starts_at, ends_at });
  const line = "Announcement from Ana · Doors open at 19:30";
  // Not started yet, and running (started an hour ago, ends in two): the line.
  assert.equal(pendingCardNote(plan("2099-05-02T18:00:00Z", null), "pending", overview, PEDRO, now), line);
  assert.equal(pendingCardNote(plan("2099-05-01T11:00:00Z", "2099-05-01T14:00:00Z"), "pending", overview, PEDRO, now), line);
  // Ended (with an end, or a start with none): no line, whatever the overview still carries.
  assert.equal(pendingCardNote(plan("2099-05-01T09:00:00Z", "2099-05-01T11:00:00Z"), "pending", overview, PEDRO, now), null);
  assert.equal(pendingCardNote(plan("2099-05-01T11:00:00Z", null), "pending", overview, PEDRO, now), null);
  // Answered, or no overview read: no line.
  for (const response of ["accepted", "maybe", "declined", "withdrawn", null, undefined])
    assert.equal(pendingCardNote(plan("2099-05-02T18:00:00Z", null), response, overview, PEDRO, now), null, String(response));
  assert.equal(pendingCardNote(plan("2099-05-02T18:00:00Z", null), "pending", null, PEDRO, now), null);
  assert.equal(pendingCardNote({ id: "p2", starts_at: "2099-05-02T18:00:00Z", ends_at: null }, "pending", overview, PEDRO, now), null);
});

// H37 Q4: only the series' current occurrence carries the unread dot, as private.current_occurrence picks it.
test("currentOccurrences: the listed plan nothing repeats from, then the latest start, then the highest id", () => {
  const p = (id: string, series_id: string, starts_at: string, repeats_from: string | null = null) => ({ id, series_id, starts_at, repeats_from });
  const weekly = [
    p("a1", "s1", "2099-05-01T18:00:00Z"),
    p("a2", "s1", "2099-05-08T18:00:00Z", "a1"),
    p("a3", "s1", "2099-05-15T18:00:00Z", "a2"),
  ];
  assert.deepEqual([...currentOccurrences(weekly)].sort(), ["a3"]);
  // Listed out of order, with a one-off beside it.
  assert.deepEqual([...currentOccurrences([weekly[2], p("b1", "s2", "2099-04-01T10:00:00Z"), weekly[0], weekly[1]])].sort(), ["a3", "b1"]);
  // The newest listed one, when the one after it isn't readable here; ties on the start go to the higher id.
  assert.deepEqual([...currentOccurrences(weekly.slice(0, 2))].sort(), ["a2"]);
  assert.deepEqual(
    [...currentOccurrences([p("c1", "s3", "2099-05-01T18:00:00Z"), p("c2", "s3", "2099-05-01T18:00:00Z")])].sort(),
    ["c2"],
  );
  // A successor beats a later start: the server excludes anything another occurrence repeats from.
  assert.deepEqual([...currentOccurrences([p("d1", "s4", "2099-06-01T18:00:00Z"), p("d2", "s4", "2099-05-01T18:00:00Z", "d1")])], ["d2"]);
  assert.deepEqual([...currentOccurrences([])], []);
});

// Plan 2 (groups). 20 and 27 November 2025 are Thursdays; with no `now`, a line's day shows no year.
const THU_20 = "2025-11-20T19:00:00Z";
const THU_27 = "2025-11-27T19:00:00Z";
const groupLine = (event: string, payload: Record<string, unknown>, viewer = UNKNOWN) =>
  systemText(sys(event, payload), names, viewer, true, "Board game night");
const group = (over: Partial<ChatSummary> = {}) =>
  summary({ isGroup: true, repeatWeeks: 1, title: "Board game night", startsAt: THU_20, endsAt: "2025-11-20T22:00:00Z", members: 9, going: 6, everyone: 9, closesAt: null, ...over });

test("systemText on a group: can't make it this week, left the group, each with a name, Someone and You", () => {
  assert.equal(groupLine("cant_go", { actor: SOL, user: SOL }), "Sol can’t make it this week");
  assert.equal(groupLine("cant_go", { actor: GONE, user: GONE }), "Someone can’t make it this week");
  assert.equal(groupLine("cant_go", { actor: SOL, user: SOL }, SOL), "You can’t make it this week");
  assert.equal(groupLine("left", { actor: SOL, user: SOL }), "Sol left the group");
  assert.equal(groupLine("left", { actor: GONE, user: GONE }), "Someone left the group");
  const STRANGER = "0a000000-0000-4000-8000-000000000009";
  assert.equal(groupLine("left", { actor: STRANGER, user: STRANGER }), "Someone left the group", "a uuid the map doesn't name");
  assert.equal(groupLine("left", { actor: SOL, user: SOL }, SOL), "You left the group");
  // The one-off line is as built.
  assert.equal(line("cant_go", { actor: SOL, user: SOL }), "Sol can’t make it");
});

test("systemText on a group: an ended line names the resbite, the payload's title first (G-S6)", () => {
  assert.equal(groupLine("ended", { actor: null, title: "Board game night" }), "Board game night ended");
  assert.equal(groupLine("ended", { actor: null }), "Board game night ended", "the title given when the payload has none");
});

test("systemText on a group: a cancelled week names its weekday; a cancel that stops cancels the group (G-S2)", () => {
  const week = { stop: false, starts_at: "2025-11-20T19:00:00Z", time_zone: LONDON };
  assert.equal(groupLine("cancelled", { actor: ANA, ...week }), "Ana cancelled this Thursday");
  assert.equal(groupLine("cancelled", { actor: GONE, ...week }), "Someone cancelled this Thursday");
  assert.equal(groupLine("cancelled", { actor: ANA, ...week }, ANA), "You cancelled this Thursday");
  // The weekday is the occurrence's own, in its zone: 23:30 on Thursday in London is Friday in Tokyo.
  assert.equal(groupLine("cancelled", { actor: ANA, stop: false, starts_at: "2025-11-20T23:30:00Z", time_zone: "Asia/Tokyo" }), "Ana cancelled this Friday");
  assert.equal(groupLine("cancelled", { actor: ANA, ...week, stop: true }), "Ana cancelled the group");
  assert.equal(groupLine("cancelled", { actor: GONE, ...week, stop: true }), "Someone cancelled the group");
  assert.equal(groupLine("cancelled", { actor: ANA, ...week, stop: true }, ANA), "You cancelled the group");
  // A start that can't be read words the cancel without a day, as built; so does a line with no actor (H20).
  assert.equal(groupLine("cancelled", { actor: ANA, stop: false, starts_at: "soon", time_zone: LONDON }), "Ana cancelled the resbite");
  assert.equal(groupLine("cancelled", { actor: null, ...week }), "The resbite was cancelled");
  // The one-off lines stay.
  assert.equal(line("cancelled", { actor: ANA, ...week }), "Ana cancelled the resbite");
  assert.equal(line("cancelled", { actor: null }), "The resbite was cancelled");
});

test("systemText on a group: stopped repeating names the last one; made a group says who can read (G-N13, G-N8)", () => {
  const stopped = { actor: ANA, plan_id: "0c000000-0000-4000-8000-000000000002", starts_at: THU_27, time_zone: LONDON };
  assert.equal(groupLine("stopped", stopped), "Ana stopped repeating this · the last one is Thu 27 Nov");
  assert.equal(groupLine("stopped", { ...stopped, actor: GONE }), "Someone stopped repeating this · the last one is Thu 27 Nov");
  assert.equal(groupLine("stopped", stopped, ANA), "You stopped repeating this · the last one is Thu 27 Nov");
  // No year even far from now: a line takes no `now` (challenge NOTE 2). A day that can't be read is left out.
  assert.equal(groupLine("stopped", { ...stopped, starts_at: "2031-11-27T19:00:00Z" }), "Ana stopped repeating this · the last one is Thu 27 Nov");
  assert.equal(groupLine("stopped", { ...stopped, starts_at: "later" }), "Ana stopped repeating this");
  assert.equal(groupLine("made_group", { actor: ANA }), "Ana made this a group · everyone invited can read this chat");
  assert.equal(groupLine("made_group", { actor: GONE }), "Someone made this a group · everyone invited can read this chat");
  assert.equal(groupLine("made_group", { actor: ANA }, ANA), "You made this a group · everyone invited can read this chat");
});

test("systemText on a group: the next one, with the place as typed, to be decided, or none (I11, Decision 11)", () => {
  const next = { actor: null, plan_id: "0c000000-0000-4000-8000-000000000002", starts_at: THU_20, time_zone: LONDON, place_tbd: false };
  // No `place_label` key: the server leaves it out for a reader who hasn't answered.
  assert.equal(groupLine("next", next), "Next one: Thu 20 Nov");
  assert.equal(groupLine("next", { ...next, place_label: "" }), "Next one: Thu 20 Nov");
  assert.equal(groupLine("next", { ...next, place_tbd: true }), "Next one: Thu 20 Nov · Place to be decided");
  assert.equal(groupLine("next", { ...next, place_tbd: true, place_label: "Ana's flat" }), "Next one: Thu 20 Nov · Place to be decided");
  assert.equal(groupLine("next", { ...next, place_label: "Ana's flat" }), "Next one: Thu 20 Nov · Ana's flat");
  // Free text is cleaned as the changed line's label is (H18).
  assert.equal(groupLine("next", { ...next, place_label: "Ana's‮ flat\n" }), "Next one: Thu 20 Nov · Ana's flat");
  // Its day is the occurrence's, in its zone, with no year (challenge NOTE 2).
  assert.equal(groupLine("next", { ...next, starts_at: "2025-11-20T23:30:00Z", time_zone: "Asia/Tokyo" }), "Next one: Fri 21 Nov");
});

test("systemText on a group: a place change with no place_label is worded without a place (I11)", () => {
  assert.equal(groupLine("changed", { actor: ANA, what: "place" }), "Ana changed the place");
  assert.equal(
    groupLine("changed", { actor: ANA, what: "time_place", from_start: THU_20, to_start: "2025-11-20T19:30:00Z", from_zone: LONDON, to_zone: LONDON }),
    "Ana changed the time and place · Thu 19:30",
  );
});

test("systemText on a group: joined still names the bringer only when the reader may know them", () => {
  assert.equal(groupLine("joined", { actor: CLARA, user: CLARA, brought_by: PEDRO }), "Clara joined · brought by Pedro");
  assert.equal(groupLine("joined", { actor: CLARA, user: CLARA, brought_by: "0a000000-0000-4000-8000-000000000009" }), "Clara joined", "a uuid the map doesn't name");
  assert.equal(groupLine("joined", { actor: CLARA, user: CLARA, brought_by: GONE }), "Clara joined");
});

test("rowText words a can't go line by the group flag, as one line (H37 D1)", () => {
  const last = sys("cant_go", { actor: SOL, user: SOL });
  assert.equal(rowText(last, names, UNKNOWN, true), "Sol can’t make it this week");
  assert.equal(rowText(last, names, UNKNOWN, false), "Sol can’t make it");
  assert.equal(rowText(sys("next", { actor: null, starts_at: THU_20, time_zone: LONDON, place_label: "Ana's\nflat" }), names, UNKNOWN, true), "Next one: Thu 20 Nov · Ana's flat");
});

test("messageLabel takes the group: its lines in the group's words, an announcement by the group's audience", () => {
  const now = Date.parse("2025-11-15T20:00:00Z");
  assert.equal(messageLabel(sys("cant_go", { actor: SOL, user: SOL }), names, UNKNOWN, now, LONDON, undefined, true, "Thursday"), "Resbite: Sol can’t make it this week");
  assert.equal(messageLabel(sys("cant_go", { actor: SOL, user: SOL }), names, UNKNOWN, now, LONDON), "Resbite: Sol can’t make it");
  const everyone = msg({ kind: "announcement", audience: "everyone", body: "Doors at 19:30", authorId: ANA });
  const going = msg({ kind: "announcement", audience: "going", body: "Doors at 19:30", authorId: ANA });
  const label = messageLabel(everyone, names, UNKNOWN, now, LONDON, undefined, true, "Thursday")!;
  assert.ok(label.startsWith("Announcement to everyone in the group"), label);
  assert.equal(label, "Announcement to everyone in the group, Ana, Doors at 19:30, 18:02");
  assert.ok(messageLabel(going, names, UNKNOWN, now, LONDON, undefined, true, "Thursday")!.startsWith("Announcement to people going this Thursday, Ana"));
  // A one-off's, as built; and the send state still comes last.
  assert.ok(messageLabel(everyone, names, UNKNOWN, now, LONDON)!.startsWith("Announcement to everyone invited, Ana"));
  assert.ok(messageLabel(going, names, UNKNOWN, now, LONDON, "sending", true, "Thursday")!.endsWith(", Sending…"));
});

test("a deleted system line gives no line anywhere: systemText, rowText and messageLabel (Decision 6)", () => {
  const gone = { ...sys("cant_go", { actor: SOL, user: SOL }), state: "deleted" as const };
  assert.equal(systemText(gone, names, UNKNOWN, true, ""), "");
  assert.equal(rowText(gone, names, UNKNOWN, true), null);
  assert.equal(rowText(gone, names, UNKNOWN, false), null);
  assert.equal(messageLabel(gone, names, UNKNOWN, Date.now(), LONDON, undefined, true, "Thursday"), null);
  assert.equal(messageLabel(gone, names, UNKNOWN, Date.now(), LONDON), null);
});

test("audienceOptions: the sheet's two radios, in order: a group's by the group, a one-off's as built (G-S7)", () => {
  assert.deepEqual(audienceOptions(group()), [
    { key: "everyone", title: "Everyone in the group · 9" },
    { key: "going", title: "Going this Thursday · 6" },
  ]);
  assert.deepEqual(audienceOptions(summary({ going: 6, everyone: 9 })), [
    { key: "going", title: "Going · 6" },
    { key: "everyone", title: "Everyone invited · 9" },
  ]);
  // The weekday is the occurrence's in the plan's zone; a zone this phone doesn't know reads in the phone's.
  assert.equal(audienceOptions(group({ startsAt: "2025-11-20T23:30:00Z", timeZone: "Asia/Tokyo" }))[1].title, "Going this Friday · 6");
  assert.equal(audienceOptions(group({ timeZone: "Mars/Olympus" }))[1].title, `Going this ${groupDay({ startsAt: THU_20, timeZone: phoneZone() })} · 6`);
  // The first radio is the sheet's starting audience (K-N7).
  assert.equal(audienceOptions(group())[0].key, defaultAudience(group()));
  assert.equal(audienceOptions(summary())[0].key, defaultAudience(summary()));
});

test("groupDay is the long weekday in the plan's zone, empty when the start can't be read", () => {
  assert.equal(groupDay({ startsAt: THU_20, timeZone: LONDON }), "Thursday");
  assert.equal(groupDay({ startsAt: "2025-11-20T23:30:00Z", timeZone: "Asia/Tokyo" }), "Friday");
  assert.equal(groupDay({ startsAt: "", timeZone: LONDON }), "");
  assert.equal(groupDay({ startsAt: "soon", timeZone: "" }), "");
});

test("headerLine on a group: how it repeats and who is in it; the last one once stopped (G-S7)", () => {
  const now = Date.parse("2025-11-18T12:00:00Z");
  assert.equal(headerLine(group(), now), "Every Thursday · 9 in the group");
  assert.equal(headerLine(group({ repeatWeeks: 2 }), now), "Every other Thursday · 9 in the group");
  // Running after its end, and after Cancel just this one: still how it repeats, never Ended or Cancelled.
  assert.equal(headerLine(group(), Date.parse("2025-11-21T12:00:00Z")), "Every Thursday · 9 in the group");
  assert.equal(headerLine(group({ status: "cancelled" }), now), "Every Thursday · 9 in the group");
  const stopped = group({ stopped: true, repeatWeeks: null, startsAt: THU_27, endsAt: "2025-11-27T22:00:00Z" });
  assert.equal(headerLine(stopped, now), "Last one · Thu 27 Nov · 9 in the group");
  assert.equal(headerLine({ ...stopped, status: "cancelled" }, now), "Last one · Thu 27 Nov · 9 in the group");
  // The year when it isn't now's, as the one-off header does (H32 Q50).
  assert.equal(headerLine(stopped, Date.parse("2026-01-05T12:00:00Z")), "Last one · Thu 27 Nov 2025 · 9 in the group");
  // Null with no repeat, a start or a zone that can't be read; nothing throws on a zone the phone doesn't know.
  assert.equal(headerLine(group({ repeatWeeks: null }), now), null);
  assert.equal(headerLine(group({ startsAt: "" }), now), null);
  assert.equal(headerLine(group({ timeZone: "" }), now), null);
  assert.equal(headerLine({ ...stopped, startsAt: "" }, now), null);
  assert.equal(typeof headerLine(group({ timeZone: "Mars/Olympus" }), now), "string");
  // The one-off lines and Cancelled are as built.
  assert.equal(headerLine(summary({ status: "cancelled" }), now), "Cancelled");
  assert.equal(headerLine(summary(), Date.parse("2026-10-29T12:00:00Z")), "Fri 30 Oct · 6 going");
});

test("closedCard on a group: its own words with the date; a one-off's two cards are as built (G-N5)", () => {
  const now = Date.parse("2025-11-30T12:00:00Z");
  const stopped = group({ stopped: true, repeatWeeks: null, open: false, startsAt: "2025-11-25T19:00:00Z", closesAt: "2025-11-27T22:00:00Z" });
  assert.deepEqual(closedCard(stopped, now), { line: "This group’s chat closed on Thu 27 Nov.", why: CHAT_COPY.closedWhy });
  // Cancel this and stop repeating: the group's card, never the cancelled one-off's.
  assert.deepEqual(closedCard({ ...stopped, status: "cancelled" }, now), { line: "This group’s chat closed on Thu 27 Nov.", why: CHAT_COPY.closedWhy });
  assert.deepEqual(closedCard({ ...stopped, closesAt: null }, now), { line: CHAT_COPY.closedShort, why: null });
  assert.deepEqual(closedCard(summary({ status: "cancelled", closesAt: null, open: false }), now), { line: CHAT_COPY.cancelledClosed, why: null });
  assert.deepEqual(closedCard(summary({ open: false }), Date.parse("2026-11-05T12:00:00Z")), { line: "This chat closed on Sun 1 Nov.", why: CHAT_COPY.closedWhy });
});

// Ruling GR1 (1): Task 2 sends every cancelled line with `stop`, and a cancelled one-off's is true.
test("a one-off's cancelled line with Task 2's payload, stop true, reads as a one-off's", () => {
  const payload = { actor: ANA, stop: true, starts_at: THU_20, time_zone: LONDON };
  assert.equal(line("cancelled", payload), "Ana cancelled the resbite");
  assert.equal(line("cancelled", payload, ANA), "You cancelled the resbite");
  assert.equal(rowText(sys("cancelled", payload), names, UNKNOWN, false), "Ana cancelled the resbite");
  assert.equal(messageLabel(sys("cancelled", payload), names, UNKNOWN, Date.now(), LONDON), "Resbite: Ana cancelled the resbite");
});

// Ruling GR1 (2): a group summary whose start can't be read.
test("with no readable day, a group's going radio, label and Leave question read without one", () => {
  const noDay = group({ startsAt: "" });
  assert.equal(groupDay(noDay), "");
  assert.deepEqual(audienceOptions(noDay), [
    { key: "everyone", title: "Everyone in the group · 9" },
    { key: "going", title: "Going · 6" },
  ]);
  const going = msg({ kind: "announcement", audience: "going", body: "Doors at 19:30", authorId: ANA });
  assert.ok(messageLabel(going, names, UNKNOWN, Date.now(), LONDON, undefined, true, groupDay(noDay))!.startsWith("Announcement to people going, Ana"));
  assert.equal(CHAT_COPY.leaveQuestion(noDay.title, groupDay(noDay)), "Leave Board game night? You’ll stop getting its invitations and its chat.");
  assert.equal(CHAT_COPY.leaveQuestion("Board game night", groupDay(group())), "Leave Board game night? You’ll stop getting its Thursdays and its chat.");
});

// Ruling GR1 (4): an announcement names this week's day only when it belongs to the current occurrence.
test("dayFor: the group's day for a row of the current occurrence or one with no planId; none for an earlier one", () => {
  const CURRENT = "0c000000-0000-4000-8000-000000000001";
  const EARLIER = "0c000000-0000-4000-8000-000000000000";
  const going = msg({ kind: "announcement", audience: "going", body: "Doors at 19:30", authorId: ANA });
  assert.equal(dayFor({ ...going, planId: CURRENT }, CURRENT, "Thursday"), "Thursday");
  assert.equal(dayFor(going, CURRENT, "Thursday"), "Thursday", "a row without planId reads as current");
  assert.equal(dayFor({ ...going, planId: null }, CURRENT, "Thursday"), "Thursday");
  assert.equal(dayFor({ ...going, planId: EARLIER }, CURRENT, "Thursday"), "");
  // With no current occurrence to compare, a row that names one isn't taken for it.
  assert.equal(dayFor({ ...going, planId: EARLIER }, "", "Thursday"), "");
  const label = messageLabel({ ...going, planId: EARLIER }, names, UNKNOWN, Date.now(), LONDON, undefined, true, dayFor({ ...going, planId: EARLIER }, CURRENT, "Thursday"));
  assert.ok(label!.startsWith("Announcement to people going, Ana"), label!);
});

// Task 4: the chat screen's group parts (CH-04, CH-07, G-N13, Decision 14).
test("canLeave: a group's member who isn't a host, while its chat is open; never on a one-off (G-N13)", () => {
  assert.equal(canLeave(group()), true);
  // Whatever this week's reply: the summary carries none, and a member who hasn't answered may leave too.
  assert.equal(canLeave(group({ accepted: 0 })), true);
  // Hosts can't leave (the owner, and an admin until they step down), and nobody leaves a closed chat from it.
  assert.equal(canLeave(group({ host: true })), false);
  assert.equal(canLeave(group({ open: false })), false);
  // A stopped group still open for its goodbye: they may still leave.
  assert.equal(canLeave(group({ stopped: true, repeatWeeks: null })), true);
  // A one-off has no Leave: Can't go is the way out.
  assert.equal(canLeave(summary()), false);
  assert.equal(canLeave(summary({ host: true })), false);
});

test("peopleLine: the menu's people row, by the group or by the chat (CH-04)", () => {
  assert.equal(peopleLine(group()), "People in this group · 9");
  assert.equal(peopleLine(group({ members: 1 })), "People in this group · 1");
  assert.equal(peopleLine(summary()), "People in this chat · 8");
});

test("emptyState: the host's words before anything is said; a group's when its owner is alone (CH-07)", () => {
  // A one-off as built: a host while nobody is going.
  assert.deepEqual(emptyState(summary({ host: true, accepted: 0 })), { title: CHAT_COPY.nobodyGoing, hint: CHAT_COPY.nobodyGoingHint });
  assert.equal(emptyState(summary({ host: true, accepted: 2 })), null);
  assert.equal(emptyState(summary({ host: false, accepted: 0 })), null);
  // A group: the owner alone in it reads that messages reach everyone in the group.
  assert.deepEqual(emptyState(group({ host: true, accepted: 0, members: 1 })), { title: CHAT_COPY.nobodyGoing, hint: CHAT_COPY.groupEmptyHint });
  assert.equal(CHAT_COPY.groupEmptyHint, "Messages here reach everyone in the group.");
  // Anyone else in it, Going or not, and the owner isn't alone: no "Nobody’s going yet", whatever this week's answers.
  assert.equal(emptyState(group({ host: true, accepted: 0, members: 9 })), null);
  assert.equal(emptyState(group({ host: true, accepted: 1, members: 2 })), null);
  assert.equal(emptyState(group({ host: false, accepted: 0, members: 1 })), null);
});

test("nextOpens: a Next one line opens the current occurrence only when the summary names one (Decision 14, I5)", () => {
  assert.equal(nextOpens("0c000000-0000-4000-8000-000000000001"), true);
  // The mapper reads a missing plan_id as "": nothing to open, so the chat is read again instead.
  assert.equal(nextOpens(""), false);
  assert.equal(nextOpens("not-a-plan"), false);
  assert.equal(nextOpens("0C000000-0000-4000-8000-000000000001"), false, "the server writes ids in lower case");
});

// Ruling GR6 (M6): the invitation card's unread dot is a group member's (I3). Someone pending on a one-off is in its chat
// only as an admin, a host, whose card gains no dot; a pending guest is in a chat only on a group.
test("invitationDot: a group member's invitation card carries the chat's dot; a one-off admin's doesn't", () => {
  const ME = "0a000000-0000-4000-8000-000000000003";
  const SERIES = "0b000000-0000-4000-8000-000000000001";
  const plan = { id: "0c000000-0000-4000-8000-000000000001", series_id: SERIES, repeat_weeks: null, repeats_from: null, admins: [] as string[] };
  const overview = (unread: boolean, open = true) => ({ chats: { [SERIES]: { unread, open, last: null, count: 3 } }, announcements: {}, names: {}, inviters: {} });
  const current = new Set([plan.id]);
  // A guest who hasn't answered is listed in a chat only on a group: the dot.
  assert.equal(invitationDot(plan, ME, current, overview(true)), true);
  // An admin who hasn't answered: only when the plan shows it is a group's (it repeats, or was rolled from another).
  const admin = { ...plan, admins: [ME] };
  assert.equal(invitationDot(admin, ME, current, overview(true)), false);
  assert.equal(invitationDot({ ...admin, repeat_weeks: 1 }, ME, current, overview(true)), true);
  assert.equal(invitationDot({ ...admin, repeats_from: "0c000000-0000-4000-8000-000000000000" }, ME, current, overview(true)), true);
  // The tile's rules: read, closed, not the current occurrence, or no entry: no dot.
  assert.equal(invitationDot(plan, ME, current, overview(false)), false);
  assert.equal(invitationDot(plan, ME, current, overview(true, false)), false);
  assert.equal(invitationDot(plan, ME, new Set(), overview(true)), false);
  assert.equal(invitationDot(plan, ME, current, null), false);
  assert.equal(invitationDot(plan, ME, current, { chats: {}, announcements: {}, names: {}, inviters: {} }), false);
});

// Plan 3 (CH-R-A3): a message the Resbite team took down (`remove-reported-message.sql`) says so wherever a removed row
// is worded; a host's removal, which writes no payload, keeps plan 1's words.
test("rowText and messageLabel word a removal by Resbite apart from a host's", () => {
  const saturday = Date.parse("2025-11-15T20:00:00Z");
  const byResbite = msg({ state: "removed", body: null, payload: { by: "resbite" } });
  const byHost = msg({ state: "removed", body: null });
  assert.equal(rowText(byResbite, names, ANA, false), "Message removed by Resbite");
  assert.equal(rowText(byHost, names, ANA, false), "Message removed by an admin");
  assert.equal(messageLabel(byResbite, names, ANA, saturday, LONDON), "Leo, Message removed by Resbite, 18:02");
  assert.equal(messageLabel(byHost, names, ANA, saturday, LONDON), "Leo, Message removed by an admin, 18:02");
  // An announcement the team took down, on a group too.
  const announcement = msg({ kind: "announcement", audience: "everyone", authorId: ANA, state: "removed", body: null, payload: { by: "resbite" } });
  assert.equal(rowText(announcement, names, LEO, true), "Message removed by Resbite");
  assert.equal(messageLabel(announcement, names, LEO, saturday, LONDON, undefined, true, "Thursday"), "Announcement to everyone in the group, Ana, Message removed by Resbite, 18:02");
  // Only a removed row with `by: "resbite"`: anyone else's `by`, or a sent or deleted row with that payload, reads as before.
  assert.equal(rowText(msg({ state: "removed", body: null, payload: { by: ANA } }), names, ANA, false), "Message removed by an admin");
  assert.equal(rowText(msg({ state: "removed", body: null, payload: { by: "Resbite" } }), names, ANA, false), "Message removed by an admin");
  assert.equal(rowText(msg({ state: "deleted", body: null, payload: { by: "resbite" } }), names, ANA, false), "Message deleted");
  assert.equal(rowText(msg({ payload: { by: "resbite" } }), names, ANA, false), "Leo: I can bring the snacks");
});

// Plan 3 (Task 6's Blocked people): a name reads as the chat reads it (`cleanText`), so a zero-width or directional mark
// can't hide in it or flip it.
test("cleanName takes zero-width and directional marks out of a name", () => {
  assert.equal(cleanName("Le\u200bo\u200f"), "Leo");
  assert.equal(cleanName("\u202eLeo\u202c"), "Leo");
  assert.equal(cleanName("  Ana  María: "), "Ana María");
  assert.equal(cleanName(null), "");
  assert.equal(cleanName("\u200b"), "");
});
