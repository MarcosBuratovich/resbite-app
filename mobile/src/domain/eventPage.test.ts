import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EVENT_COPY,
  answerCountsFrom,
  bottomRow,
  bringRow,
  broughtFrom,
  chatRow,
  broughtNames,
  readsOwnLinks,
  byline,
  cancelQuestion,
  hostLabel,
  moreRows,
  namesLine,
  pageState,
  showsNames,
  stateChip,
  peopleCounts,
  peopleGroups,
  peopleRowText,
  personLabel,
  placeLine,
  planEnd,
  avatarLetter,
  focusAfterRemove,
  removalOf,
  removeQuestion,
  replyText,
  rowByKey,
  sheetHead,
  spokenName,
  viewerRole,
  whenLines,
  type PersonRow,
} from "./eventPage.ts";
import type { ConnectionState } from "../services/connections.ts";
import type { ChatMessage, ChatSummary } from "../services/chat.ts";

const hour = 3_600_000;
const start = "2099-10-15T18:00:00Z";
const plan = { status: "active", starts_at: start, ends_at: "2099-10-15T21:00:00Z", repeat_weeks: null as 1 | 2 | null };
const during = Date.parse(start) + hour;
const after = Date.parse(plan.ends_at) + 60_000;

test("planEnd is the end, or the start when there is none", () => {
  assert.equal(planEnd(plan), Date.parse("2099-10-15T21:00:00Z"));
  assert.equal(planEnd({ starts_at: start }), Date.parse(start));
  assert.equal(planEnd({ starts_at: start, ends_at: null }), Date.parse(start));
});

test("viewerRole: owner, admin or guest", () => {
  assert.equal(viewerRole({ owner_id: "o" }, "o", ["a"]), "owner");
  assert.equal(viewerRole({ owner_id: "o" }, "a", ["a"]), "admin");
  assert.equal(viewerRole({ owner_id: "o" }, "g", ["a"]), "guest");
  assert.equal(viewerRole({ owner_id: "o" }, null, ["a"]), "guest");
});

test("pageState: open until the end, then ended; cancelled wins", () => {
  assert.equal(pageState(plan, during), "open");
  assert.equal(pageState(plan, Date.parse(plan.ends_at)), "ended");
  assert.equal(pageState(plan, after), "ended");
  assert.equal(pageState({ ...plan, status: "cancelled" }, during), "cancelled");
  assert.equal(pageState({ ...plan, status: "cancelled" }, after), "cancelled");
});

test("bottomRow for the nine role, state and answer shapes", () => {
  for (const role of ["owner", "admin"] as const) {
    assert.deepEqual(bottomRow({ role, state: "open", response: null }), { kind: "host" });
    assert.deepEqual(bottomRow({ role, state: "ended", response: null }), { kind: "again" });
    assert.deepEqual(bottomRow({ role, state: "cancelled", response: null }), { kind: "again" });
  }
  assert.deepEqual(bottomRow({ role: "guest", state: "open", response: null }), { kind: "answer" });
  assert.deepEqual(bottomRow({ role: "guest", state: "open", response: "pending" }), { kind: "answer" });
  assert.deepEqual(bottomRow({ role: "guest", state: "open", response: "accepted" }), { kind: "reply", text: "You’re going", change: true });
  assert.deepEqual(bottomRow({ role: "guest", state: "ended", response: "maybe" }), { kind: "reply", text: "Maybe", change: false });
  assert.deepEqual(bottomRow({ role: "guest", state: "ended", response: "withdrawn" }), { kind: "reply", text: "You can’t go", change: false });
  assert.deepEqual(bottomRow({ role: "guest", state: "ended", response: null }), { kind: "none" });
  assert.deepEqual(bottomRow({ role: "guest", state: "cancelled", response: "accepted" }), { kind: "none" });
});

test("replyText", () => {
  assert.equal(replyText("accepted"), "You’re going");
  assert.equal(replyText("maybe"), "Maybe");
  assert.equal(replyText("declined"), "You can’t go");
  assert.equal(replyText("withdrawn"), "You can’t go");
});

test("moreRows by role, state and answer", () => {
  const calendar = true;
  assert.deepEqual(moreRows({ role: "owner", state: "open", muted: false, response: null, calendar }), ["calendar", "mute", "again", "cancel"]);
  assert.deepEqual(moreRows({ role: "owner", state: "open", muted: true, response: null, calendar }), ["calendar", "unmute", "again", "cancel"]);
  assert.deepEqual(moreRows({ role: "admin", state: "open", muted: false, response: "accepted", calendar }), ["calendar", "mute", "again", "changeReply", "cancel"]);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: false, response: "maybe", calendar }), ["calendar", "mute"]);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: true, response: "accepted", calendar }), ["calendar", "unmute"]);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: false, response: "pending", calendar }), []);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: false, response: null, calendar }), []);
  for (const role of ["owner", "admin", "guest"] as const)
    for (const state of ["ended", "cancelled"] as const)
      assert.deepEqual(moreRows({ role, state, muted: false, response: "accepted", calendar }), [], `${role} ${state}`);
});

test("moreRows: Add to calendar only where UX3's calendar rule allows it", () => {
  // A Can’t go guest, and an admin who hasn't answered (a rolled occurrence), get no calendar row (canAddToCalendar).
  const calendar = false;
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: false, response: "declined", calendar }), ["mute"]);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: true, response: "withdrawn", calendar }), ["unmute"]);
  assert.deepEqual(moreRows({ role: "admin", state: "open", muted: false, response: "pending", calendar }), ["mute", "again", "changeReply", "cancel"]);
});

test("whenLines marks an ended event and points a repeating one to My resbites", () => {
  assert.deepEqual(whenLines(plan, "UTC", during), { line: "Thu 15 Oct · 18:00 to 21:00", second: null });
  const repeating = { ...plan, repeat_weeks: 1 as const };
  assert.equal(whenLines(repeating, "UTC", during).second, "Every Thursday");
  const ended = whenLines(repeating, "UTC", after);
  assert.equal(ended.line, "Thu 15 Oct · 18:00 to 21:00 · Ended");
  assert.equal(ended.second, "Every Thursday · the next one is in My resbites");
  assert.equal(whenLines({ ...plan, ends_at: null }, "UTC", after).line, "Thu 15 Oct · 18:00 · Ended");
  assert.equal(whenLines({ ...repeating, repeat_weeks: 2 }, "UTC", during).second, "Every other Thursday");
});

test("placeLine: to be decided, exact for hosts and answered guests, the area before", () => {
  const place = { place_tbd: false, place_label: "12 Mill Road", area: "Near the station" };
  assert.deepEqual(placeLine({ ...place, place_tbd: true }, { role: "owner", response: null }), { text: "Place to be decided", maps: false });
  assert.deepEqual(placeLine(place, { role: "admin", response: null }), { text: "12 Mill Road", maps: true });
  assert.deepEqual(placeLine(place, { role: "guest", response: "maybe" }), { text: "12 Mill Road", maps: true });
  assert.deepEqual(placeLine(place, { role: "guest", response: "pending" }), { text: "Near the station", maps: false });
  assert.deepEqual(placeLine({ ...place, area: "" }, { role: "guest", response: null }), { text: "Exact address after you reply", maps: false });
});

test("hostLabel and byline", () => {
  assert.equal(hostLabel("owner"), "You’re hosting");
  assert.equal(hostLabel("admin"), "You’re an admin");
  assert.equal(hostLabel("guest"), null);
  assert.equal(byline("Ana"), "Hosted by Ana");
});

const guest = (userId: string, name: string, response: string, broughtById: string | null = null, level = 1) => ({ userId, name, response, broughtById, level });
/** Someone invited by personal link: `held` is whether this phone holds their code (with the app it went by, if any). */
const linkPerson = (phone: string, name: string, sentVia?: "whatsapp" | "messages", held = sentVia !== undefined, brought = false) => ({
  phone,
  e164: `+44${phone}`,
  country: "44",
  brought,
  name,
  stored: held ? { code: "c", name, ...(sentVia ? { sentVia } : {}) } : null,
  storedKey: held ? `+44${phone}` : null,
});
const request = (user_id: string, name: string) => ({ user_id, name, response: "accepted", ending: null, created_at: "2099-01-01T00:00:00Z" });

test("peopleCounts and peopleRowText", () => {
  const counts = peopleCounts({
    guests: [
      guest("1", "A", "accepted"), guest("2", "B", "accepted"), guest("3", "C", "maybe"),
      guest("4", "D", "declined"), guest("5", "E", "withdrawn"), guest("6", "F", "pending"),
    ],
    invited: [linkPerson("1", "X")],
    requests: [request("r", "R")],
  });
  assert.deepEqual(counts, { going: 2, maybe: 1, cantGo: 2, invited: 2, waiting: 1 });
  const c = { going: 6, maybe: 0, cantGo: 1, invited: 2, waiting: 1 };
  assert.equal(peopleRowText(c, true), "Going 6 · Can’t go 1 · 2 invited · 1 waiting");
  assert.equal(peopleRowText({ ...c, maybe: 2 }, true), "Going 6 · Maybe 2 · Can’t go 1 · 2 invited · 1 waiting");
  assert.equal(peopleRowText(c, false), "Going 6 · Can’t go 1");
  assert.equal(peopleRowText({ ...c, invited: 0, waiting: 0 }, true), "Going 6 · Can’t go 1");
});

test("an unanswered guest's people row reads the server's counts, not their own row alone", () => {
  // The server returns only their own pending row (UX-P5); plan_people_counts gives the numbers (CR-P4).
  const own = [guest("me", "Fixture", "pending")];
  assert.deepEqual(peopleCounts({ guests: own, invited: [], requests: [] }), { going: 0, maybe: 0, cantGo: 0, invited: 1, waiting: 0 });
  const counts = peopleCounts({ guests: own, invited: [], requests: [], counts: { going: 2, maybe: 1, cantGo: 1 } });
  assert.deepEqual(counts, { going: 2, maybe: 1, cantGo: 1, invited: 1, waiting: 0 });
  assert.equal(peopleRowText(counts, false), "Going 2 · Maybe 1 · Can’t go 1");
  // No counts (the whole list is read): the rows are counted as before.
  assert.equal(peopleCounts({ guests: [guest("a", "A", "accepted")], invited: [], requests: [], counts: null }).going, 1);
});

