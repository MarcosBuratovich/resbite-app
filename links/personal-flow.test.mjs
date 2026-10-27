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
