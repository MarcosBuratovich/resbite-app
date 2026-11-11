import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canPick, contactNumbers, hostRegion, inviteMessage, messageFor, newInviteCode, personalLink, pickChosen, pickToggled, sendOrder, smsUrl, userToggled, whatsappUrl, whatsappAppUrl, groupContacts, storedFor, storedEntry, inviteItems, usersToInvite, type ContactNumber } from "./contactInvites";
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
  assert.ok(numbers.every((n) => n.key === n.e164.replace(/\D/g, "")));
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

test("numbers of one contact share a contact key; two contacts with one name stay apart", () => {
  const { numbers } = contactNumbers(
    [
      { fullName: "Sam", phones: [{ number: "07700 900834" }, { number: "07700 900111" }] },
      { fullName: "Sam", phones: [{ number: "07700 900222" }] },
    ],
    "GB",
  );
  const groups = groupContacts(numbers);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.numbers.length).sort(), [1, 2]);
  assert.ok(groups.every((g) => g.numbers.every((n) => n.contact === g.contact)));
});

test("whatsappAppUrl opens the app with the digits and the encoded text", () => {
  assert.equal(whatsappAppUrl("+447700900834", "a b&c"), "whatsapp://send?phone=447700900834&text=a%20b%26c");
});

test("Send again offers both ways, the one used last first", () => {
  assert.deepEqual(sendOrder("messages"), ["messages", "whatsapp"]);
  assert.deepEqual(sendOrder("whatsapp"), ["whatsapp", "messages"]);
  assert.deepEqual(sendOrder(undefined), ["whatsapp", "messages"]);
  assert.deepEqual(sendOrder(null), ["whatsapp", "messages"]);
});

test("the Invited row's controls are named for the person and the app", () => {
  assert.equal(INVITE_COPY.resendVia("WhatsApp", "Ben Ito"), "Send again on WhatsApp: Ben Ito");
  assert.equal(INVITE_COPY.resendHint("Messages", "Ben Ito"), "Opens Messages with Ben Ito’s link");
});

test("two spellings of one Argentine mobile are one contact, shown with the 9", () => {
  const { numbers, skipped } = contactNumbers(
    [{ fullName: "Juan", phones: [{ number: "+54 11 1234 1234" }] }, { fullName: "Juan C", phones: [{ number: "+54 9 11 1234 1234" }] },
     { fullName: "Local", phones: [{ number: "011 15 1234 1234" }] }],
    "AR",
  );
  assert.equal(skipped, 0);
  assert.equal(numbers.length, 1);
  assert.equal(numbers[0].key, "541112341234");
  assert.equal(numbers[0].e164, "+5491112341234");
  assert.equal(numbers[0].label, "+54 9 11 1234 1234");
  assert.equal(numbers[0].country, "54");
  assert.equal(numbers[0].name, "Juan");
});
test("a contact without a code takes the host's region; one with + keeps its own", () => {
  const { numbers } = contactNumbers([{ fullName: "Kate", phones: [{ number: "305 555 0123" }, { number: "+1 305 555 0124" }] }], "AR");
  assert.deepEqual(numbers.map((n) => n.e164), ["+13055550124", "+5493055550123"]);
});
test("hostRegion reads an Argentine host's number with or without the 9", () => {
  assert.equal(hostRegion("5491112341234", "GB"), "AR");
  assert.equal(hostRegion("541112341234", "GB"), "AR");
});

test("storedFor finds a saved code by the exact send form, else by key under the 9-less spelling", () => {
  const stored = { "+5491112341234": "exact", "+541198765432": "old" };
  assert.equal(storedFor(stored, "+5491112341234"), "exact");
  assert.equal(storedFor(stored, "+5491198765432"), "old");
  assert.equal(storedFor(stored, "+447700900111"), undefined);
});

test("storedEntry also names the key a code is saved under, so it can be forgotten", () => {
  const stored = { "+5491112341234": "exact", "+541198765432": "old" };
  assert.deepEqual(storedEntry(stored, "+5491112341234"), { key: "+5491112341234", value: "exact" });
  assert.deepEqual(storedEntry(stored, "+5491198765432"), { key: "+541198765432", value: "old" });
  assert.equal(storedEntry(stored, "+447700900111"), undefined);
});

