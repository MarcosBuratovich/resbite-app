import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ChatMessage, ChatNames } from "../services/chat";
import type { EndedLine, PendingMessage } from "./chatModel";
import { chatFeed, messageActions, nothingSaid, type FeedRow } from "./chatFeed";
import { CHAT_COPY } from "../domain/chatCopy";

const ANA = "0a000000-0000-4000-8000-000000000001";
const LEO = "0a000000-0000-4000-8000-000000000002";
const MIA = "0a000000-0000-4000-8000-000000000003";
const PEDRO = "0a000000-0000-4000-8000-000000000005";
const names: ChatNames = { [ANA]: "Ana", [LEO]: "Leo", [MIA]: "Mia", [PEDRO]: "Pedro" };
const LONDON = "Europe/London";
// Wed 28 Oct 2026, 10:00 in London (GMT).
const NOW = Date.parse("2026-10-28T10:00:00Z");
const TITLE = "Picnic in the park";

const msg = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: `message ${id}`,
  state: "sent",
  authorId: LEO,
  createdAt: "2026-10-28T09:00:00Z",
  updatedAt: "2026-10-28T09:00:00Z",
  clientId: null,
  ...over,
});
const sys = (id: number, event: string, payload: Record<string, unknown>, at = "2026-10-28T09:00:00Z") =>
  msg(id, { kind: "system", event, payload, body: null, authorId: null, createdAt: at, updatedAt: at });
const pending = (clientId: string, over: Partial<PendingMessage> = {}): PendingMessage => ({
  kind: "pending",
  clientId,
  body: "I can bring the snacks",
  createdAt: "2026-10-28T10:00:00Z",
  failed: false,
  ...over,
});
const feed = (items: Array<ChatMessage | PendingMessage | EndedLine>, over: Partial<Parameters<typeof chatFeed>[1]> = {}) =>
  chatFeed(items, { names, viewerId: PEDRO, now: NOW, zone: LONDON, title: TITLE, host: false, group: false, day: "", planId: "", ...over });
const types = (rows: FeedRow[]) => rows.map((r) => r.type);
const only = <T extends FeedRow["type"]>(rows: FeedRow[], type: T) =>
  rows.filter((r): r is Extract<FeedRow, { type: T }> => r.type === type);

