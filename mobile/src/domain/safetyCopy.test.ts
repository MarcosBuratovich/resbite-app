import test from "node:test";
import assert from "node:assert/strict";
import type { ChatNames } from "../services/chat";
import { SAFETY_COPY as S, invitationActions, showsReportOrBlock, shownName, supportAddress, thanksLines, type ReportTarget } from "./safetyCopy";

const ANA = "0a000000-0000-4000-8000-000000000001";
const PEDRO = "0a000000-0000-4000-8000-000000000005";
const ADA = "0a000000-0000-4000-8000-000000000006";
const ME = "0a000000-0000-4000-8000-000000000009";
const names: ChatNames = { [ANA]: "Ana", [PEDRO]: "Pedro", [ADA]: "Ada", [ME]: "Mia" };

test("the report sheet's words read exactly", () => {
  assert.equal(S.report, "Report");
  assert.equal(S.reportMessage, "Report message");
  assert.equal(S.reportPerson("Leo"), "Report Leo");
  assert.equal(S.reportOrBlock, "Report or block");
  assert.equal(S.why, "What’s wrong?");
  assert.deepEqual(S.reasons, { harassment: "Harassment", spam: "Spam", inappropriate: "Not appropriate", other: "Something else" });
  // The radios' order is the reasons' own (Decision 4).
  assert.deepEqual(Object.keys(S.reasons), ["harassment", "spam", "inappropriate", "other"]);
  assert.equal(S.detailsLabel, "Anything else? (optional)");
  assert.equal(S.sendReport, "Send report");
  assert.equal(S.pickReason, "Pick a reason to send the report.");
  assert.equal(S.thanks, "Thanks. The Resbite team will look at it.");
});

test("block and unblock read exactly, and the block question names the person, never a pronoun (G-N9, N9, NOTE 7)", () => {
  assert.equal(S.block("Ana"), "Block Ana");
  assert.equal(S.unblock("Ana"), "Unblock Ana");
  assert.equal(S.blocked, "Blocked");
  const host =
    "Block Ana? You won’t see Ana’s messages or announcements, and you won’t be able to remove Ana’s messages. Any connection between you ends, and unblocking won’t bring it back.";
  // The reader hosts: what they give up, whoever Ana is.
  assert.equal(S.blockQuestion("Ana", true, false), host);
  assert.equal(S.blockQuestion("Ana", true, true), host);
  // Ana hosts: her announcements go too, and she won't know.
  assert.equal(
    S.blockQuestion("Ana", false, true),
    "Block Ana? You won’t see Ana’s messages or announcements, and Ana won’t know. Any connection between you ends, and unblocking won’t bring it back.",
  );
  // Neither hosts.
  assert.equal(
    S.blockQuestion("Ana", false, false),
    "Block Ana? You won’t see Ana’s messages, and Ana won’t know. Any connection between you ends, and unblocking won’t bring it back.",
  );
});

test("the safety errors read exactly", () => {
  assert.equal(S.unavailable, "You can’t report that any more.");
  assert.equal(S.unblockFirst, "Unblock this person first.");
  assert.equal(S.notAllowed, "That message can’t be sent.");
  assert.equal(S.reportLimit, "You’ve sent a lot of reports today. Try again later.");
});

test("the chat rules, a rules refusal and a failed I agree each read exactly, none of them the connection line (G-B4(d), I6)", () => {
  assert.equal(S.rulesTitle, "Chat rules");
  assert.equal(
    S.rules,
    "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account.",
  );
  assert.equal(S.agree, "I agree");
  assert.equal(S.rulesFirst, "Agree to the chat rules first.");
  assert.equal(S.rulesHeldMessage(1), "Your message hasn’t been sent. Agree to the chat rules to send it.");
  assert.equal(S.rulesHeldMessage(3), "3 messages haven’t been sent. Agree to the chat rules to send them.");
  assert.equal(S.rulesHeldAnnouncement, "Your announcement hasn’t been sent. Agree to the chat rules to send it.");
  assert.equal(S.rulesNotSaved, "That didn’t go through, so nothing was sent. Try again.");
  for (const line of [S.rulesFirst, S.rulesHeldMessage(1), S.rulesHeldMessage(2), S.rulesHeldAnnouncement, S.rulesNotSaved])
    assert.equal(line.includes("Check your connection"), false, line);
});

test("blocked people, the contact line and the reports line read exactly (G-S10, G-N10, G-S11)", () => {
  assert.equal(S.blockedPeople, "Blocked people");
  assert.equal(S.noneBlocked, "You haven’t blocked anyone.");
  assert.equal(S.contact("help@x.example"), "Questions, or something wrong in a chat? Write to help@x.example.");
  assert.equal(S.copyAddress, "Copy address");
  assert.equal(S.copied, "Copied");
  assert.equal(
    S.reportsPrivacy,
    "If you report a message or a person, the Resbite team reads the report and keeps a copy of what was reported, even if the message or that person’s account is deleted. If you delete your account, the reports you sent are deleted too. A report is deleted 180 days after the team closes it.",
  );
});

