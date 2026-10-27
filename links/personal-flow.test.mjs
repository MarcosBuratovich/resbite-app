// The personal invitation page's step logic (contact invitations, Task 11): number matching, the step reducer,
// the error mapping and the page's words. Run from mobile/: node --import tsx ../links/personal-flow.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  composeNumber,
  maskNumber,
  formatCountdown,
  PAGE_COPY,
  initialState,
  next,
  errorText,
  rpcError,
  sendError,
  verifyError,
  sessionFrom,
  sessionExpired,
  isTestCode,
  RESEND_DELAY_MS,
  KEPT_PREFIX,
  keptKey,
  keptEntry,
  readKept,
  writeKept,
  dropKept,
  sweepKept,
  sameNumber,
  signOutKept,
  needsName,
  endingOf,
  screenForRequest,
  screenForReturn,
  openDoneScreen,
} from "./assets/personal-flow.mjs";
import { GUEST_COPY } from "../mobile/src/domain/guestAccount.ts";
import { PHONE_CODE_COPY } from "../mobile/src/services/phoneCode.ts";
import { PHONE_COPY } from "../mobile/src/domain/phoneCopy.ts";
import { INVALID_PHONE } from "../mobile/src/domain/phone.ts";

test("composeNumber: local, +, and 00 forms of the same number all match the invitation (Review Focus 2)", () => {
  assert.equal(composeNumber("07700 900834", "44"), "+447700900834");
  assert.equal(composeNumber("+44 7700 900834", "44"), "+447700900834");
  assert.equal(composeNumber("0044 7700 900834", "44"), "+447700900834");
  assert.equal(composeNumber("7700 900834", "44"), "+447700900834");
  assert.equal(composeNumber(" (0)7700-900.834 ", "44"), "+447700900834");
  // + and 00 are used as typed: another country's number is not rewritten to the invitation's.
  assert.equal(composeNumber("+1 (415) 555-0100", "44"), "+14155550100");
  assert.equal(composeNumber("001 415 555 0100", "44"), "+14155550100");
});

test("composeNumber: a national (0) after the calling code is dropped", () => {
  assert.equal(composeNumber("+44 (0) 7700 900834", "44"), "+447700900834");
  assert.equal(composeNumber("+44(0)7700900834", "44"), "+447700900834");
  assert.equal(composeNumber("0044 (0) 7700 900834", "44"), "+447700900834");
  assert.equal(composeNumber("+44 (0)20 7946 0000", "44"), "+442079460000");
  // Only a lone 0 in brackets: an area code in brackets is part of the number.
  assert.equal(composeNumber("+1 (415) 555-0100", "44"), "+14155550100");
});

test("composeNumber: too short, too long, letters or no usable country give null", () => {
  assert.equal(composeNumber("12", "44"), null);
  assert.equal(composeNumber("", "44"), null);
  assert.equal(composeNumber("000000", "44"), null);
  assert.equal(composeNumber("+123456", "44"), null);
  assert.equal(composeNumber("+1234567890123456", "44"), null);
  assert.equal(composeNumber("07700 9OO834", "44"), null);
  assert.equal(composeNumber("07700 900834", ""), null);
  assert.equal(composeNumber("07700 900834", "4444"), null);
  assert.equal(composeNumber(undefined, "44"), null);
});

test("maskNumber shows the calling code and the last three digits", () => {
  assert.equal(maskNumber("+447700900834", "44"), "+44 ••• 834");
  assert.equal(maskNumber("447700900834", "44"), "+44 ••• 834");
  assert.equal(maskNumber(null, "44"), null);
});