test("inviteItems: one phone item per number (the first pick wins), each with its code, and the connections apart", () => {
  const { numbers } = contactNumbers(
    [
      { fullName: "Ben Ito", phones: [{ number: "+44 7700 900456" }] },
      { fullName: "Cy Okafor", phones: [{ number: "+44 7700 900789" }] },
    ],
    "GB",
  );
  const [ben, cy] = numbers;
  // A typed number equal to a contact's has a pick of its own: the same key twice.
  const typed = { ...ben, contact: "typed", name: "Ben" };
  const items = inviteItems([ben, cy, typed], new Set(["u-marta", "u-sofia"]), new Set(), (n) => `code-${n.name}`);
  assert.deepEqual(items.numbers, [ben, cy]);
  assert.deepEqual(items.phones, [
    { phone: "447700900456", country: "44", code: "code-Ben Ito" },
    { phone: "447700900789", country: "44", code: "code-Cy Okafor" },
  ]);
  assert.deepEqual(items.users, [{ user: "u-marta" }, { user: "u-sofia" }]);
});

test("inviteItems leaves out a chosen connection already on the resbite", () => {
  const items = inviteItems([], new Set(["u-marta", "u-lucas"]), new Set(["u-lucas", "u-owner"]), () => "x");
  assert.deepEqual(items, { numbers: [], phones: [], users: [{ user: "u-marta" }] });
  assert.deepEqual(usersToInvite(new Set(["u-lucas"]), new Set(["u-lucas"])), []);
  assert.deepEqual(usersToInvite(new Set(["u-sofia", "u-marta"]), new Set()), [{ user: "u-sofia" }, { user: "u-marta" }]);
});

const LINK = "https://link.resbite.com/i/abc";

test("a bringer's message names who invited and whose resbite it is (CO-P9); without an inviter, the host's", () => {
  assert.equal(
    inviteMessage({ inviter: "Pedro", host: "Ana", title: "Board game night", when: "Thu 20 Nov 19:00", link: LINK }),
    `Pedro invited you to Ana’s Board game night, Thu 20 Nov 19:00. Reply here: ${LINK}`,
  );
  assert.equal(
    inviteMessage({ host: "Ana", title: "Board game night", when: "Thu 20 Nov 19:00", link: LINK }),
    `Ana invited you to Board game night, Thu 20 Nov 19:00. Reply here: ${LINK}`,
  );
});

test("canPick: under the limit, a replacement, or no limit", () => {
  assert.equal(canPick(3, 3, false), false);
  assert.equal(canPick(3, 3, true), true);
  assert.equal(canPick(2, 3, false), true);
  assert.equal(canPick(9, undefined, false), true);
  assert.equal(canPick(1, 0, false), false);
  assert.equal(canPick(0, 0, false), false);
});

const [ben, ben2, cy] = contactNumbers(
  [
    { fullName: "Ben Ito", phones: [{ number: "+44 7700 900456" }, { number: "+44 7700 900457" }] },
    { fullName: "Cy Okafor", phones: [{ number: "+44 7700 900789" }] },
  ],
  "GB",
).numbers;
const picks = (...numbers: ContactNumber[]) => Object.fromEntries(numbers.map((n) => [n.contact, n]));

test("the cap on numbers: at the limit a new contact isn't picked; clearing and switching a contact's number still work", () => {
  assert.equal(ben.contact, ben2.contact, "two numbers of one contact");
  const one = picks(ben);
  // Bring mode with one invite left: Ben is picked, so Cy can't be.
  assert.equal(pickToggled(one, cy, 0, 1), one, "the same object: nothing changes");
  assert.equal(pickChosen(one, cy, 0, 1), one);
  // Ben's other number replaces his first: no extra invite.
  assert.deepEqual(pickToggled(one, ben2, 0, 1), picks(ben2));
  assert.deepEqual(pickChosen(one, ben2, 0, 1), picks(ben2));
  // Tapping Ben's picked number clears it, whatever the cap.
  assert.deepEqual(pickToggled(one, ben, 0, 1), {});
  assert.deepEqual(pickToggled({}, cy, 0, 1), picks(cy));
  // No limit (a host): as before.
  assert.deepEqual(pickToggled(one, cy, 5, undefined), picks(ben, cy));
  assert.deepEqual(pickChosen(one, cy, 5, undefined), picks(ben, cy));
});