test("every user-facing apostrophe in the safety copy is the curly one (H37 Q7)", () => {
  const lines: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string") lines.push(value);
    else if (typeof value === "function") lines.push(String(value));
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(collect);
  };
  collect(S);
  assert.ok(lines.length > 30);
  for (const line of lines) assert.equal(line.includes("'"), false, line);
});

test("supportAddress: trimmed, and null when unset, blank or not an address (G-N10, N9)", () => {
  assert.equal(supportAddress(undefined), null);
  assert.equal(supportAddress(""), null);
  assert.equal(supportAddress("  "), null);
  assert.equal(supportAddress(" help@x.example "), "help@x.example");
  assert.equal(supportAddress("help@x.example"), "help@x.example");
  assert.equal(supportAddress("help"), null);
  assert.equal(supportAddress("a b@x.example"), null);
  // One @, text before it, a dot in the part after it, no blank anywhere.
  assert.equal(supportAddress("@x.example"), null);
  assert.equal(supportAddress("help@example"), null);
  assert.equal(supportAddress("help@@x.example"), null);
  assert.equal(supportAddress("a@b@x.example"), null);
  assert.equal(supportAddress("help@x.\texample"), null);
  assert.equal(supportAddress("help@x.exam ple"), null);
  assert.equal(supportAddress("help@.example"), null);
  assert.equal(supportAddress("help@x."), null);
  assert.equal(supportAddress("help@mail.x.example"), "help@mail.x.example");
});

test("thanksLines: the thanks, and the contact line only with an address (G-N10)", () => {
  assert.deepEqual(thanksLines(null), ["Thanks. The Resbite team will look at it."]);
  assert.deepEqual(thanksLines("help@x.example"), [
    "Thanks. The Resbite team will look at it.",
    "Questions, or something wrong in a chat? Write to help@x.example.",
  ]);
});

test("showsReportOrBlock: hidden when nobody else is in the chat (G-N7)", () => {
  assert.equal(showsReportOrBlock(0), false);
  assert.equal(showsReportOrBlock(1), true);
  assert.equal(showsReportOrBlock(7), true);
  assert.equal(showsReportOrBlock(-1), false);
  assert.equal(showsReportOrBlock(NaN), false);
});

test("a report target is a message by id or a person on a series (G-N6)", () => {
  const message: ReportTarget = { kind: "message", id: 41 };
  const person: ReportTarget = { kind: "user", userId: ANA, series: "0b000000-0000-4000-8000-000000000001", name: "Ana" };
  assert.equal(message.kind, "message");
  assert.equal(person.kind, "user");
});

const owner = { userId: ANA, name: "Ana" };
const actions = (over: Partial<Parameters<typeof invitationActions>[0]> = {}) =>
  invitationActions({ announcement: null, inviterId: null, owner, viewerId: ME, names, ...over });
const reportAna = { kind: "reportPerson", userId: ANA, name: "Ana" };
const blockAna = { kind: "block", userId: ANA, name: "Ana", theyHost: true };
const reportPedro = { kind: "reportPerson", userId: PEDRO, name: "Pedro" };
const blockPedro = { kind: "block", userId: PEDRO, name: "Pedro", theyHost: false };

test("invitationActions: Ana's announcement with Ana the inviter offers the message, then Ana once", () => {
  assert.deepEqual(actions({ announcement: { id: 41, authorId: ANA }, inviterId: ANA }), [
    { kind: "reportMessage", id: 41 },
    reportAna,
    blockAna,
  ]);
});

test("invitationActions: Ana's announcement with Pedro the inviter offers the message, Ana, then Pedro (B4)", () => {
  assert.deepEqual(actions({ announcement: { id: 41, authorId: ANA }, inviterId: PEDRO }), [
    { kind: "reportMessage", id: 41 },
    reportAna,
    blockAna,
    reportPedro,
    blockPedro,
  ]);
});

test("invitationActions: with no announcement, the inviter then the owner (I-2)", () => {
  assert.deepEqual(actions({ inviterId: PEDRO }), [reportPedro, blockPedro, reportAna, blockAna]);
  // No inviter either: the owner the card names.
  assert.deepEqual(actions(), [reportAna, blockAna]);
  // Ana invited them herself: once, as a host.
  assert.deepEqual(actions({ inviterId: ANA }), [reportAna, blockAna]);
});

test("invitationActions: an admin's announcement, a guest inviter and the owner, in that order; hosts get the shorter question", () => {
  assert.deepEqual(actions({ announcement: { id: 52, authorId: ADA }, inviterId: PEDRO }), [
    { kind: "reportMessage", id: 52 },
    { kind: "reportPerson", userId: ADA, name: "Ada" },
    { kind: "block", userId: ADA, name: "Ada", theyHost: true },
    reportPedro,
    blockPedro,
    reportAna,
    blockAna,
  ]);
});