test("the copy is the mockup's and the app's words", () => {
  const c = PAGE_COPY;
  assert.equal(c.answer, "Answer");
  assert.equal(c.notYou("Marcos"), "Not your number? Ask Marcos to check it.");
  assert.equal(c.confirmHeading, "Confirm it’s you");
  assert.equal(c.confirmBody("Marcos"), "Type the number Marcos invited. We’ll text it a code.");
  assert.equal(c.numberField, "Mobile number");
  assert.equal(c.send, "Send code");
  assert.equal(c.wrongNumber("Marcos"), "That isn’t the number Marcos invited.");
  assert.equal(c.codeField, "6-digit code");
  assert.equal(c.verify, "Verify");
  assert.equal(c.mismatch, "That code doesn’t match. Try again.");
  assert.equal(c.verified("34"), "✓ Verified · ••34");
  assert.equal(c.nameField, "Your first name");
  assert.deepEqual([c.going, c.maybe, c.cantGo], ["Going", "Maybe", "Can’t go"]);
  assert.equal(c.sendAnswer, "Send answer");
  assert.equal(c.hostSees("Marcos"), "Marcos will see your answer.");
  assert.equal(c.hostCanSee("Marcos"), "Marcos can see your answer.");
  assert.equal(c.goingHeading, "You’re going!");
  assert.equal(c.maybeHeading, "You might come");
  assert.equal(c.cantHeading, "Thanks for letting them know");
  assert.deepEqual(c.benefits, [
    "Hear when the time or place changes",
    "See who else is going",
    "Get the exact address and meeting details",
    "Reminders before it starts",
    "Add it to your calendar",
  ]);
  assert.equal(c.getApp, "Get Resbite");
  assert.equal(c.waiting("+44 ••• 834"), "Sign up with +44 ••• 834 and this resbite will be waiting.");
  assert.equal(c.notNow, "Not now");
  assert.equal(c.planOwn, "Plan your own with Resbite.");
  assert.equal(c.connection, "Check your connection and try again.");
  assert.equal(c.tooMany, "Too many tries. Try again later.");
  // GI2's tick and terms, and the app's code words, exactly.
  assert.equal(c.tick, GUEST_COPY.tick);
  assert.equal(c.terms, GUEST_COPY.terms);
  assert.equal(c.ageHelper, GUEST_COPY.ageHelper);
  for (const s of [0, 42, 60, 125]) assert.equal(c.resendIn(s), GUEST_COPY.resendIn(s));
  assert.equal(c.resend, PHONE_COPY.resend);
  assert.equal(c.codeHeading, PHONE_COPY.codeHeading);
  assert.equal(c.changeNumber, PHONE_COPY.changeNumber);
  assert.equal(c.nameRule, PHONE_COPY.nameRule);
  assert.equal(c.mismatch, PHONE_CODE_COPY.mismatch);
  assert.equal(c.expired, PHONE_CODE_COPY.expired);
  assert.equal(c.wait, PHONE_CODE_COPY.wait);
  assert.equal(c.connection, PHONE_CODE_COPY.connection);
  assert.equal(c.invalidNumber, INVALID_PHONE);
  // Headings are at most three words, except the protected done heading.
  for (const h of [c.confirmHeading, c.codeHeading, c.goingHeading, c.maybeHeading]) assert.ok(h.split(" ").length <= 3, h);
});

test("the open link's words (plan 3): the number hint, waiting, not added and already in", () => {
  const c = PAGE_COPY;
  assert.equal(c.outsideUk, "Outside the UK? Start with + and your country code.");
  // Anyone can answer an open link, so the number step says what the app's number step says.
  assert.equal(c.numberHint, PHONE_COPY.numberHint);
  assert.equal(c.waitingHeading("Marcos"), "Waiting for Marcos");
  assert.equal(c.waitingBody("Marcos"), "Marcos will confirm your spot.");
  assert.equal(c.notAdded, "You weren’t added to this resbite.");
  assert.equal(c.alreadyIn, "You’re on this resbite.");
  assert.equal(c.openApp, "Open Resbite");
  assert.ok(c.waitingHeading("Marcos").split(" ").length <= 3);
});

test("the copy never holds the test code", () => {
  const seen = [];
  for (const [key, value] of Object.entries(PAGE_COPY)) {
    const text = typeof value === "function" ? [value("Marcos"), value(42), value("34")].join(" ") : JSON.stringify(value);
    seen.push(text);
    assert.ok(!text.includes("000000"), key);
  }
  assert.ok(seen.length > 30);
});

test("formatCountdown matches the app's", () => {
  assert.deepEqual([0, 5, 42, 60, 61, -3].map(formatCountdown), ["0:00", "0:05", "0:42", "1:00", "1:01", "0:00"]);
  assert.equal(RESEND_DELAY_MS, 60_000);
});

const run = (events, from = initialState()) => events.reduce((state, event) => next(state, event), from);

test("the reducer's happy path: invite → confirm → code → answer → done", () => {
  let s = initialState();
  assert.equal(s.step, "invite");
  s = next(s, { type: "open" });
  assert.equal(s.step, "confirm");
  s = next(s, { type: "tick", ticked: true });
  assert.equal(s.ticked, true);
  s = next(s, { type: "send", input: "07700 900834", country: "44" });
  assert.deepEqual([s.step, s.busy, s.phone, s.number, s.error], ["confirm", true, "+447700900834", "07700 900834", null]);
  s = next(s, { type: "checked", matches: true });
  assert.deepEqual([s.step, s.busy], ["confirm", true], "still busy: the code is being sent");
  s = next(s, { type: "sent", at: 1000 });
  assert.deepEqual([s.step, s.busy, s.sentAt, s.error], ["code", false, 1000, null]);
  s = next(s, { type: "verify", code: "123 456" });
  assert.deepEqual([s.step, s.busy, s.code], ["code", true, "123456"]);
  s = next(s, { type: "verified" });
  assert.deepEqual([s.step, s.busy, s.phone], ["answer", false, "+447700900834"]);
  s = next(s, { type: "choose", response: "accepted" });
  assert.equal(s.choice, "accepted");
  s = next(s, { type: "submit", name: "  Sam " });
  assert.deepEqual([s.step, s.busy, s.name], ["answer", true, "Sam"]);
  s = next(s, { type: "answered", response: "accepted" });
  assert.deepEqual([s.step, s.busy, s.response, s.pitch], ["done", false, "accepted", true]);
});