test("answerCountsFrom reads plan_people_counts' reply and refuses anything else", () => {
  assert.deepEqual(answerCountsFrom({ going: 3, maybe: 0, cant_go: 2 }), { going: 3, maybe: 0, cantGo: 2 });
  for (const bad of [null, "3", {}, { going: 1, maybe: 0 }, { going: -1, maybe: 0, cant_go: 0 }, { going: 1.5, maybe: 0, cant_go: 0 }, { going: "1", maybe: 0, cant_go: 0 }])
    assert.throws(() => answerCountsFrom(bad), /Unexpected people counts/, JSON.stringify(bad));
});

test("namesLine", () => {
  assert.equal(namesLine(["Leo", "Marta", "Sol", "Ana", "Bo", "Cy"]), "Leo, Marta, Sol and 3 more");
  assert.equal(namesLine(["Leo", "Marta", "Sol", "Ana"]), "Leo, Marta, Sol and 1 more");
  assert.equal(namesLine(["Leo", "Marta", "Sol"]), "Leo, Marta and Sol");
  assert.equal(namesLine(["Leo", "Marta"]), "Leo and Marta");
  assert.equal(namesLine(["Leo"]), "Leo");
  assert.equal(namesLine([]), "");
});

test("cancelQuestion: one button for a single resbite, two for a repeating one", () => {
  const single = cancelQuestion({ starts_at: start, repeat_weeks: null }, "UTC");
  assert.deepEqual(single, {
    title: "Cancel this resbite for everyone?",
    line: null,
    actions: [{ key: "cancel", title: "Yes, cancel resbite", stop: false }],
    keep: "Keep resbite",
  });
  const weekly = cancelQuestion({ starts_at: start, repeat_weeks: 1 }, "UTC");
  assert.equal(weekly.line, "It repeats every Thursday. Everyone invited will be told.");
  assert.deepEqual(weekly.actions, [
    { key: "one", title: "Cancel just this one", stop: false },
    { key: "stop", title: "Cancel this and stop repeating", stop: true },
  ]);
  assert.equal(cancelQuestion({ starts_at: start, repeat_weeks: 2 }, "UTC").line, "It repeats every other Thursday. Everyone invited will be told.");
});

test("peopleGroups for an owner", () => {
  const groups = peopleGroups({
    role: "owner",
    state: "open",
    guests: [
      guest("adm", "Leo", "accepted"), guest("g1", "Marta", "accepted"), guest("m1", "Sol", "maybe"),
      guest("c1", "Ivy", "declined"), guest("p1", "Pat", "pending"),
    ],
    // Dan's and Fay's codes are on this phone (Fay's with no app recorded); Eve's is not.
    invited: [linkPerson("111", "Dan", "whatsapp"), linkPerson("222", "Eve"), linkPerson("333", "Fay", undefined, true)],
    requests: [request("r1", "Rae")],
    admins: ["adm"],
    owner: null,
    userId: "u-me",
    connections: null,
  });
  assert.deepEqual(groups.map((g) => g.title), [
    "Going · 2", "Maybe · 1", "Can’t go · 1", "Invited, not answered yet · 4", "Waiting for you · 1",
  ]);
  const [going, maybe, cant, invited, waiting] = groups.map((g) => g.rows);
  assert.deepEqual(going[0], { key: "guest:adm", name: "Leo", status: null, reply: "Going", admin: true, kind: "guest", userId: "adm", connection: null, me: false, actions: ["removeAdmin", "remove"], depth: 0, broughtByName: null, broughtByMe: false });
  assert.deepEqual(going[1].actions, ["makeAdmin", "remove"]);
  assert.equal(going[1].admin, false);
  assert.deepEqual(maybe[0], { key: "guest:m1", name: "Sol", status: null, reply: "Maybe", admin: false, kind: "guest", userId: "m1", connection: null, me: false, actions: ["remove"], depth: 0, broughtByName: null, broughtByMe: false });
  assert.deepEqual(cant[0].actions, ["remove"]);
  assert.equal(cant[0].reply, "Can’t go");
  assert.deepEqual(invited[0], { key: "link:111", name: "Dan", status: "Invited by WhatsApp", reply: null, admin: false, kind: "linkInvite", phone: "111", connection: null, me: false, actions: ["sendAgain", "removeInvite"], depth: 0, broughtByName: null, broughtByMe: false });
  // Send again needs this phone's code for the person, found under any spelling of their number (`stored`).
  assert.equal(invited[1].status, "Invited by link");
  assert.deepEqual(invited[1].actions, ["removeInvite"]);
  assert.equal(invited[2].status, "Invited by link");
  assert.deepEqual(invited[2].actions, ["sendAgain", "removeInvite"]);
  assert.deepEqual(invited[3], { key: "app:p1", name: "Pat", status: "Invited in the app", reply: null, admin: false, kind: "appInvite", userId: "p1", connection: null, me: false, actions: ["remove"], depth: 0, broughtByName: null, broughtByMe: false });
  assert.deepEqual(waiting[0], { key: "request:r1", name: "Rae", status: "Asked through the link", reply: null, admin: false, kind: "request", userId: "r1", connection: null, me: false, actions: ["approve", "decline"], depth: 0, broughtByName: null, broughtByMe: false });
});

test("peopleGroups: the owner removes an admin's role whatever their answer; Make admin only on Going", () => {
  // Maybe keeps the role (CR-P15); a rolled occurrence carries the admins as pending (CR-P24).
  const groups = peopleGroups({
    role: "owner",
    state: "open",
    guests: [guest("a1", "Ana", "maybe"), guest("a2", "Bo", "declined"), guest("a3", "Cy", "pending"), guest("g1", "Di", "maybe")],
    invited: [],
    requests: [],
    admins: ["a1", "a2", "a3"],
    owner: null,
    userId: "u-me",
    connections: null,
  });
  const rows = groups.flatMap((g) => g.rows);
  const by = (name: string) => rows.find((r) => r.name === name)!;
  assert.deepEqual(by("Ana").actions, ["removeAdmin", "remove"]);
  assert.deepEqual(by("Bo").actions, ["removeAdmin", "remove"]);
  assert.deepEqual([by("Cy").kind, by("Cy").admin, by("Cy").actions], ["appInvite", true, ["removeAdmin", "remove"]]);
  assert.deepEqual(by("Di").actions, ["remove"]);
  assert.equal(by("Ana").admin, true);
});

test("peopleGroups for an admin and a guest", () => {
  const input = {
    state: "open" as const,
    guests: [guest("g1", "Marta", "accepted"), guest("a2", "Leo", "accepted"), guest("p1", "Pat", "pending"), guest("a3", "Cy", "pending")],
    invited: [linkPerson("111", "Dan")],
    requests: [request("r1", "Rae")],
    admins: ["a2", "a3"],
    owner: null,
    userId: "u-me",
    connections: null,
  };
  const admin = peopleGroups({ ...input, role: "admin" });
  assert.deepEqual(admin.map((g) => g.title), ["Going · 2", "Invited, not answered yet · 3", "Waiting for you · 1"]);
  // An admin removes guests and decides requests, but never touches another admin (CR-P15) or the admin roles.
  assert.deepEqual(admin[0].rows.map((r) => [r.name, r.actions]), [["Marta", ["remove"]], ["Leo", []]]);
  assert.deepEqual(admin[1].rows.map((r) => [r.name, r.actions]), [["Dan", ["removeInvite"]], ["Pat", ["remove"]], ["Cy", []]]);
  assert.deepEqual(admin[2].rows[0].actions, ["approve", "decline"]);
  // A guest's `invited` holds only the links they sent (the server lists no one else's to a guest): none here.
  const asGuest = peopleGroups({ ...input, role: "guest", invited: [] });
  assert.deepEqual(asGuest.map((g) => g.title), ["Going · 2"]);
  assert.deepEqual(asGuest[0].rows.map((r) => r.actions), [[], []]);
  assert.deepEqual(peopleGroups({ ...input, guests: [], invited: [], requests: [], role: "owner" }), []);
});

test("peopleGroups after the end and once cancelled: the same groups, no actions", () => {
  for (const state of ["ended", "cancelled"] as const) {
    const groups = peopleGroups({
      role: "owner",
      state,
      guests: [guest("adm", "Leo", "accepted"), guest("g1", "Marta", "accepted"), guest("p1", "Pat", "pending")],
      invited: [linkPerson("111", "Dan", "whatsapp")],
      requests: [request("r1", "Rae")],
      admins: ["adm"],
      owner: null,
    userId: "u-me",
      connections: null,
    });
    assert.deepEqual(groups.map((g) => g.title), ["Going · 2", "Invited, not answered yet · 2", "Waiting for you · 1"], state);
    assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => r.actions)), [[], [], [], [], []], state);
    // The roles still show.
    assert.equal(groups[0].rows[0].admin, true, state);
  }
});

test("the people list offers Connect to a guest on everyone with an account but themselves", () => {
  const groups = peopleGroups({
    role: "guest",
    state: "open",
    guests: [
      guest("u-ana", "Ana", "accepted"), guest("u-leo", "Leo", "maybe"), guest("u-sol", "Sol", "declined"),
      guest("u-nico", "Nico", "accepted"), guest("u-ivy", "Ivy", "withdrawn"), guest("u-me", "Pedro", "accepted"),
    ],
    invited: [],
    requests: [],
    admins: [],
    owner: null,
    userId: "u-me",
    connections: { "u-ana": "none", "u-leo": "connected", "u-sol": "requested_by_them", "u-nico": "requested_by_me" },
  });
  const row = (id: string) => groups.flatMap((g) => g.rows).find((r) => r.userId === id)!;
  assert.deepEqual(row("u-ana").actions, ["connect"]);
  assert.deepEqual(row("u-leo").actions, []);
  assert.equal(row("u-leo").connection, "connected");
  assert.deepEqual(row("u-sol").actions, ["acceptConnection", "declineConnection"]);
  // A request refused unseen reads as sent too (CO-P3): Cancel request either way.
  assert.deepEqual(row("u-nico").actions, ["cancelRequest"]);
  // Someone the states leave out, once they were read, has no pair with the viewer.
  assert.deepEqual([row("u-ivy").connection, row("u-ivy").actions], ["none", ["connect"]]);
  assert.deepEqual([row("u-me").connection, row("u-me").me, row("u-me").actions], [null, true, []]);
  assert.equal(row("u-ana").me, false);
});

