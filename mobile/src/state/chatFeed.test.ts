import test from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage, ChatNames } from "../services/chat";
import type { EndedLine, PendingMessage } from "./chatModel";
import { chatFeed, messageActions, type FeedRow } from "./chatFeed";
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
  chatFeed(items, { names, viewerId: PEDRO, now: NOW, zone: LONDON, title: TITLE, host: false, ...over });
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

test("someone's message: their name above it, the body, the screen reader's label with its day, no actions for a guest", () => {
  const [, row] = feed([msg(7, { body: "Count me in", createdAt: "2026-10-27T18:10:00Z" })]);
  assert.equal(row.type, "bubble");
  if (row.type !== "bubble") return;
  assert.equal(row.own, false);
  assert.equal(row.author, "Leo");
  assert.equal(row.text, "Count me in");
  assert.equal(row.gone, null);
  assert.equal(row.label, "Leo, Count me in, Tue 27 Oct, 18:10");
  assert.deepEqual(row.actions, []);
  assert.equal(row.key, "m:7");
});

test("a host may remove someone else's message; their own is deleted, never removed (K-N12)", () => {
  const theirs = only(feed([msg(7)], { host: true, viewerId: ANA }), "bubble")[0];
  assert.deepEqual(theirs.actions, ["remove"]);
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
  assert.deepEqual(guestView.actions, []);
  assert.deepEqual(only(feed([ann], { viewerId: ANA, host: true }), "announcement")[0].actions, ["delete"]);
  assert.deepEqual(only(feed([ann], { viewerId: MIA, host: true }), "announcement")[0].actions, ["remove"]);
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
  assert.equal(theirs.text, "Ana changed the place · Fixture park, north gate · Tap to see");
  assert.equal(theirs.label, "Resbite: Ana changed the place · Fixture park, north gate · Tap to see");
  const [, mine] = feed([change], { viewerId: ANA, host: true });
  assert.equal(mine.type === "change" && mine.text, "You changed the place · Fixture park, north gate");
  assert.equal(mine.type === "change" && mine.label, "Resbite: You changed the place · Fixture park, north gate");
});

test("a row the build can't word is left out: an unknown event, kind or state (H20)", () => {
  const rows = feed([
    sys(1, "teleported", { actor: ANA }),
    msg(2, { kind: "poll" as ChatMessage["kind"] }),
    msg(3, { state: "hidden" as ChatMessage["state"] }),
    msg(4),
  ]);
  assert.deepEqual(rows.map((r) => r.key), ["day:2026-10-28", "m:4"]);
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
  assert.deepEqual(messageActions(msg(1), ANA, true), ["remove"]);
  assert.deepEqual(messageActions(msg(1, { authorId: ANA }), ANA, true), ["delete"]);
  assert.deepEqual(messageActions(msg(1), PEDRO, false), []);
  // A sent row with no author can't be anyone's own: a host can still take it down.
  assert.deepEqual(messageActions(msg(1, { authorId: null }), ANA, true), ["remove"]);
  assert.deepEqual(messageActions(sys(1, "joined", { user: MIA }), ANA, true), []);
});