test("the reducer holds errors: tick, number, wrong number, code, name and answer", () => {
  const confirm = run([{ type: "open" }]);
  // No tick: nothing is sent.
  let s = next(confirm, { type: "send", input: "07700 900834", country: "44" });
  assert.deepEqual([s.busy, s.error, s.phone], [false, "ageHelper", null]);
  s = next(s, { type: "tick", ticked: true });
  assert.equal(s.error, null, "ticking clears the age error");
  // An unusable number.
  s = next(s, { type: "send", input: "12", country: "44" });
  assert.deepEqual([s.busy, s.error], [false, "invalidNumber"]);
  // A number that isn't the invited one: no code, the error, the step kept.
  s = next(next(s, { type: "send", input: "07700 900111", country: "44" }), { type: "checked", matches: false });
  assert.deepEqual([s.step, s.busy, s.error, s.phone], ["confirm", false, "wrongNumber", null]);
  // A failure while checking or sending.
  s = next(next(s, { type: "send", input: "07700 900834", country: "44" }), { type: "fail", error: "tooMany" });
  assert.deepEqual([s.step, s.busy, s.error], ["confirm", false, "tooMany"]);
  s = run([{ type: "send", input: "07700 900834", country: "44" }, { type: "checked", matches: true }, { type: "sent", at: 5 }], s);
  assert.equal(s.error, null);
  // Codes: too short is a mismatch without a request; a refused code keeps the step.
  s = next(s, { type: "verify", code: "12" });
  assert.deepEqual([s.step, s.busy, s.error], ["code", false, "mismatch"]);
  s = next(next(s, { type: "verify", code: "111111" }), { type: "fail", error: "mismatch" });
  assert.deepEqual([s.step, s.busy, s.error], ["code", false, "mismatch"]);
  // Change number goes back with the tick kept.
  const back = next(s, { type: "back" });
  assert.deepEqual([back.step, back.ticked, back.error], ["confirm", true, null]);
  s = run([{ type: "verify", code: "123456" }, { type: "verified" }], s);
  // Answer: a choice and a name are required for a first answer.
  s = next(s, { type: "submit", name: "Sam" });
  assert.deepEqual([s.busy, s.error], [false, "chooseAnswer"]);
  s = next(s, { type: "choose", response: "maybe" });
  assert.equal(s.error, null);
  for (const name of ["", "   ", "x".repeat(81)]) {
    const refused = next(s, { type: "submit", name });
    assert.deepEqual([refused.busy, refused.error], [false, "nameRule"], JSON.stringify(name));
  }
  s = next(next(s, { type: "submit", name: "Sam" }), { type: "fail", error: "connection" });
  assert.deepEqual([s.step, s.busy, s.error], ["answer", false, "connection"]);
  // The server says the signed-in number isn't the invited one: back to confirm, signed out.
  const refused = next(next(s, { type: "submit", name: "Sam" }), { type: "refused", error: "wrongNumber" });
  assert.deepEqual([refused.step, refused.busy, refused.error, refused.phone, refused.response], ["confirm", false, "wrongNumber", null, null]);
});

test("the reducer ignores events out of step and while busy", () => {
  const invite = initialState();
  for (const event of [{ type: "send", input: "07700 900834", country: "44" }, { type: "verify", code: "123456" }, { type: "submit", name: "Sam" }, { type: "change" }, { type: "bogus" }])
    assert.equal(next(invite, event), invite, event.type);
  const busy = run([{ type: "open" }, { type: "tick", ticked: true }, { type: "send", input: "07700 900834", country: "44" }]);
  assert.equal(next(busy, { type: "send", input: "07700 900111", country: "44" }), busy, "no second send while one runs");
  assert.equal(next(busy, { type: "tick", ticked: false }), busy, "the tick is locked while sending");
  const answer = run([{ type: "restore", response: null, phone: "+447700900834" }]);
  assert.equal(next(answer, { type: "choose", response: "yes" }), answer, "only accepted, maybe or declined");
});

