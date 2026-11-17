import test from "node:test";
import assert from "node:assert/strict";
import { GUEST_COPY } from "./guestAccount";
import { TERMS_COPY } from "./termsCopy";

test("the screen's and the tick's words", () => {
  assert.equal(TERMS_COPY.heading, "Please accept our Terms");
  assert.equal(TERMS_COPY.deleteAccount, "Delete my account");
  assert.equal(GUEST_COPY.tick, "I’m 18 or over and I accept the Terms of Use.");
  assert.equal(GUEST_COPY.terms, "Read the Terms of Use. Our Privacy Policy explains how we use your data.");
  assert.equal(GUEST_COPY.tickHint, "Confirms you’re 18 or over and accept the Terms of Use.");
  // Each document name appears whole in the line, so TermsLine can link it (B1).
  for (const name of ["Terms of Use", "Privacy Policy"]) assert.ok(GUEST_COPY.terms.includes(name));
});

test("the rest of the accept screen reads exactly (community-rules-short.md section 3, version 1.0)", () => {
  assert.equal(
    TERMS_COPY.intro,
    "To use Resbite, confirm that you’re 18 or over and accept our Terms of Use. They include our community rules.",
  );
  assert.equal(
    TERMS_COPY.whatsNew,
    "This is the first full version of our Terms. It sets out our community rules, how we keep Resbite safe, how to complain or appeal, and what happens when you delete your account.",
  );
  assert.equal(TERMS_COPY.continue, "Continue");
  assert.equal(TERMS_COPY.signOut, "Sign out");
  assert.equal(TERMS_COPY.changed, "Our Terms changed while you were reading. Please read them again.");
  assert.equal(TERMS_COPY.failed, "That didn’t go through. Check your connection and try again.");
  // The helper under an unticked box stays as it was.
  assert.equal(GUEST_COPY.ageHelper, "Resbite is for people aged 18 and over.");
  // Curly apostrophes only, in every line of the screen.
  for (const line of [...Object.values(TERMS_COPY), GUEST_COPY.tick, GUEST_COPY.terms, GUEST_COPY.tickHint])
    assert.ok(!line.includes("'"), line);
});