test("with the states unknown (not read, or the read failed), the people list offers no connection actions", () => {
  const groups = peopleGroups({
    role: "owner",
    state: "open",
    guests: [guest("g1", "Marta", "accepted"), guest("m1", "Sol", "maybe")],
    invited: [],
    requests: [],
    admins: [],
    owner: null,
    userId: "u-me",
    connections: null,
  });
  assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => [r.connection, r.actions])), [
    [null, ["makeAdmin", "remove"]],
    [null, ["remove"]],
  ]);
});

test("hosts get the connection action before their own, and link invitees get none", () => {
  const groups = peopleGroups({
    role: "owner",
    state: "open",
    guests: [guest("g1", "Marta", "accepted"), guest("adm", "Leo", "accepted")],
    invited: [linkPerson("111", "Dan", "whatsapp")],
    requests: [],
    admins: ["adm"],
    owner: null,
    userId: "u-me",
    connections: { g1: "none", adm: "requested_by_them" },
  });
  const rows = groups.flatMap((g) => g.rows);
  const by = (name: string) => rows.find((r) => r.name === name)!;
  assert.deepEqual(by("Marta").actions, ["connect", "makeAdmin", "remove"]);
  assert.deepEqual(by("Leo").actions, ["acceptConnection", "declineConnection", "removeAdmin", "remove"]);
  assert.deepEqual([by("Dan").connection, by("Dan").me, by("Dan").actions], [null, false, ["sendAgain", "removeInvite"]]);
});

test("connecting is offered after the end, host actions are not", () => {
  for (const state of ["ended", "cancelled"] as const) {
    const groups = peopleGroups({
      role: "owner",
      state,
      guests: [guest("g1", "Marta", "accepted"), guest("adm", "Leo", "accepted")],
      invited: [linkPerson("111", "Dan", "whatsapp")],
      requests: [request("r1", "Rae")],
      admins: ["adm"],
      owner: null,
    userId: "u-me",
      connections: { g1: "none", adm: "connected" },
    });
    assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => [r.name, r.actions])), [
      ["Marta", ["connect"]], ["Leo", []], ["Dan", []], ["Rae", []],
    ], state);
  }
});

test("someone who hasn't answered, or waits for approval, can't be asked; a request of theirs can still be answered", () => {
  // CO-P2: the server refuses to ask a guest who hasn't answered ("Not on this resbite"), as the request would name the
  // asker before they answered; an admin is a host, askable whatever their reply. Someone waiting for approval isn't on
  // the resbite yet, so the states say nothing of them.
  const groups = peopleGroups({
    role: "owner",
    state: "open",
    guests: [guest("p1", "Pat", "pending"), guest("p2", "Quin", "pending"), guest("a3", "Cy", "pending")],
    invited: [],
    requests: [request("r1", "Rae")],
    admins: ["a3"],
    owner: null,
    userId: "u-me",
    connections: { p1: "none", p2: "requested_by_them", a3: "none" },
  });
  const rows = groups.flatMap((g) => g.rows);
  const by = (name: string) => rows.find((r) => r.name === name)!;
  assert.deepEqual([by("Pat").connection, by("Pat").actions], ["none", ["remove"]]);
  assert.deepEqual(by("Quin").actions, ["acceptConnection", "declineConnection", "remove"]);
  assert.deepEqual(by("Cy").actions, ["connect", "removeAdmin", "remove"]);
  assert.deepEqual([by("Rae").connection, by("Rae").actions], [null, ["approve", "decline"]]);
});

test("the owner's row comes first under Going: Hosting, the connection actions, never a host action", () => {
  const input = {
    state: "open" as const,
    guests: [guest("g1", "Marta", "accepted"), guest("m1", "Sol", "maybe")],
    invited: [],
    requests: [],
    admins: [],
    owner: { userId: "own", name: "Ana" },
  };
  // A guest connects with the host from here (CO-P2). The title counts the rows shown, the owner's included.
  const asGuest = peopleGroups({ ...input, role: "guest", userId: "m1", connections: { own: "none", g1: "connected" } });
  assert.deepEqual(asGuest.map((g) => g.title), ["Going · 2", "Maybe · 1"]);
  assert.deepEqual(asGuest[0].rows[0], {
    key: "owner:own", name: "Ana", status: null, reply: "Hosting", admin: false, kind: "owner", userId: "own",
    connection: "none", me: false, actions: ["connect"], depth: 0, broughtByName: null, broughtByMe: false,
  });
  assert.deepEqual(asGuest[0].rows.map((r) => r.name), ["Ana", "Marta"]);
  // The owner's own list: their row, with no dots.
  const own = peopleGroups({ ...input, role: "owner", userId: "own", connections: { g1: "none", m1: "none" } });
  assert.deepEqual(own.map((g) => g.title), ["Going · 2", "Maybe · 1"]);
  assert.deepEqual([own[0].rows[0].kind, own[0].rows[0].me, own[0].rows[0].connection, own[0].rows[0].actions], ["owner", true, null, []]);
  assert.deepEqual(own[0].rows[1].actions, ["connect", "makeAdmin", "remove"]);
  // Nobody removes the owner: an admin has only the connection actions on that row, after the end as before it.
  for (const state of ["open", "ended"] as const) {
    const admin = peopleGroups({ ...input, state, role: "admin", admins: ["g1"], userId: "g1", connections: { own: "requested_by_them" } });
    assert.deepEqual(admin[0].rows[0].actions, ["acceptConnection", "declineConnection"], state);
  }
  // Nobody going yet: the owner's row still opens the list, counted, so a title never reads 0 over a row.
  const quiet = peopleGroups({ ...input, guests: [guest("m1", "Sol", "maybe")], role: "owner", userId: "own", connections: {} });
  assert.deepEqual(quiet.map((g) => [g.title, g.rows.map((r) => r.name)]), [["Going · 1", ["Ana"]], ["Maybe · 1", ["Sol"]]]);
  // The states unknown: the owner's row shows, with nothing to do.
  const unknown = peopleGroups({ ...input, role: "guest", userId: "m1", connections: null as Record<string, ConnectionState> | null });
  assert.deepEqual([unknown[0].rows[0].connection, unknown[0].rows[0].actions], [null, []]);
});

test("EVENT_COPY pins the page, sheet and list words", () => {
  assert.deepEqual(
    [
      "People", "Actions for ", "Make admin", "Remove as admin", "Remove from this resbite", "Send again on WhatsApp",
      "Send again on Messages", "Remove", "Approve", "Decline", "Admin", "Invite", "Edit", "More", "Change",
      "Do this again", "Add to calendar", "Mute this resbite", "Unmute this resbite", "Change my reply",
      "Cancel resbite", "Your answer", "Your resbite is cancelled.", "Or share the event link", "Update calendar", "Cancelled", "Back", "Loading this resbite",
      "Opening your resbite…", "This resbite isn’t available.", "Try again", "Refresh invitation", "Retry my response",
      "Changes saved", "Preview changes saved", "Couldn’t open Maps.", "Open Fixture café in Maps",
      "Invitations are disabled in design preview. Real invitations need an approved tester account.", "Preview plan cancelled.",
      "This resbite couldn’t be opened. Check your connection and try again.", "Your response is saved.",
      "Your answer is saved, but who’s coming couldn’t load. Refresh to try again.",
      "The plan or your response changed. Review the latest details before choosing again.",
      "This resbite is cancelled or has ended. Answers are closed.",
      "Your response is not confirmed. Retry checks the saved response before trying the same choice again.",
      "We could not confirm your response. Check your connection, then retry.", "Could not cancel. Refresh and try again.",
      "Could not change the mute. Check your connection and try again.", "Only someone invited to this resbite can mute it.",
      "Could not change admins. Check your connection and try again.", "Only someone who uses the app can be an admin.",
      "Only someone who’s going can be an admin.", "Only the organizer can change admins.", "Hosting",
    ],
    [
      EVENT_COPY.people, EVENT_COPY.actionsFor, EVENT_COPY.makeAdmin, EVENT_COPY.removeAdmin, EVENT_COPY.removeFromResbite,
      EVENT_COPY.sendAgainWhatsApp, EVENT_COPY.sendAgainMessages, EVENT_COPY.remove, EVENT_COPY.approve, EVENT_COPY.decline,
      EVENT_COPY.adminBadge, EVENT_COPY.invite, EVENT_COPY.edit, EVENT_COPY.moreButton, EVENT_COPY.change,
      EVENT_COPY.doThisAgain, EVENT_COPY.addToCalendar, EVENT_COPY.mute, EVENT_COPY.unmute, EVENT_COPY.changeMyReply,
      EVENT_COPY.cancelResbite, EVENT_COPY.yourAnswer, EVENT_COPY.cancelled, EVENT_COPY.shareLink, EVENT_COPY.updateCalendar, EVENT_COPY.cancelledChip, EVENT_COPY.back, EVENT_COPY.loading,
      EVENT_COPY.opening, EVENT_COPY.unavailable, EVENT_COPY.tryAgain, EVENT_COPY.refreshInvitation, EVENT_COPY.retryResponse,
      EVENT_COPY.changesSaved, EVENT_COPY.previewChangesSaved, EVENT_COPY.mapsFailed, EVENT_COPY.openInMaps(" Fixture café "),
      EVENT_COPY.invitePreview, EVENT_COPY.previewCancelled,
      EVENT_COPY.readFailed, EVENT_COPY.responseSaved,
      EVENT_COPY.guestsFailed,
      EVENT_COPY.responseReview,
      EVENT_COPY.responsesClosed,
      EVENT_COPY.responseUnconfirmed,
      EVENT_COPY.responseOffline, EVENT_COPY.cancelFailed,
      EVENT_COPY.muteFailed, EVENT_COPY.muteNotInvited,
      EVENT_COPY.adminsFailed, EVENT_COPY.adminNeedsApp,
      EVENT_COPY.adminNotGoing, EVENT_COPY.adminsOwnerOnly, EVENT_COPY.hostingBadge,
    ],
  );
});