test("a new code: resend waits for the reply and restarts the countdown; Change number goes back", () => {
  const code = run([{ type: "open" }, { type: "tick", ticked: true }, { type: "send", input: "07700 900834", country: "44" }, { type: "checked", matches: true }, { type: "sent", at: 1000 }]);
  let s = next(code, { type: "resend" });
  assert.deepEqual([s.step, s.busy], ["code", true]);
  assert.equal(next(s, { type: "resend" }), s, "one at a time");
  assert.equal(next(s, { type: "verify", code: "123456" }), s, "no verify while a code is being sent");
  s = next(s, { type: "sent", at: 90_000 });
  assert.deepEqual([s.step, s.busy, s.sentAt], ["code", false, 90_000]);
  s = next(next(s, { type: "resend" }), { type: "fail", error: "wait" });
  assert.deepEqual([s.step, s.busy, s.error, s.sentAt], ["code", false, "wait", 90_000]);
  const back = next(s, { type: "back" });
  assert.deepEqual([back.step, back.phone, back.sentAt, back.error, back.ticked], ["confirm", null, null, null, true]);
});

test("coming back: a stored answer restores done, and changing it skips the name", () => {
  let s = next(initialState(), { type: "restore", response: "accepted", phone: "+447700900834" });
  assert.deepEqual([s.step, s.response, s.phone, s.pitch], ["done", "accepted", "+447700900834", true]);
  s = next(s, { type: "notNow" });
  assert.equal(s.pitch, false);
  s = next(s, { type: "change" });
  assert.deepEqual([s.step, s.choice, s.error], ["answer", "accepted", null]);
  s = next(s, { type: "choose", response: "declined" });
  s = next(s, { type: "submit", name: "" });
  assert.deepEqual([s.busy, s.error, s.name], [true, null, ""], "a changed answer needs no name");
  s = next(s, { type: "answered", response: "declined" });
  assert.deepEqual([s.step, s.response, s.pitch], ["done", "declined", true]);
  // Verified before, never answered: the answer step.
  const verified = next(initialState(), { type: "restore", response: null, phone: "+447700900834" });
  assert.deepEqual([verified.step, verified.response], ["answer", null]);
});

test("server errors map to the page's words", () => {
  assert.equal(rpcError(0, null), "connection");
  assert.equal(rpcError(503, null), "connection");
  assert.equal(rpcError(400, { code: "22023", message: "Too many tries. Try again later." }), "tooMany");
  assert.equal(rpcError(403, { code: "42501", message: "That isn't the invited number." }), "wrongNumber");
  assert.equal(rpcError(403, { code: "42501", message: "Invitation unavailable" }), "unavailable");
  assert.equal(rpcError(401, { code: "PGRST301", message: "JWT expired" }), "signedOut");
  assert.equal(rpcError(400, { code: "22023", message: "Name required" }), "nameRule");
  assert.equal(sendError(0, null), "connection");
  assert.equal(sendError(429, { msg: "Too many requests" }), "wait");
  assert.equal(sendError(422, { msg: "Phone signups are disabled" }), "Phone signups are disabled");
  assert.equal(sendError(400, {}), "connection");
  assert.equal(verifyError(0, null, 0, 1), "connection");
  assert.equal(verifyError(400, { error_code: "otp_expired" }, 0, 60_000), "mismatch");
  assert.equal(verifyError(400, { error_code: "otp_expired" }, 0, 600_000), "expired");
  assert.equal(errorText("wrongNumber", "Marcos"), "That isn’t the number Marcos invited.");
  assert.equal(errorText("connection", "Marcos"), "Check your connection and try again.");
  assert.equal(errorText("Phone signups are disabled", "Marcos"), "Phone signups are disabled");
  assert.equal(errorText(null, "Marcos"), "");
});

test("sessions: read from GoTrue's reply, with the number; expired a minute early", () => {
  const body = { access_token: "a", refresh_token: "r", expires_in: 3600, token_type: "bearer", user: { id: "u", phone: "447700900834" } };
  assert.deepEqual(sessionFrom(body, 1_000_000), { access_token: "a", refresh_token: "r", expires_at: 1000 + 3600, phone: "+447700900834" });
  assert.equal(sessionFrom({ ...body, expires_at: 5000 }, 1_000_000).expires_at, 5000);
  assert.equal(sessionFrom({ ...body, user: {} }, 0, "+447700900834").phone, "+447700900834");
  assert.equal(sessionFrom({ refresh_token: "r" }, 0), null);
  assert.equal(sessionFrom(null, 0), null);
  const s = { access_token: "a", refresh_token: "r", expires_at: 1000, phone: "+447700900834" };
  assert.equal(sessionExpired(s, 900_000), false);
  assert.equal(sessionExpired(s, 941_000), true);
});

