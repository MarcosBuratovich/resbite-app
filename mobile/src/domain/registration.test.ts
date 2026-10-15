import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyRegistration,
  validateDetails,
  registrationMetadata,
  skipOptionalDetails,
  validateSignupStep,
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

test("sign-up steps: step 0 checks the name and birth date only; step 1 checks every detail", () => {
  const now = new Date(2026, 9, 15);
  const named = { ...emptyRegistration, name: "Alex" };
  assert.equal(validateSignupStep(0, emptyRegistration, now), "Use a name between 1 and 80 characters.");
  assert.equal(validateSignupStep(0, { ...named, phone: "07700900123" }, now), null);
  assert.equal(
    validateSignupStep(0, { ...named, birthDate: "2023-02-29" }, now),
    "Choose a valid date of birth, from 1900 through today.",
  );
  assert.equal(
    validateSignupStep(1, { ...named, phone: "07700900123" }, now),
    "Include your country code, for example +44 7700 900123.",
  );
  assert.equal(validateSignupStep(1, { ...named, phone: "+44 7700 900123", city: "London", interests: ["Outdoors"] }, now), null);
});
test("sign-up Skip empties phone, city and interests and keeps the name and birth date", () => {
  const filled = { name: "Alex", birthDate: "2000-02-29", phone: "0770", city: "x".repeat(101), interests: ["Nope"] };
  const skipped = skipOptionalDetails(filled);
  assert.deepEqual(skipped, { name: "Alex", birthDate: "2000-02-29", phone: "", city: "", interests: [] });
  assert.equal(validateSignupStep(1, skipped, new Date(2026, 9, 15)), null);
});