test("a day separator comes before each day's first row, in the zone given (K-N4), and is the day's label", () => {
  const rows = feed([
    msg(1, { createdAt: "2026-10-27T18:10:00Z" }),
    msg(2, { createdAt: "2026-10-27T23:30:00Z" }),
    msg(3, { createdAt: "2026-10-28T09:00:00Z" }),
  ]);
  assert.deepEqual(types(rows), ["day", "bubble", "bubble", "day", "bubble"]);
  assert.deepEqual(only(rows, "day").map((d) => d.text), ["Tue 27 Oct", "Wed 28 Oct"]);
  // In Buenos Aires (UTC−3) 23:30Z on the 27th is still the 27th, and 02:00Z on the 28th is the 27th too.
  const ba = feed([msg(1, { createdAt: "2026-10-27T23:30:00Z" }), msg(2, { createdAt: "2026-10-28T02:00:00Z" })], {
    zone: "America/Argentina/Buenos_Aires",
  });
  assert.deepEqual(types(ba), ["day", "bubble", "bubble"]);
  assert.equal(only(ba, "day")[0].text, "Tue 27 Oct");
  // Keys are unique.
  const keys = rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("someone's message: their name above it, the body, the screen reader's label with its day, Report for a guest", () => {
  const [, row] = feed([msg(7, { body: "Count me in", createdAt: "2026-10-27T18:10:00Z" })]);
  assert.equal(row.type, "bubble");
  if (row.type !== "bubble") return;
  assert.equal(row.own, false);
  assert.equal(row.author, "Leo");
  assert.equal(row.text, "Count me in");
  assert.equal(row.gone, null);
  assert.equal(row.label, "Leo, Count me in, Tue 27 Oct, 18:10");
  // Plan 3 (G-N12): someone else's message can be reported.
  assert.deepEqual(row.actions, ["report"]);
  assert.equal(row.key, "m:7");
});

test("a host may remove someone else's message; their own is deleted, never removed (K-N12)", () => {
  const theirs = only(feed([msg(7)], { host: true, viewerId: ANA }), "bubble")[0];
  assert.deepEqual(theirs.actions, ["remove", "report"]);
  const mine = only(feed([msg(8, { authorId: ANA })], { host: true, viewerId: ANA }), "bubble")[0];
  assert.equal(mine.own, true);
  assert.equal(mine.author, null);
  assert.deepEqual(mine.actions, ["delete"]);
  assert.ok(mine.label.startsWith("You, message 8, "), mine.label);
  // A guest deletes their own.
  const guest = only(feed([msg(9, { authorId: PEDRO })]), "bubble")[0];
  assert.deepEqual(guest.actions, ["delete"]);
});

test("deleted and removed messages show their words without the text and offer nothing, even to a host", () => {
  const rows = only(
    feed(
      [
        msg(1, { state: "deleted", body: null }),
        msg(2, { state: "removed", body: null }),
        msg(3, { state: "deleted", body: null, authorId: ANA }),
      ],
      { host: true, viewerId: ANA },
    ),
    "bubble",
  );
  assert.deepEqual(rows.map((r) => r.text), [CHAT_COPY.deleted, CHAT_COPY.removed, CHAT_COPY.deleted]);
  assert.deepEqual(rows.map((r) => r.gone), ["deleted", "removed", "deleted"]);
  assert.deepEqual(rows.map((r) => r.actions), [[], [], []]);
  assert.equal(rows[1].label, "Leo, Message removed by an admin, 09:00");
});

test("an announcement is a card naming its audience in words; its author deletes it and another host removes it", () => {
  const ann = msg(5, { kind: "announcement", audience: "everyone", authorId: ANA, body: "Doors open at 11:30" });
  const [, guestView] = feed([ann]);
  assert.equal(guestView.type, "announcement");
  if (guestView.type !== "announcement") return;
  assert.equal(guestView.heading, "ANNOUNCEMENT · TO EVERYONE INVITED");
  assert.equal(guestView.text, "Doors open at 11:30");
  assert.equal(guestView.label, "Announcement to everyone invited, Ana, Doors open at 11:30, 09:00");
  assert.deepEqual(guestView.actions, ["report"]);
  assert.deepEqual(only(feed([ann], { viewerId: ANA, host: true }), "announcement")[0].actions, ["delete"]);
  assert.deepEqual(only(feed([ann], { viewerId: MIA, host: true }), "announcement")[0].actions, ["remove", "report"]);
  const going = only(feed([{ ...ann, audience: "going" }]), "announcement")[0];
  assert.equal(going.heading, "ANNOUNCEMENT · TO GOING");
  const removed = only(feed([{ ...ann, state: "removed", body: null }], { viewerId: MIA, host: true }), "announcement")[0];
  assert.equal(removed.text, CHAT_COPY.removed);
  assert.deepEqual(removed.actions, []);
});

test("a system line is Resbite's: plain text, read as 'Resbite: …', with no actions", () => {
  const [, row] = feed([sys(4, "joined", { actor: MIA, user: MIA })]);
  assert.deepEqual(row, { type: "system", key: "m:4", text: "Mia joined", label: "Resbite: Mia joined" });
  const [, you] = feed([sys(4, "joined", { actor: PEDRO, user: PEDRO })]);
  assert.equal(you.type === "system" && you.label, "Resbite: You joined");
});

test("a change is a chip that ends with Tap to see, except on the viewer's own change (the mockup)", () => {
  const change = sys(6, "changed", { actor: ANA, what: "place", place_label: "Fixture park, north gate" });
  const [, theirs] = feed([change]);
  assert.equal(theirs.type, "change");
  if (theirs.type !== "change") return;
  // The tail is drawn regular and muted, apart from the line (H31).
  assert.equal(theirs.text, "Ana changed the place · Fixture park, north gate");
  assert.equal(theirs.tail, "Tap to see");
  assert.equal(theirs.label, "Resbite: Ana changed the place · Fixture park, north gate · Tap to see");
  const [, mine] = feed([change], { viewerId: ANA, host: true });
  assert.equal(mine.type === "change" && mine.text, "You changed the place · Fixture park, north gate");
  assert.equal(mine.type === "change" && mine.tail, null);
  assert.equal(mine.type === "change" && mine.label, "Resbite: You changed the place · Fixture park, north gate");
});

test("a row the build can't word is left out: an unknown event, kind or state (H20)", () => {
  const rows = feed([
    sys(1, "teleported", { actor: ANA }),
    msg(2, { kind: "poll" as ChatMessage["kind"] }),
    msg(3, { state: "hidden" as ChatMessage["state"] }),
    msg(4),
  ]);
  assert.deepEqual(rows.map((r) => r.key), ["day:m:4", "m:4"]);
  // Nothing at all: no separator either.
  assert.deepEqual(feed([sys(1, "teleported", {})]), []);
});

test("the computed ended line reads '<title> ended' and is labelled as Resbite's (K-S16)", () => {
  const ended: EndedLine = { kind: "ended", at: "2026-10-27T15:00:00Z" };
  const rows = feed([msg(1, { createdAt: "2026-10-27T14:00:00Z" }), ended, msg(2, { createdAt: "2026-10-28T09:00:00Z" })]);
  assert.deepEqual(types(rows), ["day", "bubble", "ended", "day", "bubble"]);
  const line = only(rows, "ended")[0];
  assert.equal(line.text, "Picnic in the park ended");
  assert.equal(line.label, "Resbite: Picnic in the park ended");
  assert.equal(line.key, "ended");
  // First on its own day, it brings its separator.
  assert.deepEqual(types(feed([ended, msg(1, { createdAt: "2026-10-28T09:00:00Z" })])), ["day", "ended", "day", "bubble"]);
  // With no title it has no words, and is left out.
  assert.deepEqual(types(feed([ended], { title: "" })), []);
});

test("an unsent message says its send state; a failed one offers Delete unsent message (K-S7, K-S14)", () => {
  const rows = only(feed([pending("c-1"), pending("c-2", { failed: true })]), "pending");
  assert.equal(rows[0].label, "You, I can bring the snacks, 10:00, Sending…");
  assert.deepEqual(rows[0].actions, []);
  assert.equal(rows[0].key, "p:c-1");
  assert.equal(rows[1].label, "You, I can bring the snacks, 10:00, Not sent. Tap to retry.");
  assert.deepEqual(rows[1].actions, ["deleteUnsent"]);
  assert.equal(rows[1].failed, true);
});

test("the name shows once over a run of one person's messages, and again after anything else", () => {
  const rows = only(
    feed([
      msg(1),
      msg(2),
      sys(3, "joined", { actor: MIA, user: MIA }),
      msg(4),
      msg(5, { authorId: MIA }),
      msg(6, { createdAt: "2026-10-29T09:00:00Z" }),
    ]),
    "bubble",
  );
  assert.deepEqual(rows.map((r) => r.showAuthor), [true, false, true, true, true]);
});

test("messageActions follows the same rules for any row", () => {
  assert.deepEqual(messageActions(msg(1), ANA, true), ["remove", "report"]);
  assert.deepEqual(messageActions(msg(1, { authorId: ANA }), ANA, true), ["delete"]);
  assert.deepEqual(messageActions(msg(1), PEDRO, false), ["report"]);
  // A sent row with no author can't be anyone's own: a host can still take it down, and nobody can report it (G-N12).
  assert.deepEqual(messageActions(msg(1, { authorId: null }), ANA, true), ["remove"]);
  assert.deepEqual(messageActions(msg(1, { authorId: null }), PEDRO, false), []);
  assert.deepEqual(messageActions(sys(1, "joined", { user: MIA }), ANA, true), []);
});

test("day separators have keys of their own even when a day comes back: an old failed message after newer ones (H31)", () => {
  const rows = feed([
    msg(1, { createdAt: "2026-10-27T18:10:00Z" }),
    msg(2, { createdAt: "2026-10-28T09:00:00Z" }),
    pending("old", { createdAt: "2026-10-27T16:00:00Z", failed: true }),
    // A late commit across midnight does the same.
    msg(3, { createdAt: "2026-10-27T23:59:00Z" }),
  ]);
  assert.deepEqual(types(rows), ["day", "bubble", "day", "bubble", "day", "pending", "bubble"]);
  assert.deepEqual(only(rows, "day").map((d) => d.text), ["Tue 27 Oct", "Wed 28 Oct", "Tue 27 Oct"]);
  const keys = rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, keys.join(" "));
  assert.deepEqual(only(rows, "day").map((d) => d.key), ["day:m:1", "day:m:2", "day:p:old"]);
});

test("a sent row with no body draws nothing (H32 Q8)", () => {
  const rows = feed([msg(1, { body: null }), msg(2, { kind: "announcement", audience: "going", body: null }), msg(3)]);
  assert.deepEqual(rows.map((r) => r.key), ["day:m:3", "m:3"]);
});

test("each link is an action, named by its host, numbered when a host comes twice (H31, H32 Q13)", () => {
  const body = "two https://example.com/a and https://example.com/b, then https://example.org/c";
  const row = only(feed([msg(1, { body })], { viewerId: ANA, host: true }), "bubble")[0];
  assert.deepEqual(row.links, [
    { name: "link:0", href: "https://example.com/a", host: "example.com", label: "Open example.com" },
    { name: "link:1", href: "https://example.com/b", host: "example.com", label: "Open example.com (2)" },
    { name: "link:2", href: "https://example.org/c", host: "example.org", label: "Open example.org" },
  ]);
  // Gone rows have none; plain text has none.
  assert.deepEqual(only(feed([msg(2, { body: "no links" })]), "bubble")[0].links, []);
  assert.deepEqual(only(feed([msg(3, { state: "removed", body: null })]), "bubble")[0].links, []);
  const ann = only(feed([msg(4, { kind: "announcement", audience: "going", body: "Map https://example.com/x" })]), "announcement")[0];
  assert.deepEqual(ann.links.map((l) => l.label), ["Open example.com"]);
});

test("nothing said yet: system lines and the ended line don't count, a message, an announcement or an unsent one does (H31 Q3)", () => {
  const ended: EndedLine = { kind: "ended", at: "2026-10-27T15:00:00Z" };
  assert.equal(nothingSaid(feed([])), true);
  assert.equal(nothingSaid(feed([sys(1, "joined", { actor: MIA, user: MIA }), ended])), true);
  assert.equal(nothingSaid(feed([sys(1, "changed", { actor: ANA, what: "place", place_label: "Park" })])), true);
  assert.equal(nothingSaid(feed([msg(2)])), false);
  assert.equal(nothingSaid(feed([msg(2, { kind: "announcement", audience: "going" })])), false);
  assert.equal(nothingSaid(feed([pending("c")])), false);
  // A deleted message was said.
  assert.equal(nothingSaid(feed([msg(3, { state: "deleted", body: null })])), false);
});

test("a date outside the current year shows the year in separators and labels (H32 Q50)", () => {
  const rows = feed([msg(1, { createdAt: "2025-11-15T19:00:00Z" })]);
  assert.equal(only(rows, "day")[0].text, "Sat 15 Nov 2025");
  assert.equal(only(rows, "bubble")[0].label, "Leo, message 1, Sat 15 Nov 2025, 19:00");
});

test("in a closed chat an unsent message says the close overtook it, and offers only Delete (H32 29)", () => {
  const rows = only(feed([pending("c-1"), pending("c-2", { failed: true })], { closed: true }), "pending");
  assert.deepEqual(rows.map((r) => r.closed), [true, true]);
  assert.equal(rows[0].label, "You, I can bring the snacks, 10:00, This chat closed before it was sent.");
  assert.deepEqual(rows.map((r) => r.actions), [["deleteUnsent"], ["deleteUnsent"]]);
  const open = only(feed([pending("c-3", { failed: true })]), "pending")[0];
  assert.equal(open.closed, false);
});

// Plan 2 (groups).
const SOL = "0a000000-0000-4000-8000-000000000004";
const groupNames: ChatNames = { ...names, [SOL]: "Sol" };
const groupFeed = (items: Array<ChatMessage | PendingMessage | EndedLine>, over: Partial<Parameters<typeof chatFeed>[1]> = {}) =>
  feed(items, { names: groupNames, group: true, day: "Thursday", title: "Board game night", ...over });

test("on a group, an announcement is headed and read by the group's audience, and its lines take the group's words", () => {
  const rows = groupFeed([
    msg(1, { kind: "announcement", audience: "going", body: "Doors at 19:30", authorId: ANA }),
    msg(2, { kind: "announcement", audience: "everyone", body: "Bring a game", authorId: ANA }),
    sys(3, "left", { actor: SOL, user: SOL }),
    sys(4, "cant_go", { actor: SOL, user: SOL }),
  ]);
  const cards = only(rows, "announcement");
  assert.deepEqual(cards.map((c) => c.heading), ["ANNOUNCEMENT · TO GOING THIS THURSDAY", "ANNOUNCEMENT · TO EVERYONE IN THE GROUP"]);
  assert.ok(cards[0].label.startsWith("Announcement to people going this Thursday, Ana"), cards[0].label);
  assert.ok(cards[1].label.startsWith("Announcement to everyone in the group, Ana"), cards[1].label);
  const lines = only(rows, "system");
  assert.deepEqual(lines.map((l) => l.text), ["Sol left the group", "Sol can’t make it this week"]);
  assert.deepEqual(lines.map((l) => l.label), ["Resbite: Sol left the group", "Resbite: Sol can’t make it this week"]);
  // The same rows on a one-off read as built.
  const oneOff = feed([msg(1, { kind: "announcement", audience: "going", body: "Doors at 19:30", authorId: ANA }), sys(4, "cant_go", { actor: SOL, user: SOL })], {
    names: groupNames,
  });
  assert.equal(only(oneOff, "announcement")[0].heading, "ANNOUNCEMENT · TO GOING");
  assert.equal(only(oneOff, "system")[0].text, "Sol can’t make it");
});

test("a next line is a row of its own, its words and label, with no plan id: the screen opens the current one (I5)", () => {
  const OLD_PLAN = "0c000000-0000-4000-8000-0000000000ff";
  const next = sys(5, "next", {
    actor: null,
    plan_id: OLD_PLAN,
    starts_at: "2025-11-20T19:00:00Z",
    time_zone: LONDON,
    place_label: "Ana's flat",
    place_tbd: false,
  });
  const rows = groupFeed([next]).filter((r) => r.type !== "day");
  assert.deepEqual(rows, [
    { type: "next", key: "m:5", text: "Next one: Thu 20 Nov · Ana's flat", label: "Resbite: Next one: Thu 20 Nov · Ana's flat" },
  ]);
  assert.equal(JSON.stringify(rows).includes(OLD_PLAN), false);
  assert.equal(Object.keys(rows[0]).some((k) => /plan/i.test(k)), false);
  // Every next line is one, on a one-off's build too (after a rollback the flag reads false).
  assert.equal(feed([next]).filter((r) => r.type === "next").length, 1);
});

test("a stopped group's computed ended line reads as the roll's would (G-S6)", () => {
  const rows = groupFeed([{ kind: "ended", at: "2026-10-28T08:00:00Z" }]);
  assert.deepEqual(only(rows, "ended").map((r) => [r.text, r.label]), [["Board game night ended", "Resbite: Board game night ended"]]);
});

test("the chat screen hides deleted lines before anything else, and words its feed and pinned card by the group", () => {
  const screen = readFileSync(new URL("../../app/chat.tsx", import.meta.url), "utf8");
  assert.match(screen, /chatFeed\(withEndedLine\(withPending\(shownMessages\(chat\.messages\), chat\.pending\), summary, chat\.hasEarlier, now\), \{/);
  assert.match(screen, /group: summary\.isGroup,\s*day,/);
  assert.match(screen, /const day = groupDay\(summary\);/);
  assert.match(screen, /messageLabel\(pinned, chat\.names, viewerId, now, zone, undefined, summary\.isGroup, dayFor\(pinned, summary\.planId, day\)\)/);
  assert.match(screen, /group: summary\.isGroup,\s*day,\s*planId: summary\.planId,/);
});

// Ruling GR1 (2) and (4).
const CURRENT_PLAN = "0c000000-0000-4000-8000-000000000001";
const EARLIER_PLAN = "0c000000-0000-4000-8000-000000000000";
test("on a group, an announcement says this week's day only for the current occurrence; an earlier one's going reads as a one-off's", () => {
  const going = (id: number, planId?: string) =>
    msg(id, { kind: "announcement", audience: "going", body: "Doors at 19:30", authorId: ANA, ...(planId ? { planId } : {}) });
  const rows = only(
    groupFeed(
      [
        going(1, EARLIER_PLAN),
        msg(2, { kind: "announcement", audience: "everyone", body: "Bring a game", authorId: ANA, planId: EARLIER_PLAN }),
        going(3, CURRENT_PLAN),
        going(4),
      ],
      { planId: CURRENT_PLAN },
    ),
    "announcement",
  );
  assert.deepEqual(rows.map((r) => r.heading), [
    "ANNOUNCEMENT · TO GOING",
    "ANNOUNCEMENT · TO EVERYONE IN THE GROUP",
    "ANNOUNCEMENT · TO GOING THIS THURSDAY",
    "ANNOUNCEMENT · TO GOING THIS THURSDAY",
  ]);
  assert.ok(rows[0].label.startsWith("Announcement to people going, Ana"), rows[0].label);
  assert.ok(rows[1].label.startsWith("Announcement to everyone in the group, Ana"), rows[1].label);
  assert.ok(rows[2].label.startsWith("Announcement to people going this Thursday, Ana"), rows[2].label);
  assert.ok(rows[3].label.startsWith("Announcement to people going this Thursday, Ana"), rows[3].label);
  // A one-off ignores it: its words never name a day.
  const oneOff = only(feed([going(1, EARLIER_PLAN)], { planId: CURRENT_PLAN }), "announcement");
  assert.equal(oneOff[0].heading, "ANNOUNCEMENT · TO GOING");
});

test("on a group whose day can't be read, a going announcement reads as a one-off's, with no dangling 'this'", () => {
  const [card] = only(groupFeed([msg(1, { kind: "announcement", audience: "going", body: "Doors at 19:30", authorId: ANA })], { day: "" }), "announcement");
  assert.equal(card.heading, "ANNOUNCEMENT · TO GOING");
  assert.ok(card.label.startsWith("Announcement to people going, Ana"), card.label);
});

// Ruling GR6 (I1): a system line that names this week ("this Thursday", "this week") does so only on the current
// occurrence. An earlier week's cancel names that occurrence's date (ruling GR7), never "the resbite", which in a group
// reads as the whole group ending; an earlier week's can't-go reads in the one-off words.
test("on a group, an earlier week's cancel names its date and its can't-go the one-off words; this week's name the week", () => {
  const CURRENT = "0c000000-0000-4000-8000-000000000027";
  const EARLIER = "0c000000-0000-4000-8000-000000000020";
  const cancelled = (id: number, plan: string | undefined) => ({
    ...sys(id, "cancelled", { actor: ANA, stop: false, starts_at: "2025-11-20T19:00:00Z", time_zone: LONDON }),
    ...(plan ? { planId: plan } : {}),
  });
  const cantGo = (id: number, plan: string | undefined) => ({ ...sys(id, "cant_go", { actor: SOL, user: SOL }), ...(plan ? { planId: plan } : {}) });
  const rows = groupFeed([cancelled(1, EARLIER), cantGo(2, EARLIER), cancelled(3, CURRENT), cantGo(4, CURRENT), cancelled(5, undefined)], {
    planId: CURRENT,
  });
  const lines = only(rows, "system");
  assert.deepEqual(lines.map((l) => l.text), [
    "Ana cancelled Thu 20 Nov",
    "Sol can’t make it",
    "Ana cancelled this Thursday",
    "Sol can’t make it this week",
    // A row that doesn't say which occurrence it belongs to reads as the current one's.
    "Ana cancelled this Thursday",
  ]);
  assert.deepEqual(lines.slice(0, 2).map((l) => l.label), ["Resbite: Ana cancelled Thu 20 Nov", "Resbite: Sol can’t make it"]);
  // The date in the occurrence's own zone, with no year; with none readable, the one-off words.
  const late = { ...sys(7, "cancelled", { actor: ANA, stop: false, starts_at: "2025-11-20T23:30:00Z", time_zone: "Asia/Tokyo" }), planId: EARLIER };
  const dateless = { ...sys(8, "cancelled", { actor: ANA, stop: false, starts_at: "soon", time_zone: LONDON }), planId: EARLIER };
  assert.deepEqual(only(groupFeed([late, dateless], { planId: CURRENT }), "system").map((l) => l.text), ["Ana cancelled Fri 21 Nov", "Ana cancelled the resbite"]);
  // A cancel that stopped the group names no week either way.
  const stopped = groupFeed([{ ...sys(6, "cancelled", { actor: ANA, stop: true, starts_at: "2025-11-20T19:00:00Z", time_zone: LONDON }), planId: EARLIER }], { planId: CURRENT });
  assert.equal(only(stopped, "system")[0].text, "Ana cancelled the group");
});

// Plan 3 (G-N12): Report message on someone else's message or announcement while it is sent, whoever reads it.
test("messageActions offers Report after Delete or Remove, on someone else's sent message or announcement only", () => {
  const ann = msg(5, { kind: "announcement", audience: "everyone", authorId: ANA });
  // Someone else's: Report for a guest, Remove then Report for a host.
  assert.deepEqual(messageActions(msg(1), PEDRO, false), ["report"]);
  assert.deepEqual(messageActions(msg(1), ANA, true), ["remove", "report"]);
  assert.deepEqual(messageActions(ann, PEDRO, false), ["report"]);
  assert.deepEqual(messageActions(ann, MIA, true), ["remove", "report"]);
  // One's own: Delete only.
  assert.deepEqual(messageActions(msg(1, { authorId: PEDRO }), PEDRO, false), ["delete"]);
  assert.deepEqual(messageActions(ann, ANA, true), ["delete"]);
  // Gone, or a system line: nothing, for a guest or a host.
  for (const host of [false, true]) {
    assert.deepEqual(messageActions(msg(1, { state: "removed", body: null }), PEDRO, host), []);
    assert.deepEqual(messageActions(msg(1, { state: "deleted", body: null }), PEDRO, host), []);
    assert.deepEqual(messageActions({ ...ann, state: "removed", body: null }, PEDRO, host), []);
    assert.deepEqual(messageActions(sys(1, "joined", { actor: MIA, user: MIA }), PEDRO, host), []);
  }
  // The feed's rows carry the same.
  assert.deepEqual(only(feed([msg(1)]), "bubble")[0].actions, ["report"]);
  assert.deepEqual(only(feed([msg(1, { state: "removed", body: null })]), "bubble")[0].actions, []);
});

// Plan 3 (CH-R-A3): the bubble and the announcement card word a removal by Resbite apart from a host's.
test("a removed row with payload { by: 'resbite' } reads 'Message removed by Resbite' in the bubble, the card and the label", () => {
  const byResbite = only(feed([msg(2, { state: "removed", body: null, payload: { by: "resbite" } })]), "bubble")[0];
  assert.equal(byResbite.text, "Message removed by Resbite");
  assert.equal(byResbite.gone, "removed");
  assert.equal(byResbite.label, "Leo, Message removed by Resbite, 09:00");
  assert.deepEqual(byResbite.links, []);
  const byHost = only(feed([msg(2, { state: "removed", body: null })]), "bubble")[0];
  assert.equal(byHost.text, "Message removed by an admin");
  assert.equal(byHost.label, "Leo, Message removed by an admin, 09:00");
  const ann = msg(5, { kind: "announcement", audience: "everyone", authorId: ANA, state: "removed", body: null, payload: { by: "resbite" } });
  const card = only(feed([ann]), "announcement")[0];
  assert.equal(card.text, "Message removed by Resbite");
  assert.equal(card.gone, "removed");
  assert.equal(only(feed([{ ...ann, payload: null }]), "announcement")[0].text, "Message removed by an admin");
});