test("only the test code is exchanged", () => {
  assert.equal(isTestCode("000000"), true);
  assert.equal(isTestCode("123456"), false);
  assert.equal(isTestCode("0000000"), false);
});

test("Not you? Sign out goes back to the invitation from the answer and done steps, not mid-request", () => {
  assert.equal(PAGE_COPY.signOut, "Not you? Sign out");
  const answering = next(initialState(), { type: "restore", response: null, phone: "+447700900834" });
  assert.deepEqual(next(answering, { type: "signOut" }), initialState());
  const done = next(initialState(), { type: "restore", response: "accepted", phone: "+447700900834" });
  assert.deepEqual(next(done, { type: "signOut" }), initialState());
  const busy = next({ ...answering, choice: "accepted" }, { type: "submit", name: "Sam" });
  assert.equal(busy.busy, true);
  assert.equal(next(busy, { type: "signOut" }), busy, "not while the answer is on its way");
  const confirming = next(initialState(), { type: "open" });
  assert.equal(next(confirming, { type: "signOut" }), confirming);
});

// ---- The open link /r/<code> (plan 3): any number can answer, and the answer waits for the host. ----

test("open link: coming back picks the screen from my_join_request, the first rule that applies", () => {
  const page = { state: "open", host: "Marcos", title: "Picnic in the park" };
  const waiting = (response) => ({ status: "waiting", response });
  // 1. The owner or a guest is on the resbite, whatever a request says.
  assert.deepEqual(screenForReturn({ ...page, member: "owner", request: null }), { join: "alreadyIn", response: null });
  assert.deepEqual(screenForReturn({ ...page, member: "attendee", request: waiting("maybe") }), { join: "alreadyIn", response: null });
  assert.deepEqual(screenForReturn({ ...page, member: "attendee", request: { status: "declined", response: "accepted" } }), { join: "alreadyIn", response: null });
  // 2. Waiting: the answer comes back to be changed. One asked from the app ("pending") has no answer yet.
  assert.deepEqual(screenForReturn({ ...page, member: null, request: waiting("accepted") }), { join: "waiting", response: "accepted" });
  assert.deepEqual(screenForReturn({ ...page, member: null, request: waiting("declined") }), { join: "waiting", response: "declined" });
  assert.deepEqual(screenForReturn({ ...page, member: null, request: waiting("pending") }), { join: "waiting", response: null });
  // 3. Declined on this link.
  assert.deepEqual(screenForReturn({ ...page, member: null, request: { status: "declined", response: "accepted" } }), { join: "notAdded", response: null });
  // 4. No request (or an approval whose guest was removed since): the answer step.
  assert.deepEqual(screenForReturn({ ...page, member: null, request: null }), { join: null, response: null });
  assert.deepEqual(screenForReturn({ ...page, member: null, request: { status: "approved", response: "accepted" } }), { join: null, response: null });
  assert.deepEqual(screenForReturn({ ...page }), { join: null, response: null });
  assert.deepEqual(screenForReturn(null), { join: null, response: null });
});

test("open link: request_to_join's reply maps to the same screens; anything else is no screen", () => {
  const plan_id = "55555555-5555-4555-8555-555555555555";
  assert.deepEqual(screenForRequest({ state: "owner", plan_id, response: null }), { join: "alreadyIn", response: null });
  assert.deepEqual(screenForRequest({ state: "already", plan_id, response: "accepted" }), { join: "alreadyIn", response: null });
  assert.deepEqual(screenForRequest({ state: "waiting", plan_id, response: "maybe" }), { join: "waiting", response: "maybe" });
  assert.deepEqual(screenForRequest({ state: "waiting", plan_id, response: "pending" }), { join: "waiting", response: null });
  assert.deepEqual(screenForRequest({ state: "declined", plan_id, response: "accepted" }), { join: "notAdded", response: null });
  for (const junk of [null, "waiting", {}, { state: "open" }, { state: "approved" }]) assert.equal(screenForRequest(junk), null, JSON.stringify(junk));
});