test("the cap counts numbers and connections together (inviteCount)", () => {
  // One connection picked, one invite: no number can be picked.
  assert.deepEqual(pickToggled({}, cy, 1, 1), {});
  const none = {};
  assert.equal(pickChosen(none, cy, 1, 1), none);
  assert.deepEqual(pickToggled({}, cy, 1, 2), picks(cy));
  // One number picked, one invite: no connection can be picked; one can be cleared.
  const chosen = new Set<string>();
  assert.equal(userToggled(chosen, "u-marta", new Set(), 1, 1), chosen);
  assert.deepEqual([...userToggled(new Set(["u-marta"]), "u-marta", new Set(), 1, 1)], []);
  assert.deepEqual([...userToggled(new Set(["u-marta"]), "u-sofia", new Set(), 0, 2)], ["u-marta", "u-sofia"]);
  assert.deepEqual([...userToggled(new Set(["u-marta"]), "u-sofia", new Set(), 1, 2)], ["u-marta"]);
  // A chosen connection already on the resbite isn't invited, so it isn't counted.
  assert.deepEqual([...userToggled(new Set(["u-lucas"]), "u-sofia", new Set(["u-lucas"]), 0, 1)], ["u-lucas", "u-sofia"]);
  // Someone on the resbite can't be picked, cap or not.
  const empty = new Set<string>();
  assert.equal(userToggled(empty, "u-lucas", new Set(["u-lucas"]), 0, undefined), empty);
  assert.deepEqual([...userToggled(new Set(["u-marta", "u-sofia"]), "u-ines", new Set(), 4, undefined)], ["u-marta", "u-sofia", "u-ines"]);
});

test("the four pick functions of useContactInvites go through the cap helpers, and invite() is unchanged", () => {
  const source = readFileSync(new URL("../state/useContactInvites.ts", import.meta.url), "utf8");
  const body = (name: string) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} is defined`);
    return source.slice(start, source.indexOf("\n  }\n", start));
  };
  assert.match(body("toggle"), /pickToggled\(old, n, usersCount, limit\)/);
  assert.match(body("choose"), /pickChosen\(old, n, usersCount, limit\)/);
  assert.match(body("addNumber"), /pickChosen\(old, n, usersCount, limit\)/);
  assert.match(body("toggleUser"), /userToggled\(old, userId, invitedUsers, numbersCount, limit\)/);
  assert.doesNotMatch(body("invite"), /limit|canPick/);
});

test("the personal link's message: a host's own name, or a bringer's first name and the organizer's", () => {
  const at = { title: "Board game night", when: "Thu 20 Nov 19:00" };
  assert.deepEqual(messageFor({ own: "Marcos Buratovich", ...at }), { host: "Marcos Buratovich", ...at });
  assert.deepEqual(messageFor({ own: null, ...at }), { host: INVITE_COPY.hostFallback, ...at });
  assert.deepEqual(messageFor({ own: "  Pedro Gómez ", organizer: "Ana", ...at }), { inviter: "Pedro", host: "Ana", ...at });
  // Without their own name, a bringer's message still names the organizer, never "Your host".
  assert.deepEqual(messageFor({ own: null, organizer: "Ana", ...at }), { host: "Ana", ...at });
  assert.equal(
    inviteMessage({ ...messageFor({ own: "Pedro Gómez", organizer: "Ana", ...at }), link: LINK }),
    `Pedro invited you to Ana’s Board game night, Thu 20 Nov 19:00. Reply here: ${LINK}`,
  );
});

test("Send again (useResend) words a bringer's message with the organizer it is given, and a host's as before", () => {
  const source = readFileSync(new URL("../state/useResend.ts", import.meta.url), "utf8");
  assert.match(source, /bringing\?: \{ organizer: string \}/);
  assert.match(source, /message: messageFor\(\{ own, organizer: bringing\?\.organizer,/);
  assert.doesNotMatch(source, /host: host \?\? INVITE_COPY\.hostFallback/);
});