test("showsNames: hosts always, guests once they have answered", () => {
  assert.equal(showsNames("owner", null), true);
  assert.equal(showsNames("admin", "pending"), true);
  assert.equal(showsNames("guest", null), false);
  assert.equal(showsNames("guest", "pending"), false);
  for (const r of ["accepted", "maybe", "declined", "withdrawn"]) assert.equal(showsNames("guest", r), true);
});

test("stateChip: Cancelled, Ended or none", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const plan = { status: "active", starts_at: "2026-10-31T18:00:00Z", ends_at: null };
  assert.equal(stateChip(plan, now), null);
  assert.equal(stateChip({ ...plan, starts_at: "2026-10-01T18:00:00Z" }, now), "Ended");
  assert.equal(stateChip({ ...plan, status: "cancelled" }, now), "Cancelled");
  assert.equal(stateChip({ ...plan, status: "cancelled", starts_at: "2026-10-01T18:00:00Z" }, now), "Cancelled");
});

const allowance = (allowed: number, used: number, mayBring = true) => ({
  allowed,
  used,
  remaining: Math.max(allowed - used, 0),
  level: 1,
  mayBring,
});
const bring = (over: Partial<Parameters<typeof bringRow>[0]> = {}) =>
  bringRow({ role: "guest", state: "open", response: "accepted", allowance: allowance(1, 0), broughtNames: [], host: "Ana", ...over });

test("bringRow: only a Going or Maybe guest on an open resbite whose allowance lets them bring (CO-05)", () => {
  assert.equal(bring({ role: "owner" }), null);
  assert.equal(bring({ role: "admin" }), null);
  assert.equal(bring({ response: "pending" }), null);
  assert.equal(bring({ response: null }), null);
  assert.equal(bring({ response: "declined" }), null);
  assert.equal(bring({ response: "withdrawn" }), null);
  assert.equal(bring({ state: "ended" }), null);
  assert.equal(bring({ state: "cancelled" }), null);
  // Nobody, or past the last level: the server says may_bring false.
  assert.equal(bring({ allowance: allowance(1, 0, false) }), null);
  assert.equal(bring({ allowance: allowance(0, 0, false) }), null);
  // Not read (a failed read, or not asked for).
  assert.equal(bring({ allowance: null }), null);
});

test("bringRow: the hint while invites are left, first and then 'more'", () => {
  assert.deepEqual(bring(), { kind: "bring", hint: "Ana trusts you to bring 1 person. They’re in, no approval needed." });
  assert.deepEqual(bring({ response: "maybe" }), { kind: "bring", hint: "Ana trusts you to bring 1 person. They’re in, no approval needed." });
  assert.deepEqual(bring({ allowance: allowance(2, 0) }), { kind: "bring", hint: "Ana trusts you to bring 2 people. They’re in, no approval needed." });
  assert.deepEqual(bring({ allowance: allowance(2, 1), broughtNames: ["Clara"] }), {
    kind: "bring",
    hint: "Ana trusts you to bring 1 more person. They’re in, no approval needed.",
  });
  assert.deepEqual(bring({ allowance: allowance(3, 1) }), { kind: "bring", hint: "Ana trusts you to bring 2 more people. They’re in, no approval needed." });
});

test("bringRow: every invite used reads who was brought, with no chevron; with no names, nothing", () => {
  // One link, no guest row yet.
  assert.deepEqual(bring({ allowance: allowance(1, 1), broughtNames: ["Clara"] }), { kind: "brought", text: "You brought Clara" });
  assert.deepEqual(bring({ allowance: allowance(2, 2), broughtNames: ["Clara", "Martín"] }), { kind: "brought", text: "You brought Clara and Martín" });
  assert.equal(bring({ allowance: allowance(1, 1), broughtNames: [] }), null);
  // The host lowered the circle below what was used: remaining 0.
  assert.deepEqual(bring({ allowance: allowance(1, 2), broughtNames: ["Clara", "Martín"] }), { kind: "brought", text: "You brought Clara and Martín" });
  assert.equal(bring({ allowance: allowance(1, 1, false), broughtNames: ["Clara"] }), null);
});

test("broughtNames: the bringer's own brought guests still in, by first name, then their own unanswered links", () => {
  const guests = [
    guest("pedro", "Pedro Pérez", "accepted"),
    guest("clara", "Clara Gómez", "accepted", "pedro", 2),
    guest("martin", "Martín Ruiz", "pending", "pedro", 2),
    guest("sol", "Sol Díaz", "maybe", "pedro", 2),
    guest("leo", "Leo Paz", "declined", "pedro", 2),
    guest("ines", "Inés Vega", "withdrawn", "pedro", 2),
    guest("marta", "Marta M", "accepted", "ana", 2),
  ];
  const links = [linkPerson("7700900111", "Juli Fernández"), linkPerson("7700900222", "+44 7700 900222")];
  assert.deepEqual(broughtNames({ guests, invited: links, userId: "pedro" }), ["Clara", "Martín", "Sol", "Juli Fernández", "+44 7700 900222"]);
  assert.deepEqual(broughtNames({ guests, invited: [], userId: "marta" }), []);
  assert.deepEqual(broughtNames({ guests: [], invited: [], userId: null }), []);
});

test("readsOwnLinks: a guest's own links are read only when the circle lets guests bring, or they are known to have brought someone", () => {
  const guests = [
    guest("pedro", "Pedro Pérez", "accepted"),
    guest("clara", "Clara Gómez", "declined", "pedro", 2),
    guest("marta", "Marta M", "accepted", "ana", 2),
  ];
  // The circle lets guests bring: read, whoever they brought.
  assert.equal(readsOwnLinks({ invites: 1, userId: "marta", guests: [], known: false }), true);
  // Nobody, and nothing says they brought anyone: no read (most resbites).
  assert.equal(readsOwnLinks({ invites: 0, userId: "marta", guests, known: false }), false);
  // Nobody now, but someone they brought is on the list, whatever their answer...
  assert.equal(readsOwnLinks({ invites: 0, userId: "pedro", guests, known: false }), true);
  // ...or a link of theirs is known: the last read found one, or this phone keeps its code.
  assert.equal(readsOwnLinks({ invites: 0, userId: "marta", guests: [], known: true }), true);
  // No account: nothing to read.
  assert.equal(readsOwnLinks({ invites: 2, userId: null, guests, known: true }), false);
});

test("useEvent reads a guest's own links only when readsOwnLinks says so, counting this phone's codes as known", () => {
  const src = readFileSync(new URL("../state/useEvent.ts", import.meta.url), "utf8");
  assert.match(src, /if \(answered\)\s*void readOwnLinks\(next, planId, userId, linksFound\.current\)\.then\(/);
  assert.match(src, /readsOwnLinks\(\{ invites: circleOf\(next\.plan\)\.invites, userId, guests: next\.guests, known \}\)/);
  assert.match(src, /const known = found \|\| Object\.keys\(stored\)\.length > 0;/);
  // A read that found links keeps them known for the next load, until one finds none.
  assert.match(src, /linksFound\.current = links\.length > 0;/);
  // The guest's path is the only one gated: the hosts' list is read as before.
  assert.equal(src.match(/void readInvited\(/g), null);
});

test("readGuests: who brought a guest and their level, read as nobody's and 1 when the row lacks them", () => {
  assert.deepEqual(broughtFrom({ brought_by: "pedro", level: 2 }), { broughtById: "pedro", level: 2 });
  // A browser stub or an old cache: no columns.
  assert.deepEqual(broughtFrom({}), { broughtById: null, level: 1 });
  assert.deepEqual(broughtFrom({ brought_by: null, level: null }), { broughtById: null, level: 1 });
  for (const odd of ["2", 0, -1, 1.5, Number.NaN]) assert.equal(broughtFrom({ level: odd }).level, 1);
  // Clamped to the levels a circle has (1–4: a host's guest, then up to three hops).
  assert.equal(broughtFrom({ level: 4 }).level, 4);
  assert.equal(broughtFrom({ level: 5 }).level, 4);
  assert.equal(broughtFrom({ level: 70 }).level, 4);
  for (const odd of ["", 7, {}]) assert.equal(broughtFrom({ brought_by: odd }).broughtById, null);
  const source = readFileSync(new URL("../services/rsvp.ts", import.meta.url), "utf8");
  const read = source.slice(source.indexOf("export async function readGuests("));
  assert.match(read, /\.select\("user_id,response,brought_by,level,profiles\(display_name\)"\)/);
  assert.match(read, /\.\.\.broughtFrom\(row\)/);
  assert.match(source, /export type Guest = \{[^}]*broughtById: string \| null;[^}]*level: number;[^}]*\}/);
});

// The chain on the people list (CO-07, CO-P11, rule 10, rule 11).
/** Fixture people by id, named once (C6): `g("martin")` is Martín, Going, brought by nobody, level 1. */
const NAMES: Record<string, string> = {
  owner: "Owner", ana: "Ana", pedro: "Pedro", clara: "Clara", martin: "Martín", marta: "Marta", sol: "Sol", leo: "Leo",
  nico: "Nico", pat: "Pat", ines: "Inés", bo: "Bo", cy: "Cy", di: "Di", eve: "Eve", sofia: "Sofía",
};
const g = (id: string, over: Partial<ReturnType<typeof guest>> = {}) => ({ ...guest(id, NAMES[id] ?? id, "accepted"), ...over });
const base: Parameters<typeof peopleGroups>[0] = {
  role: "owner",
  state: "open",
  guests: [],
  invited: [],
  requests: [],
  admins: [],
  owner: null,
  userId: "owner",
  connections: null,
  bringerNames: {},
  broughtLinks: [],
};
const group = (groups: ReturnType<typeof peopleGroups>, title: string) => groups.find((x) => x.title.startsWith(title))!.rows;
const chain = (rows: PersonRow[]) => rows.map((r) => [r.name, r.depth, r.status]);