test("open link: the path has no number check and ends waiting", () => {
  let s = run([{ type: "open" }, { type: "tick", ticked: true }, { type: "send", input: "+1 (415) 555-0100", country: "44" }]);
  assert.deepEqual([s.step, s.busy, s.phone], ["confirm", true, "+14155550100"], "+ is used as typed, outside the UK");
  // The code goes straight away: nothing is checked against an invited number.
  s = next(s, { type: "sent", at: 1000 });
  assert.deepEqual([s.step, s.busy], ["code", false]);
  s = next(s, { type: "back" });
  s = run([{ type: "send", input: "07700 900834", country: "44" }, { type: "sent", at: 2000 }], s);
  assert.deepEqual([s.step, s.phone], ["code", "+447700900834"], "a number without + takes the page's 44");
  s = run([{ type: "verify", code: "123456" }, { type: "verified" }], s);
  assert.deepEqual([s.step, s.join, s.response, needsName(s)], ["answer", null, null, true]);
  assert.equal(endingOf(s.phone), "34");
  s = run([{ type: "choose", response: "accepted" }, { type: "submit", name: " Sam " }], s);
  assert.deepEqual([s.busy, s.name], [true, "Sam"]);
  s = next(s, { type: "answered", response: "accepted", join: "waiting" });
  assert.deepEqual([s.step, s.busy, s.join, s.response, s.pitch], ["done", false, "waiting", "accepted", true]);
  s = next(s, { type: "notNow" });
  assert.equal(s.pitch, false);
});

test("open link: while waiting the answer can change with no name, until the host decides", () => {
  let s = next(initialState(), { type: "restore", join: "waiting", response: "accepted", phone: "+447700900834" });
  assert.deepEqual([s.step, s.join, s.response, s.phone], ["done", "waiting", "accepted", "+447700900834"]);
  s = next(s, { type: "change" });
  assert.deepEqual([s.step, s.choice, needsName(s)], ["answer", "accepted", false]);
  s = run([{ type: "choose", response: "maybe" }, { type: "submit", name: "" }], s);
  assert.deepEqual([s.busy, s.error, s.name], [true, null, ""], "a changed answer needs no name");
  s = next(s, { type: "answered", response: "maybe", join: "waiting" });
  assert.deepEqual([s.step, s.join, s.response, s.choice], ["done", "waiting", "maybe", "maybe"]);
  // Asked from the app ("pending"): waiting with no answer yet, and still no name to give.
  let pending = next(initialState(), { type: "restore", join: "waiting", response: null, phone: "+447700900834" });
  assert.deepEqual([pending.step, pending.join], ["done", "waiting"]);
  pending = next(pending, { type: "change" });
  assert.deepEqual([pending.step, pending.choice, needsName(pending)], ["answer", null, false]);
  pending = run([{ type: "choose", response: "accepted" }, { type: "submit", name: "" }], pending);
  assert.deepEqual([pending.busy, pending.error], [true, null]);
  // The host decided meanwhile: the reply's screen wins, and the answer can no longer change.
  const changing = run([{ type: "change" }, { type: "choose", response: "accepted" }, { type: "submit", name: "" }], s);
  const notAdded = next(changing, { type: "answered", response: null, join: "notAdded" });
  assert.deepEqual([notAdded.step, notAdded.join], ["done", "notAdded"]);
  assert.equal(next(notAdded, { type: "change" }), notAdded);
  const alreadyIn = next(changing, { type: "answered", response: null, join: "alreadyIn" });
  assert.deepEqual([alreadyIn.step, alreadyIn.join], ["done", "alreadyIn"]);
  assert.equal(next(alreadyIn, { type: "change" }), alreadyIn);
});

test("open link: coming back declined or already in shows that screen; no request is the answer step", () => {
  for (const join of ["notAdded", "alreadyIn"]) {
    const s = next(initialState(), { type: "restore", join, response: null, phone: "+447700900834" });
    assert.deepEqual([s.step, s.join, s.response], ["done", join, null], join);
    assert.equal(next(s, { type: "change" }), s, `${join}: nothing to change`);
    assert.deepEqual(next(s, { type: "signOut" }), initialState(), `${join}: Not you? Sign out`);
  }
  const fresh = next(initialState(), { type: "restore", join: null, response: null, phone: "+447700900834" });
  assert.deepEqual([fresh.step, fresh.join, needsName(fresh)], ["answer", null, true]);
  const odd = next(initialState(), { type: "restore", join: "approved", response: null, phone: "+447700900834" });
  assert.deepEqual([odd.step, odd.join], ["answer", null], "only the three screens");
  // No longer signed in while answering: back to the number, with nothing of the request kept.
  const waiting = run([{ type: "restore", join: "waiting", response: "accepted", phone: "+447700900834" }, { type: "change" }, { type: "submit", name: "" }]);
  const refused = next(waiting, { type: "refused", error: null });
  assert.deepEqual([refused.step, refused.join, refused.response, refused.phone], ["confirm", null, null, null]);
});

