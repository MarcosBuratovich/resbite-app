import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyRegistration,
  validateDetails,
  registrationMetadata,
} from "./registration";
test("registration requires a name but allows additional fields to be skipped", () => {
  assert.ok(validateDetails(emptyRegistration));
  assert.equal(validateDetails({ ...emptyRegistration, name: "Alex" }), null);
});
test("birth date rejects impossible and future dates while accepting leap day", () => {
  const now = new Date(2026, 8, 18);
  for (const birthDate of ["2023-02-29", "2026-09-19", "1899-01-01", "invalid"])
    assert.ok(
      validateDetails({ ...emptyRegistration, name: "Alex", birthDate }, now),
    );
  assert.equal(
    validateDetails(
      { ...emptyRegistration, name: "Alex", birthDate: "2000-02-29" },
      now,
    ),
    null,
  );
});
test("phone requires explicit country code; metadata excludes credentials and preserves choices", () => {
  assert.ok(
    validateDetails({
      ...emptyRegistration,
      name: "Alex",
      phone: "07700900123",
    }),
  );
  const details = {
    ...emptyRegistration,
    name: " Alex ",
    phone: "+44 7700 900123",
    city: " London ",
    interests: ["Outdoors"],
  };
  assert.equal(validateDetails(details), null);
  assert.deepEqual(registrationMetadata(details), {
    display_name: "Alex",
    registration_details: {
      birth_date: null,
      phone: "+447700900123",
      city: "London",
      interests: ["Outdoors"],
    },
  });
});
