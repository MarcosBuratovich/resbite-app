import assert from "node:assert/strict";
import test from "node:test";
import { contactNumbers, hostRegion, inviteMessage, newInviteCode, personalLink, smsUrl, whatsappUrl } from "./contactInvites";
import { INVITE_COPY } from "./inviteCopy";

test("contactNumbers gives one entry per distinct number and counts the unparseable", () => {
  const { numbers, skipped } = contactNumbers(
    [
      { fullName: "Sam", phones: [{ number: "07700 900834" }, { number: "+44 7700 900111" }] },
      { fullName: "Samuel", phones: [{ number: "+447700900834" }] },
      { fullName: "", phones: [{ number: "07700 900222" }] },
      { fullName: "Bad", phones: [{ number: "12" }] },
    ],
    "GB",
  );
  assert.equal(skipped, 1);
  assert.equal(numbers.length, 3);
  assert.deepEqual(new Set(numbers.map((n) => n.e164)).size, 3);
  assert.deepEqual(numbers.filter((n) => n.name === "Sam").map((n) => n.e164).sort(), ["+447700900111", "+447700900834"]);
  assert.ok(numbers.every((n) => n.key === n.e164));
});

test("contactNumbers reads local formats with the host region", () => {
  const { numbers } = contactNumbers([{ fullName: "Ana", phones: [{ number: "07700 900834" }] }], "GB");
  assert.equal(numbers[0].e164, "+447700900834");
  assert.equal(numbers[0].country, "44");
  assert.equal(numbers[0].label, "+44 7700 900834");
});

test("contactNumbers sorts by name", () => {
  const { numbers } = contactNumbers(
    [
      { fullName: "Zed", phones: [{ number: "+447700900111" }] },
      { fullName: "Ana", phones: [{ number: "+447700900222" }] },
    ],
    "GB",
  );
  assert.deepEqual(numbers.map((n) => n.name), ["Ana", "Zed"]);
});

test("hostRegion uses the country of the host's own phone", () => {
  assert.equal(hostRegion("447700900834", "AR"), "GB");
  assert.equal(hostRegion(null, "AR"), "AR");
  assert.equal(hostRegion("", "AR"), "AR");
});

test("newInviteCode is 22 characters of base64url", () => {
  const bytes = Uint8Array.from({ length: 16 }, (_, i) => 250 - i * 7);
  assert.match(newInviteCode(bytes), /^[A-Za-z0-9_-]{22}$/);
  assert.equal(newInviteCode(new Uint8Array(16).fill(255)), "_____________________w");
});

test("links and messages", () => {
  assert.equal(personalLink("https://resbite.app", "abc"), "https://resbite.app/i/abc");
  assert.equal(
    inviteMessage({ host: "Marcos", title: "Dinner", when: "Fri 8pm", link: "https://x/i/a" }),
    "Marcos invited you to Dinner, Fri 8pm. Reply here: https://x/i/a",
  );
  assert.equal(whatsappUrl("+447700900834", "a b"), "https://wa.me/447700900834?text=a%20b");
  assert.equal(smsUrl("+447700900834", "a b"), "sms:+447700900834&body=a%20b");
  assert.equal(smsUrl("+447700900834", "a b", "android"), "sms:+447700900834?body=a%20b");
});

test("invitedInApp joins names", () => {
  assert.equal(INVITE_COPY.invitedInApp(["Ana"]), "Ana is invited. They’ll see it in Resbite.");
  assert.equal(INVITE_COPY.invitedInApp(["Ana", "Leo"]), "Ana and Leo are invited. They’ll see it in Resbite.");
  assert.equal(INVITE_COPY.invitedInApp(["Ana", "Leo", "Mia"]), "Ana, Leo and Mia are invited. They’ll see it in Resbite.");
});