test("open link: a waiting Can't go is drawn as the personal page's Can't go; Going, Maybe and none yet wait", () => {
  const back = (response, join = "waiting") => next(initialState(), { type: "restore", join, response, phone: "+447700900834" });
  // Coming back through my_join_request, a waiting request of declined is Can't go.
  assert.deepEqual(screenForReturn({ state: "open", member: null, request: { status: "waiting", response: "declined" } }), { join: "waiting", response: "declined" });
  assert.equal(openDoneScreen(back("declined")), "cantGo");
  for (const response of ["accepted", "maybe", null]) assert.equal(openDoneScreen(back(response)), "waiting", String(response));
  assert.equal(openDoneScreen(back(null, "notAdded")), "notAdded");
  assert.equal(openDoneScreen(back(null, "alreadyIn")), "alreadyIn");
  assert.equal(openDoneScreen(initialState()), null, "no last screen before the last step");
  // A fresh Can't go answer, still waiting, shows the same; it can change, and Going waits again.
  let s = run([{ type: "change" }, { type: "choose", response: "declined" }, { type: "submit", name: "" }], back("accepted"));
  s = next(s, { type: "answered", ...screenForRequest({ state: "waiting", response: "declined" }) });
  assert.deepEqual([s.step, openDoneScreen(s)], ["done", "cantGo"]);
  s = next(s, { type: "change" });
  assert.deepEqual([s.step, s.choice], ["answer", "declined"]);
  s = run([{ type: "choose", response: "accepted" }, { type: "submit", name: "" }, { type: "answered", join: "waiting", response: "accepted" }], s);
  assert.equal(openDoneScreen(s), "waiting");
  // A decided request is never Can't go, whatever its answer.
  assert.equal(openDoneScreen({ ...back(null, "notAdded"), response: "declined" }), "notAdded");
});

test("open link: right after verifying, a person who already asked or is on the event lands on that screen", () => {
  const atCode = run([{ type: "open" }, { type: "tick", ticked: true }, { type: "send", input: "07700 900834", country: "44" }, { type: "sent", at: 1 }, { type: "verify", code: "123456" }]);
  assert.deepEqual([atCode.step, atCode.busy], ["code", true]);
  // my_join_request after the code: waiting brings the stored answer back, ready to change, with no name to give.
  const waiting = next(atCode, { type: "verified", ...screenForReturn({ state: "open", member: null, request: { status: "waiting", response: "accepted" } }) });
  assert.deepEqual([waiting.step, waiting.busy, waiting.join, waiting.response, waiting.choice, waiting.code, waiting.phone], ["done", false, "waiting", "accepted", "accepted", "", "+447700900834"]);
  assert.equal(openDoneScreen(waiting), "waiting");
  const changing = next(waiting, { type: "change" });
  assert.deepEqual([changing.step, changing.choice, needsName(changing)], ["answer", "accepted", false]);
  const cant = next(atCode, { type: "verified", ...screenForReturn({ state: "open", member: null, request: { status: "waiting", response: "declined" } }) });
  assert.equal(openDoneScreen(cant), "cantGo");
  const notAdded = next(atCode, { type: "verified", ...screenForReturn({ state: "open", member: null, request: { status: "declined", response: "accepted" } }) });
  assert.deepEqual([notAdded.step, notAdded.join], ["done", "notAdded"]);
  const alreadyIn = next(atCode, { type: "verified", ...screenForReturn({ state: "open", member: "attendee", request: null }) });
  assert.deepEqual([alreadyIn.step, alreadyIn.join], ["done", "alreadyIn"]);
  // No request (or a lookup that couldn't tell): the answer step, with the name, as on the personal page.
  for (const event of [{ type: "verified", ...screenForReturn({ state: "open", member: null, request: null }) }, { type: "verified" }]) {
    const fresh = next(atCode, event);
    assert.deepEqual([fresh.step, fresh.join, fresh.response, needsName(fresh)], ["answer", null, null, true], JSON.stringify(event));
  }
  assert.equal(next(atCode, { type: "verified", join: "approved" }).step, "answer", "only the three screens");
});

test("needsName: a first answer needs a name; a changed answer or a waiting request doesn't", () => {
  assert.equal(needsName(initialState()), true);
  assert.equal(needsName({ ...initialState(), response: "accepted" }), false);
  assert.equal(needsName({ ...initialState(), join: "waiting" }), false);
  assert.equal(endingOf("+447700900834"), "34");
  assert.equal(endingOf("447700900834"), "34");
  assert.equal(endingOf(null), "");
  assert.equal(endingOf("+4"), "");
});

/** A localStorage stand-in with the methods the page uses. */
function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}
const CODE_A = "k7Qx9AbCdEfGhIjKlMnOpQ";
const CODE_B = "OtherCodeOtherCodeOthe";
const NOW = Date.parse("2099-11-01T12:00:00Z");
const STARTS = Date.parse("2099-11-02T13:00:00Z");
const session = (phone) => ({ access_token: `a-${phone}`, refresh_token: `r-${phone}`, expires_at: NOW / 1000 + 3600, phone });