test("brought people sit under their bringer, one step in per hop", () => {
  const guests = [g("ana"), g("pedro"), g("clara", { broughtById: "pedro", level: 2 }), g("martin", { broughtById: "clara", level: 3 }), g("marta")];
  const rows = peopleGroups({ ...base, owner: { userId: "owner", name: "Owner" }, guests, bringerNames: { pedro: "Pedro", clara: "Clara" } }).find((x) => x.title.startsWith("Going"))!.rows;
  assert.deepEqual(rows.map((r) => [r.name, r.depth, r.status]), [["Owner", 0, null], ["Ana", 0, null], ["Pedro", 0, null], ["Clara", 1, "Brought by Pedro"], ["Martín", 2, "Brought by Clara"], ["Marta", 0, null]]);
  assert.deepEqual(rows.map((r) => r.broughtByName), [null, null, null, "Pedro", "Clara", null]);
});

test("a brought person sits right after their bringer whatever order the rows came in, siblings in their own order", () => {
  // Clara's row came first; Pedro brought Clara and Sol, and Clara brought Martín.
  const guests = [
    g("clara", { broughtById: "pedro", level: 2 }), g("ana"), g("martin", { broughtById: "clara", level: 3 }), g("pedro"),
    g("sol", { broughtById: "pedro", level: 2 }),
  ];
  const rows = group(peopleGroups({ ...base, guests, bringerNames: { pedro: "Pedro", clara: "Clara" } }), "Going");
  assert.deepEqual(chain(rows), [
    ["Ana", 0, null], ["Pedro", 0, null], ["Clara", 1, "Brought by Pedro"], ["Martín", 2, "Brought by Clara"], ["Sol", 1, "Brought by Pedro"],
  ]);
  // The title counts every row shown, the owner's included.
  const titled = peopleGroups({ ...base, owner: { userId: "owner", name: "Owner" }, guests, bringerNames: { pedro: "Pedro" } });
  assert.equal(titled[0].title, "Going · 6");
});

test("removing the bringer moves the brought up and keeps the words", () => {
  // Pedro was removed: his row is gone, his name is still known (plan_bringers names him whether or not he is on it).
  const guests = [g("ana"), g("clara", { broughtById: "pedro", level: 2 }), g("martin", { broughtById: "clara", level: 3 }), g("marta")];
  const rows = group(peopleGroups({ ...base, owner: { userId: "owner", name: "Owner" }, guests, bringerNames: { pedro: "Pedro", clara: "Clara" } }), "Going");
  assert.deepEqual(chain(rows), [["Owner", 0, null], ["Ana", 0, null], ["Clara", 0, "Brought by Pedro"], ["Martín", 1, "Brought by Clara"], ["Marta", 0, null]]);
  // The level stays the server's: only the display moves up.
  assert.equal(guests[1].level, 2);
  // A bringer in another group: Clara stays in Going, unindented, still "Brought by Pedro"; Pedro is under Maybe.
  const split = peopleGroups({ ...base, guests: [g("pedro", { response: "maybe" }), g("clara", { broughtById: "pedro", level: 2 })], bringerNames: { pedro: "Pedro" } });
  assert.deepEqual(chain(group(split, "Going")), [["Clara", 0, "Brought by Pedro"]]);
  assert.deepEqual(chain(group(split, "Maybe")), [["Pedro", 0, null]]);
});

test("a bringer whose account was deleted leaves no words", () => {
  // Rule 10: plan_bringers leaves out an account being deleted, so Pedro has no name; the nesting by id stays.
  const guests = [g("pedro"), g("clara", { broughtById: "pedro", level: 2 }), g("martin", { broughtById: "clara", level: 3 }), g("pat", { response: "pending", broughtById: "pedro", level: 2 })];
  const groups = peopleGroups({ ...base, guests, bringerNames: { clara: "Clara" } });
  const going = group(groups, "Going");
  assert.deepEqual(chain(going), [["Pedro", 0, null], ["Clara", 1, null], ["Martín", 2, "Brought by Clara"]]);
  assert.equal(going[1].broughtByName, null);
  assert.equal(sheetHead(going[1]), "Going");
  assert.equal(personLabel(going[1]), "Clara");
  // Unanswered: today's words alone.
  const pat = group(groups, "Invited")[0];
  assert.deepEqual([pat.name, pat.status, pat.broughtByName, personLabel(pat)], ["Pat", "Invited in the app", null, "Pat, Invited in the app"]);
  // A deleted account's brought_by is empty: nobody's, no words, no nesting.
  const gone = peopleGroups({ ...base, guests: [g("clara")], bringerNames: {} });
  assert.deepEqual(chain(group(gone, "Going")), [["Clara", 0, null]]);
  // A blank first name is no name either.
  const blank = peopleGroups({ ...base, guests: [g("pedro"), g("clara", { broughtById: "pedro", level: 2 })], bringerNames: { pedro: "  " } });
  assert.deepEqual(chain(group(blank, "Going")), [["Pedro", 0, null], ["Clara", 1, null]]);
});

test("depth stops at 3, and a loop in the data still shows everyone once", () => {
  const guests = [
    g("ana"), g("bo", { broughtById: "ana", level: 2 }), g("cy", { broughtById: "bo", level: 3 }), g("di", { broughtById: "cy", level: 4 }),
    g("eve", { broughtById: "di", level: 4 }),
  ];
  assert.deepEqual(group(peopleGroups({ ...base, guests }), "Going").map((r) => [r.name, r.depth]), [["Ana", 0], ["Bo", 1], ["Cy", 2], ["Di", 3], ["Eve", 3]]);
  // Two rows naming each other (not something the server writes): both show, once each, the loop's first row at 0.
  const loop = [g("ana", { broughtById: "bo", level: 2 }), g("bo", { broughtById: "ana", level: 2 }), g("cy")];
  assert.deepEqual(group(peopleGroups({ ...base, guests: loop }), "Going").map((r) => [r.name, r.depth]), [["Cy", 0], ["Ana", 0], ["Bo", 1]]);
});

test("a bringer sees their own unanswered links and in-app invitees", () => {
  const input = {
    ...base,
    role: "guest" as const,
    userId: "pedro",
    owner: { userId: "owner", name: "Owner" },
    guests: [
      g("pedro"),
      g("clara", { response: "pending", broughtById: "pedro", level: 2 }),
      // The host's own invitee, and someone Marta brought: hidden from guests until they answer (UX2-D6).
      g("sol", { response: "pending" }),
      g("nico", { response: "pending", broughtById: "marta", level: 2 }),
      g("marta"),
      // An admin the roll carried, brought by Pedro: a host, whom the server never lets Pedro withdraw (C18-I1).
      g("leo", { response: "pending", broughtById: "pedro", level: 2 }),
    ],
    admins: ["leo"],
    // The server lists only the links Pedro sent; Juli's code is on this phone, Inés's is not.
    invited: [linkPerson("111", "Juli", "whatsapp"), linkPerson("222", "Inés")],
    bringerNames: { pedro: "Pedro", marta: "Marta" },
  };
  const groups = peopleGroups(input);
  assert.deepEqual(groups.map((x) => x.title), ["Going · 3", "Invited, not answered yet · 4"]);
  const invited = group(groups, "Invited");
  assert.deepEqual(invited.map((r) => [r.name, r.status, r.actions, r.depth]), [
    ["Juli", "Invited by WhatsApp · brought by you", ["sendAgain", "removeInvite"], 0],
    ["Inés", "Invited by link · brought by you", ["removeInvite"], 0],
    ["Clara", "Invited in the app · brought by you", ["removeInvite"], 0],
    ["Leo", "Invited in the app · brought by you", [], 0],
  ]);
  assert.deepEqual([invited[2].kind, invited[2].userId, invited[2].broughtByName], ["appInvite", "clara", "Pedro"]);
  assert.deepEqual(invited.map((r) => r.broughtByMe), [true, true, true, true]);
  assert.equal(invited[3].admin, true);
  // Every other pending row stays hidden from guests.
  assert.equal(groups.flatMap((x) => x.rows).some((r) => r.name === "Sol" || r.name === "Nico"), false);
  // Their own connection actions come first on an in-app invitee, as anywhere else; a pending row can't be asked.
  const connected = group(peopleGroups({ ...input, connections: { clara: "requested_by_them", owner: "connected" } }), "Invited");
  assert.deepEqual(connected[2].actions, ["acceptConnection", "declineConnection", "removeInvite"]);
  // After the end, or once cancelled: the same rows, nothing to do.
  for (const state of ["ended", "cancelled"] as const)
    assert.deepEqual(group(peopleGroups({ ...input, state }), "Invited").map((r) => r.actions), [[], [], [], []], state);
  // Marta sees only Nico, whom she brought; Pedro's stay hidden from her.
  assert.deepEqual(group(peopleGroups({ ...input, userId: "marta", invited: [] }), "Invited").map((r) => [r.name, r.status]), [
    ["Nico", "Invited in the app · brought by you"],
  ]);
  // A guest who brought nobody has no Invited group.
  assert.deepEqual(peopleGroups({ ...input, userId: "ana", invited: [] }).map((x) => x.title), ["Going · 3"]);
});

