import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHONE_COPY } from "./phoneCopy";

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

test("Apple's own button replaces the Apple chip on the three screens that offer it (B9)", () => {
  for (const path of ["app/auth/index.tsx", "app/auth/phone.tsx", "app/about-you.tsx"]) {
    const screen = source(path);
    assert.ok(screen.includes("<AppleButton"), path);
    assert.equal(screen.includes("AppleMark"), false, path);
    assert.equal(screen.includes("GUEST_COPY.apple}"), false, path);
    assert.equal(screen.includes('text="Continue with Apple"'), false, path);
  }
});

test("AppleButton follows Apple's rules: Continue, black, 44 points, no own colours (B9)", () => {
  const button = source("src/design/AppleButton.tsx");
  for (const need of ["AppleAuthenticationButtonType.CONTINUE", "AppleAuthenticationButtonStyle.BLACK", "cornerRadius={22}", "height: 44"])
    assert.ok(button.includes(need), need);
  for (const gone of ["backgroundColor", "borderRadius"]) assert.equal(button.includes(gone), false, gone);
});

test("every gate with Sign out also offers Delete my account, so an account that stops there can still delete (DEL-2)", () => {
  // An Apple, Google or email sign-up with no number stops at Add your number, and a phone account with no name at
  // About you: neither can reach Data & privacy, so each gate opens Delete account itself, as Accept your Terms does.
  for (const path of ["app/add-phone.tsx", "app/about-you.tsx", "app/accept-terms.tsx"]) {
    const screen = source(path);
    assert.ok(screen.includes("title={TERMS_COPY.deleteAccount}"), path);
    assert.ok(screen.includes('router.push("/delete-account")'), path);
  }
  assert.equal(source("app/add-phone.tsx").includes("There is no other exit"), false);
});

test("Add your number explains the number and promises it stays private (B10)", () => {
  assert.equal(PHONE_COPY.addBody, "Your friends find and invite you by your number.");
  assert.equal(PHONE_COPY.addPrivacy, "We never show your number to other people on Resbite.");
  assert.ok(source("app/add-phone.tsx").includes("PHONE_COPY.addPrivacy"));
});
