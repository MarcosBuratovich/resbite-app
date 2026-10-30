import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_COPY,
  answerCountsFrom,
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

const guest = (userId: string, name: string, response: string) => ({ userId, name, response });
/** Someone invited by personal link: `held` is whether this phone holds their code (with the app it went by, if any). */
const linkPerson = (phone: string, name: string, sentVia?: "whatsapp" | "messages", held = sentVia !== undefined) => ({
  phone,
  e164: `+44${phone}`,
  country: "GB",
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
  });
  assert.deepEqual(groups.map((g) => g.title), [
    "Going · 2", "Maybe · 1", "Can’t go · 1", "Invited, not answered yet · 4", "Waiting for you · 1",
  ]);
  const [going, maybe, cant, invited, waiting] = groups.map((g) => g.rows);
  assert.deepEqual(going[0], { key: "guest:adm", name: "Leo", status: null, reply: "Going", admin: true, kind: "guest", userId: "adm", actions: ["removeAdmin", "remove"] });
  assert.deepEqual(going[1].actions, ["makeAdmin", "remove"]);
  assert.equal(going[1].admin, false);
  assert.deepEqual(maybe[0], { key: "guest:m1", name: "Sol", status: null, reply: "Maybe", admin: false, kind: "guest", userId: "m1", actions: ["remove"] });
  assert.deepEqual(cant[0].actions, ["remove"]);
  assert.equal(cant[0].reply, "Can’t go");
  assert.deepEqual(invited[0], { key: "link:111", name: "Dan", status: "Invited by WhatsApp", reply: null, admin: false, kind: "linkInvite", phone: "111", actions: ["sendAgain", "removeInvite"] });
  // Send again needs this phone's code for the person, found under any spelling of their number (`stored`).
  assert.equal(invited[1].status, "Invited by link");
  assert.deepEqual(invited[1].actions, ["removeInvite"]);
  assert.equal(invited[2].status, "Invited by link");
  assert.deepEqual(invited[2].actions, ["sendAgain", "removeInvite"]);
  assert.deepEqual(invited[3], { key: "app:p1", name: "Pat", status: "Invited in the app", reply: null, admin: false, kind: "appInvite", userId: "p1", actions: ["remove"] });
  assert.deepEqual(waiting[0], { key: "request:r1", name: "Rae", status: "Asked through the link", reply: null, admin: false, kind: "request", userId: "r1", actions: ["approve", "decline"] });
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
  };
  const admin = peopleGroups({ ...input, role: "admin" });
  assert.deepEqual(admin.map((g) => g.title), ["Going · 2", "Invited, not answered yet · 3", "Waiting for you · 1"]);
  // An admin removes guests and decides requests, but never touches another admin (CR-P15) or the admin roles.
  assert.deepEqual(admin[0].rows.map((r) => [r.name, r.actions]), [["Marta", ["remove"]], ["Leo", []]]);
  assert.deepEqual(admin[1].rows.map((r) => [r.name, r.actions]), [["Dan", ["removeInvite"]], ["Pat", ["remove"]], ["Cy", []]]);
  assert.deepEqual(admin[2].rows[0].actions, ["approve", "decline"]);
  const asGuest = peopleGroups({ ...input, role: "guest" });
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
    });
    assert.deepEqual(groups.map((g) => g.title), ["Going · 2", "Invited, not answered yet · 2", "Waiting for you · 1"], state);
    assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => r.actions)), [[], [], [], [], []], state);
    // The roles still show.
    assert.equal(groups[0].rows[0].admin, true, state);
  }
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
      "Only someone who’s going can be an admin.", "Only the organizer can change admins.",
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
      EVENT_COPY.adminNotGoing, EVENT_COPY.adminsOwnerOnly,
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
