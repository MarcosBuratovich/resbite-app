import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_COPY,
  bottomRow,
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
  placeLine,
  planEnd,
  replyText,
  viewerRole,
  whenLines,
} from "./eventPage.ts";

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
  assert.deepEqual(moreRows({ role: "owner", state: "open", muted: false, response: null }), ["calendar", "mute", "again", "cancel"]);
  assert.deepEqual(moreRows({ role: "owner", state: "open", muted: true, response: null }), ["calendar", "unmute", "again", "cancel"]);
  assert.deepEqual(moreRows({ role: "admin", state: "open", muted: false, response: "accepted" }), ["calendar", "mute", "again", "changeReply", "cancel"]);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: false, response: "maybe" }), ["calendar", "mute"]);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: true, response: "accepted" }), ["calendar", "unmute"]);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: false, response: "pending" }), []);
  assert.deepEqual(moreRows({ role: "guest", state: "open", muted: false, response: null }), []);
  for (const role of ["owner", "admin", "guest"] as const)
    for (const state of ["ended", "cancelled"] as const)
      assert.deepEqual(moreRows({ role, state, muted: false, response: "accepted" }), [], `${role} ${state}`);
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

const guest = (userId: string, name: string, response: string) => ({ userId, name, response });
const linkPerson = (phone: string, name: string, sentVia?: "whatsapp" | "messages") => ({
  phone,
  e164: `+44${phone}`,
  country: "GB",
  name,
  stored: sentVia ? { code: "c", name, sentVia } : null,
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
    guests: [
      guest("adm", "Leo", "accepted"), guest("g1", "Marta", "accepted"), guest("m1", "Sol", "maybe"),
      guest("c1", "Ivy", "declined"), guest("p1", "Pat", "pending"),
    ],
    invited: [linkPerson("111", "Dan", "whatsapp"), linkPerson("222", "Eve", "messages"), linkPerson("333", "Fay")],
    requests: [request("r1", "Rae")],
    admins: ["adm"],
    sentHere: new Set(["111", "333"]),
  });
  assert.deepEqual(groups.map((g) => g.title), [
    "Going · 2", "Maybe · 1", "Can’t go · 1", "Invited, not answered yet · 4", "Waiting for you · 1",
  ]);
  const [going, maybe, cant, invited, waiting] = groups.map((g) => g.rows);
  assert.deepEqual(going[0], { key: "guest:adm", name: "Leo", status: null, admin: true, kind: "guest", userId: "adm", actions: ["removeAdmin", "remove"] });
  assert.deepEqual(going[1].actions, ["makeAdmin", "remove"]);
  assert.equal(going[1].admin, false);
  assert.deepEqual(maybe[0].actions, ["remove"]);
  assert.deepEqual(cant[0].actions, ["remove"]);
  assert.deepEqual(invited[0], { key: "link:111", name: "Dan", status: "Invited by WhatsApp", admin: false, kind: "linkInvite", phone: "111", actions: ["sendAgain", "removeInvite"] });
  assert.equal(invited[1].status, "Invited by Messages");
  assert.deepEqual(invited[1].actions, ["removeInvite"]);
  assert.equal(invited[2].status, "Invited by link");
  assert.deepEqual(invited[2].actions, ["sendAgain", "removeInvite"]);
  assert.deepEqual(invited[3], { key: "app:p1", name: "Pat", status: "Invited in the app", admin: false, kind: "appInvite", userId: "p1", actions: ["remove"] });
  assert.deepEqual(waiting[0], { key: "request:r1", name: "Rae", status: "Asked through the link", admin: false, kind: "request", userId: "r1", actions: ["approve", "decline"] });
});

test("peopleGroups for an admin and a guest", () => {
  const input = {
    guests: [guest("g1", "Marta", "accepted"), guest("p1", "Pat", "pending")],
    invited: [linkPerson("111", "Dan")],
    requests: [request("r1", "Rae")],
    admins: [] as string[],
    sentHere: new Set<string>(),
  };
  const admin = peopleGroups({ ...input, role: "admin" });
  assert.deepEqual(admin[0].rows[0].actions, ["remove"]);
  assert.equal(admin.length, 3);
  const asGuest = peopleGroups({ ...input, role: "guest" });
  assert.deepEqual(asGuest.map((g) => g.title), ["Going · 1"]);
  assert.deepEqual(asGuest[0].rows[0].actions, []);
  assert.deepEqual(peopleGroups({ ...input, guests: [], invited: [], requests: [], role: "owner" }), []);
});

test("EVENT_COPY pins the page, sheet and list words", () => {
  assert.deepEqual(
    [
      "People", "Actions for ", "Make admin", "Remove as admin", "Remove from this resbite", "Send again on WhatsApp",
      "Send again on Messages", "Remove", "Approve", "Decline", "Admin", "Invite", "Edit", "More", "Change",
      "Do this again", "Add to calendar", "Mute this resbite", "Unmute this resbite", "Change my reply",
      "Cancel resbite", "Your answer", "Your resbite is cancelled.", "Or share the event link", "Update calendar", "Cancelled",
    ],
    [
      EVENT_COPY.people, EVENT_COPY.actionsFor, EVENT_COPY.makeAdmin, EVENT_COPY.removeAdmin, EVENT_COPY.removeFromResbite,
      EVENT_COPY.sendAgainWhatsApp, EVENT_COPY.sendAgainMessages, EVENT_COPY.remove, EVENT_COPY.approve, EVENT_COPY.decline,
      EVENT_COPY.adminBadge, EVENT_COPY.invite, EVENT_COPY.edit, EVENT_COPY.moreButton, EVENT_COPY.change,
      EVENT_COPY.doThisAgain, EVENT_COPY.addToCalendar, EVENT_COPY.mute, EVENT_COPY.unmute, EVENT_COPY.changeMyReply,
      EVENT_COPY.cancelResbite, EVENT_COPY.yourAnswer, EVENT_COPY.cancelled, EVENT_COPY.shareLink, EVENT_COPY.updateCalendar, EVENT_COPY.cancelledChip,
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