test("a host sees a bringer's link by its last digits", () => {
  const input = {
    ...base,
    guests: [g("pedro"), g("sol"), g("pat", { response: "pending", broughtById: "pedro", level: 2 })],
    invited: [linkPerson("111", "Dan", "whatsapp")],
    broughtLinks: [
      { id: "inv-1", ending: "23", country: "44", broughtByName: "Sol" },
      { id: "inv-2", ending: "07", country: "54", broughtByName: null },
    ],
    bringerNames: { pedro: "Pedro" },
  };
  const groups = peopleGroups(input);
  assert.deepEqual(groups.map((x) => x.title), ["Going · 2", "Invited, not answered yet · 4"]);
  const invited = group(groups, "Invited");
  assert.deepEqual(invited.map((r) => r.name), ["Dan", "Number ending ••23", "Number ending ••07", "Pat"]);
  assert.deepEqual(invited[1], {
    key: "brought:inv-1", name: "Number ending ••23", status: "Invited by link · brought by Sol", reply: null, admin: false,
    kind: "linkInvite", invitationId: "inv-1", connection: null, me: false, actions: ["removeInvite"], depth: 0, broughtByName: "Sol",
    broughtByMe: false,
  });
  // No Send again: the host has no code for it. No name to show for a bringer who has none.
  assert.deepEqual([invited[2].status, invited[2].invitationId, invited[2].actions, invited[2].broughtByName], ["Invited by link", "inv-2", ["removeInvite"], null]);
  // An app invitee someone brought.
  assert.deepEqual([invited[3].status, invited[3].actions, invited[3].broughtByName], ["Invited in the app · brought by Pedro", ["remove"], "Pedro"]);
  // The host's own link is nobody's.
  assert.deepEqual([invited[0].status, invited[0].broughtByName, invited[0].invitationId], ["Invited by WhatsApp", null, undefined]);
  // An admin removes them too; after the end nobody does.
  assert.deepEqual(group(peopleGroups({ ...input, role: "admin", userId: "leo" }), "Invited")[1].actions, ["removeInvite"]);
  assert.deepEqual(group(peopleGroups({ ...input, state: "ended" }), "Invited").map((r) => r.actions), [[], [], [], []]);
  // A guest never gets them, whatever is passed.
  assert.equal(peopleGroups({ ...input, role: "guest", userId: "sol", invited: [] }).flatMap((x) => x.rows).some((r) => r.invitationId), false);
});

test("on a rolled occurrence, a brought person waiting to answer sits under their bringer among the unanswered too", () => {
  const groups = peopleGroups({
    ...base,
    guests: [g("pedro", { response: "pending" }), g("ana", { response: "pending" }), g("clara", { response: "pending", broughtById: "pedro", level: 2 })],
    bringerNames: { pedro: "Pedro" },
  });
  assert.deepEqual(chain(group(groups, "Invited")), [
    ["Pedro", 0, "Invited in the app"], ["Clara", 1, "Invited in the app · brought by Pedro"], ["Ana", 0, "Invited in the app"],
  ]);
});

test("the sheet head says the answer and who brought them", () => {
  const groups = peopleGroups({
    ...base,
    owner: { userId: "owner", name: "Owner" },
    guests: [
      g("pedro"), g("clara", { broughtById: "pedro", level: 2 }), g("sol", { response: "maybe", broughtById: "pedro", level: 2 }),
      g("leo", { response: "declined", broughtById: "pedro", level: 2 }), g("ana", { broughtById: "gone", level: 2 }),
      g("pat", { response: "pending", broughtById: "pedro", level: 2 }),
    ],
    requests: [request("rae", "Rae")],
    bringerNames: { pedro: "Pedro" },
  });
  const rows = groups.flatMap((x) => x.rows);
  const by = (name: string) => rows.find((r) => r.name === name)!;
  assert.equal(sheetHead(by("Clara")), "Going · brought by Pedro");
  assert.equal(sheetHead(by("Sol")), "Maybe · brought by Pedro");
  assert.equal(sheetHead(by("Leo")), "Can’t go · brought by Pedro");
  // Otherwise, as before: the answer, or how they were invited.
  assert.equal(sheetHead(by("Pedro")), "Going");
  assert.equal(sheetHead(by("Owner")), "Hosting");
  assert.equal(sheetHead(by("Ana")), "Going");
  assert.equal(sheetHead(by("Pat")), "Invited in the app · brought by Pedro");
  assert.equal(sheetHead(by("Rae")), "Asked through the link");
});

test("EVENT_COPY's chain words (CO-07)", () => {
  assert.equal(EVENT_COPY.broughtBy("Pedro"), "Brought by Pedro");
  assert.equal(EVENT_COPY.broughtByJoined("Pedro"), "brought by Pedro");
  assert.equal(EVENT_COPY.broughtByYou, "brought by you");
  assert.equal(EVENT_COPY.broughtLabel("Clara", "Pedro"), "Clara, brought by Pedro");
  assert.equal(EVENT_COPY.numberEnding("23"), "Number ending ••23");
});

test("a brought row is labelled 'Clara, brought by Pedro', its other words after (rule 11)", () => {
  const groups = peopleGroups({
    ...base,
    owner: { userId: "owner", name: "Owner" },
    guests: [
      g("pedro"), g("clara", { broughtById: "pedro", level: 2 }), g("marta", { broughtById: "pedro", level: 2 }),
      g("ana", { broughtById: "gone", level: 2 }), g("pat", { response: "pending", broughtById: "pedro", level: 2 }),
    ],
    admins: ["marta"],
    invited: [linkPerson("111", "Dan", "whatsapp")],
    broughtLinks: [{ id: "inv-1", ending: "23", country: "44", broughtByName: "Sol" }],
    bringerNames: { pedro: "Pedro" },
    connections: { marta: "connected" },
  });
  const rows = groups.flatMap((x) => x.rows);
  const by = (name: string) => rows.find((r) => r.name === name)!;
  assert.equal(personLabel(by("Clara")), "Clara, brought by Pedro");
  assert.equal(personLabel(by("Marta")), "Marta, brought by Pedro, Admin, Connected");
  assert.equal(personLabel(by("Pat")), "Pat, brought by Pedro, Invited in the app");
  assert.equal(personLabel(by("Number ending ••23")), "Number ending 23, brought by Sol, Invited by link");
  // No bringer, or none named: today's label.
  assert.equal(personLabel(by("Owner")), "Owner, Hosting");
  assert.equal(personLabel(by("Pedro")), "Pedro");
  assert.equal(personLabel(by("Ana")), "Ana");
  assert.equal(personLabel(by("Dan")), "Dan, Invited by WhatsApp");
  // The bringer's own rows say it in words already.
  const own = peopleGroups({ ...base, role: "guest", userId: "pedro", guests: [g("pedro"), g("clara", { response: "pending", broughtById: "pedro", level: 2 })], invited: [linkPerson("111", "Juli", "whatsapp")], bringerNames: { pedro: "Pedro" } });
  assert.deepEqual(group(own, "Invited").map(personLabel), ["Juli, brought by you, Invited by WhatsApp", "Clara, brought by you, Invited in the app"]);
});

test("Remove goes three ways: a guest's link by its id, a bringer's in-app invitee withdrawn, a link by its number", () => {
  const groups = (role: "owner" | "guest", userId: string) =>
    peopleGroups({
      ...base,
      role,
      userId,
      guests: [g("pedro"), g("ana"), g("clara", { response: "pending", broughtById: "pedro", level: 2 })],
      invited: [linkPerson("111", "Dan", "whatsapp")],
      broughtLinks: role === "owner" ? [{ id: "inv-1", ending: "23", country: "44", broughtByName: "Sol" }] : [],
      bringerNames: { pedro: "Pedro" },
    }).flatMap((x) => x.rows);
  const host = groups("owner", "owner");
  const at = (rows: PersonRow[], name: string) => rows.find((r) => r.name === name)!;
  assert.equal(removalOf(at(host, "Number ending ••23"), true), "brought");
  assert.equal(removalOf(at(host, "Dan"), true), "link");
  assert.equal(removalOf(at(host, "Clara"), true), "guest");
  assert.equal(removalOf(at(host, "Ana"), true), "guest");
  const bringer = groups("guest", "pedro");
  assert.equal(removalOf(at(bringer, "Clara"), false), "withdraw");
  assert.equal(removalOf(at(bringer, "Dan"), false), "link");
});

test("peopleCounts: a host's 'N invited' counts the links their guests sent too", () => {
  const links = [
    { id: "inv-1", ending: "23", country: "44", broughtByName: "Sol" },
    { id: "inv-2", ending: "07", country: "54", broughtByName: null },
  ];
  const counts = peopleCounts({ guests: [guest("p", "P", "pending"), guest("a", "A", "accepted")], invited: [linkPerson("1", "X")], requests: [], broughtLinks: links });
  assert.deepEqual(counts, { going: 1, maybe: 0, cantGo: 0, invited: 4, waiting: 0 });
  assert.equal(peopleRowText(counts, true), "Going 1 · Can’t go 0 · 4 invited");
  // None given, or none sent: as before.
  assert.equal(peopleCounts({ guests: [], invited: [linkPerson("1", "X")], requests: [] }).invited, 1);
  assert.equal(peopleCounts({ guests: [], invited: [], requests: [], broughtLinks: [] }).invited, 0);
});

