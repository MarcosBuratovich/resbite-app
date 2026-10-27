import assert from "node:assert/strict";
import test from "node:test";
import { INVALID_PHONE, deviceRegion, formatPhone, parsePhone, phoneEnding, phoneVerified } from "./phone";

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