test("invitationActions leaves out the viewer, and anyone whose name is null or blank", () => {
  // The viewer as the inviter, or as the owner.
  assert.deepEqual(actions({ inviterId: ME }), [reportAna, blockAna]);
  assert.deepEqual(actions({ inviterId: PEDRO, owner: { userId: ME, name: "Mia" } }), [reportPedro, blockPedro]);
  // A null name in `names`, or one missing from it: not listed.
  assert.deepEqual(actions({ inviterId: PEDRO, names: { ...names, [PEDRO]: null } }), [reportAna, blockAna]);
  assert.deepEqual(actions({ inviterId: PEDRO, names: { [ANA]: "Ana" } }), [reportAna, blockAna]);
  // An owner with a blank name.
  assert.deepEqual(actions({ inviterId: PEDRO, owner: { userId: ANA, name: "  " } }), [reportPedro, blockPedro]);
  assert.deepEqual(actions({ owner: { userId: ANA, name: "" } }), []);
  assert.deepEqual(actions({ owner: null }), []);
  // An author nobody can name: the message can still be reported, the author isn't listed.
  assert.deepEqual(actions({ announcement: { id: 41, authorId: ADA }, names: { ...names, [ADA]: null }, owner: null }), [
    { kind: "reportMessage", id: 41 },
  ]);
  assert.deepEqual(actions({ announcement: { id: 41, authorId: null }, owner: null }), [{ kind: "reportMessage", id: 41 }]);
  // The viewer's own announcement (an admin who hasn't answered this week) is theirs, not something to report.
  assert.deepEqual(actions({ announcement: { id: 41, authorId: ME } }), [reportAna, blockAna]);
});

test("invitationActions names people as the chat does: zero-width and directional marks go", () => {
  assert.deepEqual(actions({ inviterId: PEDRO, names: { ...names, [PEDRO]: "Pe​dro‏" }, owner: null }), [reportPedro, blockPedro]);
  assert.deepEqual(actions({ owner: { userId: ANA, name: " An​a " } }), [reportAna, blockAna]);
});

// Ruling SR2 (review test gap): `inviter_of` falls back to the owner, so the inviter is often the owner, whom `names` may
// not name. A place with no name doesn't use up the person: a later place that names them lists them.
test("invitationActions: a nameless first place doesn't use up the person; a later place with a name lists them", () => {
  // Ana the inviter (the owner, by `inviter_of`'s fallback), with no name in `names`: listed from the owner's place.
  assert.deepEqual(actions({ inviterId: ANA, names: { [PEDRO]: "Pedro" } }), [reportAna, blockAna]);
  // Ana's announcement, Ana unnamed in `names`, Pedro the inviter: Ana comes at the owner's place, after Pedro.
  assert.deepEqual(actions({ announcement: { id: 41, authorId: ANA }, inviterId: PEDRO, names: { [PEDRO]: "Pedro" } }), [
    { kind: "reportMessage", id: 41 },
    reportPedro,
    blockPedro,
    reportAna,
    blockAna,
  ]);
});

// Ruling SR2 (Q2): no control (C0 or C1) and no invisible format character, which would break the mailto: or flip the line.
test("supportAddress refuses C1 controls and invisible format characters anywhere", () => {
  for (const hidden of ["\u0085", "\u0090", "\u009f", "\u0080", "\u200b", "\u200f", "\u202e", "\u2066", "\u2060", "\u00ad", "\u061c"]) {
    assert.equal(supportAddress(`help@x.exa${hidden}mple`), null, JSON.stringify(hidden));
    assert.equal(supportAddress(`${hidden}help@x.example`), null, JSON.stringify(hidden));
    assert.equal(supportAddress(`help@x.example${hidden}`), null, JSON.stringify(hidden));
  }
  // A byte-order mark inside is refused; at either end the trim takes it, as it takes a blank, and leaves the address.
  assert.equal(supportAddress("help@x.exa\ufeffmple"), null);
  assert.equal(supportAddress("\ufeffhelp@x.example\ufeff"), "help@x.example");
  // Text the address may hold stays: letters beyond ASCII, digits, dots, plus and hyphens.
  assert.equal(supportAddress("ayuda+app@correo-x.example"), "ayuda+app@correo-x.example");
  assert.equal(supportAddress("josé@x.example"), "josé@x.example");
});

// Ruling SR2 (Q4): a person's name in Report and Block reads as the chat reads it (cleanName), as on the card.
test("shownName cleans a name for Report and Block, and says Someone when nothing is left", () => {
  assert.equal(shownName("\u202eevE"), "evE");
  assert.equal(shownName("Le\u200bo\u200f"), "Leo");
  assert.equal(shownName("  Ana María: "), "Ana María");
  assert.equal(shownName("\u200b"), "Someone");
  assert.equal(shownName(""), "Someone");
  assert.equal(shownName(null), "Someone");
  assert.equal(S.block(shownName("\u202eevE")), "Block evE");
});