test("the resbite page and the people list pass the chain's reads through", () => {
  const page = readFileSync(new URL("../../app/event.tsx", import.meta.url), "utf8");
  assert.match(page, /peopleCounts\(\{ guests, invited, requests, counts: serverCounts, broughtLinks: event\.broughtLinks \}\)/);
  const list = readFileSync(new URL("../../app/guests.tsx", import.meta.url), "utf8");
  // Task 4's carry: the organizer's first name or null, never "Your host".
  assert.match(list, /useResend\(plan, event\.load, role === "guest" \? \{ organizer: firstName\(event\.organizer\) \|\| null \} : undefined\)/);
  assert.match(list, /bringerNames: event\.bringerNames,/);
  assert.match(list, /broughtLinks: event\.broughtLinks,/);
  assert.match(list, /sheetHead\(current\)/);
  assert.match(list, /personLabel\(row\)/);
  assert.match(list, /circleOf\(plan\)/);
  assert.match(list, /CIRCLE_COPY\.listLine\(/);
  const remove = list.slice(list.indexOf("const confirmRemove"), list.indexOf("const confirmDecline"));
  assert.match(remove, /case "brought":\s*await takingBack\(\(\) => circleGateway\.revokeBrought\(plan\.id, row\.invitationId!\), reload\);/);
  assert.match(remove, /case "withdraw":\s*await takingBack\(\(\) => circleGateway\.withdraw\(plan\.id, row\.userId!\), reload\);/);
  assert.match(remove, /contactInviteGateway\.revoke\(plan\.id, row\.phone!\)/);
  assert.match(remove, /removalOf\(row, host\)/);
});

test("useEvent reads the bringers' names for the people list only, where names show, and the guests' links for hosts only", () => {
  const src = readFileSync(new URL("../state/useEvent.ts", import.meta.url), "utf8");
  // Null until a read lands (C28): the list then takes a bringer's name from their own row.
  assert.match(src, /bringerNames: Record<string, string> \| null;/);
  assert.match(src, /broughtLinks: BroughtLink\[\];/);
  assert.match(src, /export function useEvent\(planId: string \| undefined, options: \{ chain\?: boolean \} = \{\}\): EventPage/);
  // Only the people list asks (C28 Q4), where names show; only the latest read sets them; a failure changes nothing.
  assert.match(src, /if \(named && chain\)\s*void circleGateway\.bringers\(planId\)\.then\(\s*\(names\) => \{\s*if \(valid\(\) && bringersTicket === bringersRead\.current\) setBringerNames\(names\);\s*\},\s*\(\) => \{\},\s*\);/);
  // Hosts only, read with their own links; a failure gives none.
  assert.match(src, /const \[people, links\] = host\s*\? await Promise\.all\(\[\s*readInvited\(planId, userId\)\.catch\(\(\): InvitedPerson\[\] => \[\]\),\s*circleGateway\.broughtLinks\(planId\)\.catch\(\(\): BroughtLink\[\] => \[\]\),\s*\]\)\s*: \[null, NO_LINKS\];/);
  // The organizer's name is kept only from a read still current (C28).
  const read = src.slice(src.indexOf("const next = await readEvent(planId, userId);"), src.indexOf("} catch (e) {"));
  const kept = read.indexOf("rememberName(userId, next.plan.owner_id, next.organizer);");
  assert.ok(kept > read.indexOf("if (valid()) {"), "rememberName under valid()");
  // A host's own brought links are theirs (C31): the list's `brought` reaches InvitedPerson.
  assert.match(src, /brought: r\.brought,/);
  const people = readFileSync(new URL("../../app/guests.tsx", import.meta.url), "utf8");
  assert.match(people, /useEvent\(planId, \{ chain: true \}\)/);
  const page = readFileSync(new URL("../../app/event.tsx", import.meta.url), "utf8");
  assert.match(page, /const event = useEvent\(planId\);/);
});

// Fix round 1 (C28, C31).
test("EVENT_COPY's fix-round words", () => {
  assert.equal(EVENT_COPY.broughtByYouAnswered, "Brought by you");
  assert.equal(EVENT_COPY.numberEndingSpoken("23"), "Number ending 23");
  assert.equal(EVENT_COPY.broughtStay, "People they brought stay invited.");
});

test("a bringer reads 'Brought by you' on the people they brought who answered, host or not (C28)", () => {
  const input = {
    ...base,
    role: "guest" as const,
    userId: "pedro",
    guests: [g("pedro"), g("clara", { broughtById: "pedro", level: 2 }), g("sol", { response: "maybe", broughtById: "pedro", level: 2 }), g("marta", { broughtById: "ana", level: 2 })],
    bringerNames: { pedro: "Pedro", ana: "Ana" },
  };
  const rows = peopleGroups(input).flatMap((x) => x.rows);
  const by = (name: string) => rows.find((r) => r.name === name)!;
  assert.deepEqual([by("Clara").status, by("Clara").broughtByMe, by("Clara").depth], ["Brought by you", true, 1]);
  assert.equal(sheetHead(by("Clara")), "Going · brought by you");
  assert.equal(sheetHead(by("Sol")), "Maybe · brought by you");
  assert.equal(personLabel(by("Clara")), "Clara, brought by you");
  // Someone else's reads as before.
  assert.deepEqual([by("Marta").status, by("Marta").broughtByMe, personLabel(by("Marta"))], ["Brought by Ana", false, "Marta, brought by Ana"]);
  assert.deepEqual([by("Pedro").status, by("Pedro").broughtByMe], [null, false]);
  // An admin who brought Clara before being made one reads the same.
  const admin = peopleGroups({ ...input, role: "admin", admins: ["pedro"] }).flatMap((x) => x.rows);
  assert.equal(admin.find((r) => r.name === "Clara")!.status, "Brought by you");
});

test("until the bringers' names land, a brought row takes its bringer's first name from the bringer's own row (C28)", () => {
  const guests = [
    g("pedro", { name: "Pedro Pérez" }), g("clara", { name: "Clara Gómez", broughtById: "pedro", level: 2 }),
    g("martin", { broughtById: "clara", level: 3 }), g("sol", { broughtById: "gone", level: 2 }),
    g("nico", { name: "Tester" }), g("bo", { broughtById: "nico", level: 2 }),
    g("pat", { response: "pending", broughtById: "pedro", level: 2 }),
  ];
  for (const bringerNames of [null, undefined]) {
    const rows = peopleGroups({ ...base, guests, bringerNames, unnamed: "Tester" }).flatMap((x) => x.rows);
    const by = (name: string) => rows.find((r) => r.name === name)!;
    assert.deepEqual([by("Clara Gómez").status, by("Clara Gómez").broughtByName], ["Brought by Pedro", "Pedro"]);
    assert.equal(by("Martín").status, "Brought by Clara");
    assert.equal(personLabel(by("Martín")), "Martín, brought by Clara");
    // A bringer not on the list, or with only the placeholder for a name: the indent without words.
    assert.equal(by("Sol").status, null);
    assert.deepEqual([by("Bo").status, by("Bo").depth], [null, 1]);
    assert.equal(by("Pat").status, "Invited in the app · brought by Pedro");
  }
  // Once read, the server's names decide: one it leaves out (an account being deleted) has no words (rule 10).
  const landed = peopleGroups({ ...base, guests, bringerNames: { clara: "Clara" }, unnamed: "Tester" }).flatMap((x) => x.rows);
  assert.equal(landed.find((r) => r.name === "Clara Gómez")!.status, null);
  assert.equal(landed.find((r) => r.name === "Martín")!.status, "Brought by Clara");
  // A guest's list takes names only from the rows it shows: a pending bringer is hidden from them (UX2-D6).
  const asGuest = peopleGroups({
    ...base,
    role: "guest",
    userId: "marta",
    guests: [g("marta"), g("pedro", { response: "pending" }), g("clara", { broughtById: "pedro", level: 2 })],
    bringerNames: null,
  }).flatMap((x) => x.rows);
  assert.equal(asGuest.find((r) => r.name === "Clara")!.status, null);
});

test("a host's own brought links and invitees are theirs: 'brought by you', Send again, and their own take-back (C31)", () => {
  const groups = peopleGroups({
    ...base,
    role: "admin",
    userId: "pedro",
    admins: ["pedro"],
    guests: [g("pedro"), g("sofia", { response: "pending", broughtById: "pedro", level: 2 }), g("pat", { response: "pending" })],
    // The host's list holds their own level-1 links and the links they brought (`brought`).
    invited: [linkPerson("101", "Dan", "whatsapp"), linkPerson("123", "Juli", "whatsapp", true, true), linkPerson("124", "+44 124", undefined, false, true)],
    broughtLinks: [{ id: "inv-9", ending: "45", country: "44", broughtByName: "Clara" }],
    bringerNames: { pedro: "Pedro" },
  });
  const rows = group(groups, "Invited");
  const by = (name: string) => rows.find((r) => r.name === name)!;
  assert.deepEqual([by("Dan").status, by("Dan").broughtByMe, by("Dan").actions], ["Invited by WhatsApp", false, ["sendAgain", "removeInvite"]]);
  assert.deepEqual([by("Juli").status, by("Juli").broughtByMe, by("Juli").actions], ["Invited by WhatsApp · brought by you", true, ["sendAgain", "removeInvite"]]);
  assert.deepEqual([by("+44 124").status, by("+44 124").actions], ["Invited by link · brought by you", ["removeInvite"]]);
  assert.equal(personLabel(by("Juli")), "Juli, brought by you, Invited by WhatsApp");
  assert.deepEqual([by("Sofía").status, by("Sofía").broughtByMe, by("Sofía").actions], ["Invited in the app · brought by you", true, ["remove"]]);
  assert.deepEqual([by("Pat").status, by("Pat").broughtByMe], ["Invited in the app", false]);
  // Remove: their own invitee is taken back (withdraw), their own link by its number; anyone else's as a host.
  assert.equal(removalOf(by("Sofía"), true), "withdraw");
  assert.equal(removalOf(by("Pat"), true), "guest");
  assert.equal(removalOf(by("Juli"), true), "link");
  assert.equal(removalOf(by("Number ending ••45"), true), "brought");
});

test("avatars take the first letter of a name, else a phone stands in", () => {
  const row = (name: string, invitationId?: string) => ({ name, invitationId });
  assert.equal(avatarLetter(row("Clara Gómez")), "C");
  assert.equal(avatarLetter(row("élise")), "É");
  // An emoji first: the first letter after it; none at all, no letter (never half a character).
  assert.equal(avatarLetter(row("🎲 Pedro")), "P");
  assert.equal(avatarLetter(row("👩🏽‍💻")), null);
  assert.equal(avatarLetter(row("+44 7700 900222")), null);
  assert.equal(avatarLetter(row("   ")), null);
  // A guest's link a host sees by its digits has no name to take a letter from.
  assert.equal(avatarLetter(row("Number ending ••23", "inv-1")), null);
});

test("a link a host sees by its digits is spoken without the bullets", () => {
  const groups = peopleGroups({ ...base, broughtLinks: [{ id: "inv-1", ending: "23", country: "44", broughtByName: "Sol" }, { id: "inv-2", ending: "07", country: "44", broughtByName: null }] });
  const [sol, none] = group(groups, "Invited");
  assert.equal(spokenName(sol), "Number ending 23");
  assert.equal(personLabel(sol), "Number ending 23, brought by Sol, Invited by link");
  assert.equal(personLabel(none), "Number ending 07, Invited by link");
  // Everyone else is spoken as written.
  assert.equal(spokenName(group(peopleGroups({ ...base, guests: [g("ana")] }), "Going")[0]), "Ana");
});

test("the remove question: a host removing someone who brought people says those people stay (C31 Q1)", () => {
  const input = {
    ...base,
    guests: [
      g("pedro"), g("clara", { broughtById: "pedro", level: 2 }), g("sol"),
      g("nico", { response: "pending" }), g("bo", { response: "pending", broughtById: "nico", level: 2 }), g("cy", { response: "pending" }),
    ],
    bringerNames: { pedro: "Pedro", nico: "Nico" },
  };
  const rows = peopleGroups(input).flatMap((x) => x.rows);
  const by = (name: string) => rows.find((r) => r.name === name)!;
  const ask = (name: string, host = true) => removeQuestion(by(name), { guests: input.guests, host, view: "remove" });
  assert.deepEqual(ask("Pedro"), {
    text: "Remove Pedro from this resbite? They can ask to join again with the event link, and you’ll decide. People they brought stay invited.",
    spoken: "Remove Pedro from this resbite? They can ask to join again with the event link, and you’ll decide. People they brought stay invited.",
  });
  assert.equal(ask("Sol").text, "Remove Sol from this resbite? They can ask to join again with the event link, and you’ll decide.");
  assert.equal(ask("Nico").text, "Remove the invitation for Nico? People they brought stay invited.");
  assert.equal(ask("Cy").text, "Remove the invitation for Cy?");
  // A guest taking back their own invitee: today's question.
  assert.equal(ask("Nico", false).text, "Remove the invitation for Nico?");
  // A link by its digits is spoken without the bullets; a decline is asked as before.
  const link = group(peopleGroups({ ...base, broughtLinks: [{ id: "inv-1", ending: "23", country: "44", broughtByName: "Sol" }] }), "Invited")[0];
  assert.deepEqual(removeQuestion(link, { guests: [], host: true, view: "remove" }), {
    text: "Remove the invitation for Number ending ••23?",
    spoken: "Remove the invitation for Number ending 23?",
  });
  const rae = group(peopleGroups({ ...base, requests: [request("rae", "Rae")] }), "Waiting")[0];
  assert.equal(removeQuestion(rae, { guests: [], host: true, view: "decline" }).text, "Decline Rae? They’ll see they weren’t added.");
});

test("after a remove, focus goes to the list's next row, else the one before", () => {
  const groups = peopleGroups({ ...base, owner: { userId: "owner", name: "Owner" }, guests: [g("ana"), g("sol", { response: "maybe" }), g("pat", { response: "pending" })] });
  assert.equal(focusAfterRemove(groups, "guest:ana"), "guest:sol");
  // Across groups, in the order shown.
  assert.equal(focusAfterRemove(groups, "guest:sol"), "app:pat");
  assert.equal(focusAfterRemove(groups, "app:pat"), "guest:sol");
  assert.equal(focusAfterRemove(peopleGroups({ ...base, guests: [g("ana")] }), "guest:ana"), null);
  assert.equal(focusAfterRemove(groups, "guest:nobody"), null);
});

test("an open sheet follows the list: the same person's row as it is now, or nothing once they are gone (C31 Q6)", () => {
  const guests = [g("pedro"), g("clara", { broughtById: "pedro", level: 2 })];
  const before = peopleGroups({ ...base, guests, bringerNames: {} });
  const held = rowByKey(before, "guest:clara")!;
  assert.equal(sheetHead(held), "Going");
  const after = peopleGroups({ ...base, guests, bringerNames: { pedro: "Pedro" } });
  assert.equal(sheetHead(rowByKey(after, held.key)!), "Going · brought by Pedro");
  assert.equal(rowByKey(peopleGroups({ ...base, guests: [g("pedro")] }), held.key), null);
});

test("the people list wires the fix round: take-backs reload when refused, focus moves, long names wrap (C28, C31)", () => {
  const list = readFileSync(new URL("../../app/guests.tsx", import.meta.url), "utf8");
  // Rows the viewer brought are taken back in a bringer's words; a refused take-back reads the list again (C28, C29).
  assert.match(list, /takingBack\(/);
  assert.match(list, /throw host && !row\.broughtByMe \? e : bringerRevokeError\(e\);/);
  // The sheet follows the list (Q6) and its question and the next row take focus (D4).
  assert.match(list, /rowByKey\(groups, sheet\.row\.key\)/);
  assert.match(list, /focusHeading\(question\.current\)/);
  assert.match(list, /focusAfterRemove\(groups, row\.key\)/);
  // The next row takes focus once the sheet has gone: its focus trap holds focus until then (web), and VoiceOver's
  // modal too (iOS). Android's Modal says nothing on closing, so there it moves when the sheet state clears.
  assert.match(list, /onDismissed=\{focusNextRow\}/);
  assert.match(list, /if \(Platform\.OS === "android" && !sheet\) focusNextRow\(\);/);
  const sheet = readFileSync(new URL("../design/GrabberSheet.tsx", import.meta.url), "utf8");
  assert.match(sheet, /onDismiss=\{onDismissed\}/);
  assert.match(list, /removeQuestion\(current, \{ guests, host, view: sheet\.view \}\)/);
  // Spoken names without bullets; the avatar's letter, else a phone.
  assert.match(list, /label=\{`\$\{EVENT_COPY\.actionsFor\}\$\{spokenName\(row\)\}`\}/);
  assert.match(list, /avatarLetter\(/);
  // A long name deep in the chain wraps beside the dots (D3).
  assert.match(list, /name: \{ flex: 1, minWidth: 0, gap: 1 \}/);
  assert.match(list, /nameText: \{[^}]*flexShrink: 1, minWidth: 0/);
  assert.match(list, /unnamed: UNNAMED_GUEST/);
});

// Task 8: the Chat row (CH-P14, CH-01, K-S13), from `chat_summary` as useEvent reads it.
const ME = "0a000000-0000-4000-8000-000000000001";
const LEO = "0a000000-0000-4000-8000-000000000002";
const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 7,
  kind: "message",
  audience: null,
  event: null,
  payload: null,
  body: "I can bring the snacks",
  state: "sent",
  authorId: LEO,
  createdAt: "2099-03-05T12:00:00Z",
  updatedAt: "2099-03-05T12:00:00Z",
  clientId: null,
  ...over,
});
const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  seriesId: "0b000000-0000-4000-8000-000000000001",
  planId: "0c000000-0000-4000-8000-000000000001",
  title: "Coffee evening",
  startsAt: "2099-03-05T15:00:00Z",
  endsAt: "2099-03-05T17:00:00Z",
  timeZone: "UTC",
  status: "active",
  repeatWeeks: null,
  isGroup: false,
  stopped: false,
  closesAt: "2099-03-07T17:00:00Z",
  open: true,
  host: false,
  accepted: 3,
  members: 4,
  going: 4,
  everyone: 5,
  pinned: null,
  last: message(),
  names: { [LEO]: "Leo", [ME]: "Fixture" },
  mutedChat: false,
  mutedResbite: false,
  lastReadId: 6,
  unread: true,
  messageCount: 23,
  ...over,
});

