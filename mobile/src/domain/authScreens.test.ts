import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = fileURLToPath(new URL("../../", import.meta.url));
const source = (path: string) => readFileSync(join(mobile, path), "utf8");

test("the email sign-in screen keeps only the redirect to phone sign-up, with no sign-up steps (B11)", () => {
  const screen = source("app/auth/index.tsx");
  assert.ok(screen.includes('<Redirect href="/auth/phone" />'));
  for (const gone of ["RegistrationDetails", "skipOptionalDetails", "setDetails", "setStep", "step + 1"])
    assert.equal(screen.includes(gone), false, gone);
});

test("the auth flow never signs up by email and imports nothing from registration (B11)", () => {
  const flow = source("src/state/useAuthFlow.ts");
  for (const gone of ["signUp(", "registrationMetadata", "validateSignupStep", "validateDetails", "emptyRegistration", "validateRegistration"])
    assert.equal(flow.includes(gone), false, gone);
});
