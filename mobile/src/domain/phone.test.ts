import assert from "node:assert/strict";
import test from "node:test";
import { INVALID_PHONE, deviceRegion, formatPhone, parsePhone, phoneEnding, phoneKey, phoneSendForm, phoneVerified, regionForCallingCode, regionOf, samePhone } from "./phone";

test("numbers parse to E.164, including the UK fiction range", () => {
  assert.deepEqual(parsePhone("07700 900834", "GB"), { ok: true, e164: "+447700900834" });
  assert.deepEqual(parsePhone("+44 7700 900001", "AR"), { ok: true, e164: "+447700900001" });
  assert.deepEqual(parsePhone("(020) 7946 0018", "GB"), { ok: true, e164: "+442079460018" });
  assert.deepEqual(parsePhone("+1 (415) 555-2671", "GB"), { ok: true, e164: "+14155552671" });
  assert.deepEqual(parsePhone("011 15 2345-6789", "AR"), { ok: true, e164: "+5491123456789" });
});

test("junk is not a number", () => {
  for (const input of ["12", "", "abc"]) {
    assert.deepEqual(parsePhone(input, "GB"), { ok: false, message: INVALID_PHONE });
  }
  assert.equal(INVALID_PHONE, "Enter a valid mobile number.");
});

test("device region comes from the locale", () => {
  assert.equal(deviceRegion("en-GB"), "GB");
  assert.equal(deviceRegion("es-AR"), "AR");
  assert.equal(deviceRegion("en"), "GB");
});

test("format and ending", () => {
  assert.equal(formatPhone("+447700900834"), "+44 7700 900834");
  assert.equal(formatPhone("447700900834"), "+44 7700 900834");
  assert.equal(phoneEnding("+447700900834"), "34");
});

test("verified needs a phone and its confirmation", () => {
  assert.equal(phoneVerified({ phone: "447700900834", phone_confirmed_at: "2026-10-27T10:00:00Z" }), true);
  assert.equal(phoneVerified({ phone: "447700900834" }), false);
  assert.equal(phoneVerified({ phone: "", phone_confirmed_at: "2026-10-27T10:00:00Z" }), false);
  assert.equal(phoneVerified({ phone: null, phone_confirmed_at: null }), false);
  assert.equal(phoneVerified(null), false);
});

test("same phone compares digits, so stored digits match E.164", () => {
  assert.equal(samePhone("447700900834", "+447700900834"), true);
  assert.equal(samePhone("+44 7700 900834", "+447700900834"), true);
  assert.equal(samePhone("447700900999", "+447700900834"), false);
  assert.equal(samePhone("", ""), false);
  assert.equal(samePhone(null, "+447700900834"), false);
  assert.equal(samePhone(undefined, undefined), false);
});

test("the phone key folds the Argentine mobile 9 and nothing else", () => {
  const rows: [string | null, string][] = [
    ["+5491112341234", "541112341234"], ["+541112341234", "541112341234"], ["5491112341234", "541112341234"],
    ["+54 9 11 1234 1234", "541112341234"], ["+5493511234567", "543511234567"], ["+13055550123", "13055550123"],
    ["+447700900834", "447700900834"], ["549123456789", "549123456789"], [null, ""], ["abc", ""],
  ];
  for (const [input, key] of rows) assert.equal(phoneKey(input), key, String(input));
});

test("the send form puts the 9 back", () => {
  assert.equal(phoneSendForm("541112341234"), "+5491112341234");
  assert.equal(phoneSendForm("+541112341234"), "+5491112341234");
  assert.equal(phoneSendForm("+5491112341234"), "+5491112341234");
  assert.equal(phoneSendForm("+447700900834"), "+447700900834");
  assert.equal(phoneSendForm("13055550123"), "+13055550123");
});

test("samePhone and formatPhone go through the key and the send form", () => {
  assert.equal(samePhone("541112341234", "+5491112341234"), true);
  assert.equal(samePhone("5491112341234", "+54 11 1234 1234"), true);
  assert.equal(samePhone("447700900834", "+447700900835"), false);
  assert.equal(formatPhone("+541112341234"), "+54 9 11 1234 1234");
  assert.equal(formatPhone("541112341234"), "+54 9 11 1234 1234");
});

test("a calling code maps to its main country, a number to its own", () => {
  assert.equal(regionForCallingCode("1"), "US");
  assert.equal(regionForCallingCode("44"), "GB");
  assert.equal(regionForCallingCode("54"), "AR");
  assert.equal(regionForCallingCode("999"), null);
  assert.equal(regionOf("+13055550123"), "US");
  assert.equal(regionOf("+447700900834"), "GB"); // fiction range: no country, so the code's main one
});