test("the Chat row: none outside the chat or when the read failed; the latest line and the dot while open", () => {
  // Not in the chat (42501), or the read failed: useEvent gives null, and there is no row (K-S13).
  assert.equal(chatRow(null, ME), null);
  assert.deepEqual(chatRow(chat(), ME), { text: "Leo: I can bring the snacks", dot: true, closed: false });
  assert.deepEqual(chatRow(chat({ unread: false }), ME), { text: "Leo: I can bring the snacks", dot: false, closed: false });
  // The viewer's own line, a system line in words, and an empty chat (CH-01).
  assert.equal(chatRow(chat({ last: message({ authorId: ME }), unread: false }), ME)?.text, "You: I can bring the snacks");
  assert.equal(
    chatRow(chat({ last: message({ kind: "system", event: "changed", payload: { actor: LEO, what: "place", place_label: "" }, body: null, authorId: null }) }), ME)?.text,
    "Leo changed the place",
  );
  assert.deepEqual(chatRow(chat({ last: null, unread: false, messageCount: 0 }), ME), { text: "No messages yet", dot: false, closed: false });
});

test("the Chat row after the close: the count without a dot, and no row for a closed chat that never had a message", () => {
  assert.deepEqual(chatRow(chat({ open: false }), ME), { text: "Chat closed · 23 messages", dot: false, closed: true });
  assert.deepEqual(chatRow(chat({ open: false, unread: false, messageCount: 1 }), ME), { text: "Chat closed · 1 message", dot: false, closed: true });
  // Every old resbite has a chat from the backfill: closed with nothing said, it shows no row (K-S13).
  assert.equal(chatRow(chat({ open: false, unread: false, messageCount: 0, last: null }), ME), null);
  // A cancelled one-off's chat is closed too.
  assert.deepEqual(chatRow(chat({ open: false, status: "cancelled", closesAt: null, messageCount: 4 }), ME), {
    text: "Chat closed · 4 messages",
    dot: false,
    closed: true,
  });
});

test("the Chat row never shows a line it can't word: no preview line, never null or empty text (H20)", () => {
  for (const last of [
    message({ kind: "system", event: "something_new", payload: {}, body: null, authorId: null }),
    message({ state: "hidden" as ChatMessage["state"] }),
    message({ kind: "poll" as ChatMessage["kind"] }),
  ]) {
    const row = chatRow(chat({ last }), ME);
    assert.ok(row, "the row stays");
    assert.equal(row.text, null, "with no preview line");
    assert.equal(row.dot, true);
  }
});
