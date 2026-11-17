import test from "node:test";
import assert from "node:assert/strict";
import { GUEST_COPY, TERMS_VERSION } from "./guestAccount";
import { TERMS_COPY, termsScreen } from "./termsCopy";

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
    TERMS_COPY.whatsNew[TERMS_VERSION],
    "This is the first full version of our Terms. It sets out our community rules, how we keep Resbite safe, how to complain or appeal, and what happens when you delete your account.",
  );
  // Section 3's text for later versions.
  assert.equal(TERMS_COPY.updatedHeading, "We’ve updated our Terms");
  assert.equal(TERMS_COPY.updatedLine, "To keep using Resbite, please accept the new version.");
  assert.equal(TERMS_COPY.continue, "Continue");
  assert.equal(TERMS_COPY.signOut, "Sign out");
  assert.equal(TERMS_COPY.changed, "Our Terms changed while you were reading. Please read them again.");
  assert.equal(TERMS_COPY.failed, "That didn’t go through. Check your connection and try again.");
  // The helper under an unticked box stays as it was.
  assert.equal(GUEST_COPY.ageHelper, "Resbite is for people aged 18 and over.");
  // Curly apostrophes only, in every line of the screen.
  const lines = Object.values(TERMS_COPY).flatMap((value) => (typeof value === "string" ? [value] : Object.values(value)));
  for (const line of [...lines, GUEST_COPY.tick, GUEST_COPY.terms, GUEST_COPY.tickHint]) assert.ok(!line.includes("'"), line);
});

test("the version the app was built with reads as the first full version; any other as an update", () => {
  // Each build says what its own version changes (community-rules-short.md section 3).
  assert.ok(TERMS_COPY.whatsNew[TERMS_VERSION], "the build's Terms version has its paragraph");
  assert.deepEqual(termsScreen(TERMS_VERSION), {
    heading: "Please accept our Terms",
    lines: [TERMS_COPY.intro, TERMS_COPY.whatsNew[TERMS_VERSION]],
  });
  // A version published after this build (decision 1: no new build needed): the generic heading and line, never the
  // paragraph about another version.
  for (const version of ["2099-01", "2027-06"]) {
    const screen = termsScreen(version);
    assert.deepEqual(screen, { heading: "We’ve updated our Terms", lines: ["To keep using Resbite, please accept the new version."] });
    assert.ok(!screen.lines.some((line) => line.includes("first full version")), version);
  }
  // Not a key of the map's prototype either.
  assert.equal(termsScreen("constructor").heading, "We’ve updated our Terms");
  assert.equal(termsScreen("__proto__").heading, "We’ve updated our Terms");
});