test("the kept session is per code, with the full verified number, until the event starts", () => {
  const storage = memoryStorage();
  assert.equal(keptKey(CODE_A), `${KEPT_PREFIX}${CODE_A}`);
  assert.ok(writeKept(storage, CODE_A, keptEntry(session("+447700900834"), "+447700900834", STARTS)));
  assert.deepEqual(JSON.parse(storage.getItem(keptKey(CODE_A))), {
    session: session("+447700900834"),
    phone: "+447700900834",
    until: STARTS,
  });
  assert.deepEqual(readKept(storage, CODE_A, NOW)?.session, session("+447700900834"));
  // Another invitation's page finds nothing of it.
  assert.equal(readKept(storage, CODE_B, NOW), null);
  assert.ok(storage.getItem(keptKey(CODE_A)), "and leaves it alone");
  // Once the event has started, it is dropped.
  assert.equal(readKept(storage, CODE_A, STARTS), null);
  assert.equal(storage.getItem(keptKey(CODE_A)), null);
  // Storage that refuses keeps nothing and says so.
  const refusing = { ...memoryStorage(), setItem() { throw Error("quota"); } };
  assert.equal(writeKept(refusing, CODE_A, keptEntry(session("+447700900834"), "+447700900834", STARTS)), false);
});

test("a kept session for another number is not restored, even with the same last two digits", () => {
  const storage = memoryStorage();
  // The session holds +447700900534; this page verified +447700900834 for the code.
  writeKept(storage, CODE_A, keptEntry(session("+447700900534"), "+447700900834", STARTS));
  assert.equal(readKept(storage, CODE_A, NOW), null);
  assert.equal(storage.getItem(keptKey(CODE_A)), null, "and it is dropped");
  assert.equal(sameNumber(session("+447700900834"), { phone: "+447700900834" }), true);
  assert.equal(sameNumber(session("447700900834"), { phone: "+44 7700 900834" }), true, "digits, however written");
  assert.equal(sameNumber(session("+447700900534"), { phone: "+447700900834" }), false);
  assert.equal(sameNumber(session(null), { phone: null }), false, "no number is never a match");
  // Without a known start the entry can't be dropped on time, so it is never restored.
  writeKept(storage, CODE_A, keptEntry(session("+447700900834"), "+447700900834", NaN));
  assert.equal(readKept(storage, CODE_A, NOW), null);
  // Malformed entries go too.
  storage.setItem(keptKey(CODE_A), "not json");
  assert.equal(readKept(storage, CODE_A, NOW), null);
  assert.equal(storage.getItem(keptKey(CODE_A)), null);
});

test("every kept entry whose event has started is swept, whatever its code", () => {
  const storage = memoryStorage({ "something.else": "kept" });
  writeKept(storage, CODE_A, keptEntry(session("+447700900834"), "+447700900834", NOW - 1));
  writeKept(storage, CODE_B, keptEntry(session("+447700900111"), "+447700900111", STARTS));
  storage.setItem(keptKey("BrokenBrokenBrokenBrok"), "{");
  assert.deepEqual(sweepKept(storage, NOW).sort(), ["BrokenBrokenBrokenBrok", CODE_A].sort());
  assert.deepEqual([...storage.map.keys()].sort(), ["something.else", keptKey(CODE_B)].sort());
  assert.deepEqual(sweepKept({ get length() { throw Error("blocked"); } }, NOW), []);
});

test("sign out clears this code's entry first, then posts a local logout with the token; its failure is ignored", async () => {
  const storage = memoryStorage();
  writeKept(storage, CODE_A, keptEntry(session("+447700900834"), "+447700900834", STARTS));
  writeKept(storage, CODE_B, keptEntry(session("+447700900111"), "+447700900111", STARTS));
  const posts = [];
  await signOutKept({
    storage,
    code: CODE_A,
    session: session("+447700900834"),
    post: async (path, body, token) => {
      posts.push({ path, body, token, cleared: storage.getItem(keptKey(CODE_A)) === null });
      throw Error("offline");
    },
  });
  assert.deepEqual(posts, [{ path: "/auth/v1/logout?scope=local", body: {}, token: "a-+447700900834", cleared: true }]);
  assert.equal(readKept(storage, CODE_A, NOW), null);
  assert.ok(readKept(storage, CODE_B, NOW), "another invitation's entry stays");
  // Without a session there is nothing to post.
  const none = [];
  await signOutKept({ storage, code: CODE_A, session: null, post: async (...a) => none.push(a) });
  assert.deepEqual(none, []);
});
