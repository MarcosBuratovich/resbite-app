import test from "node:test";
import assert from "node:assert/strict";
import {
  accessState,
  accessTitles,
  authTitle,
  callbackTitle,
  formatMinutes,
  introSlides,
  permissionChip,
  signupTitles,
  wellnessSample,
} from "./accountCopy.ts";
import { notificationDelivery, permissionCopy, reminderCopy } from "./notifications.ts";

test("sign-in headings: one per mode and sign-up step, three words or fewer", () => {
  assert.equal(authTitle("login", 0, ""), "Welcome back");
  assert.equal(authTitle("reset", 0, ""), "Reset password");
  assert.equal(authTitle("confirm", 0, ""), "Confirm your email");
  assert.equal(authTitle("confirm", 0, "a@example.invalid"), "Check your inbox");
  assert.deepEqual([0, 1, 2].map((step) => authTitle("register", step, "")), ["Your name?", "About you", "Your account"]);
  // Out-of-range steps clamp instead of throwing or returning undefined.
  assert.equal(authTitle("register", -1, ""), "Your name?");
  assert.equal(authTitle("register", 7, ""), "Your account");
  for (const title of [...signupTitles, "Welcome back", "Reset password", "Check your inbox", "Confirm your email"])
    assert.ok(title.split(" ").length <= 3, title);
});

test("account access check: checking wins, then the status; any other status is waiting", () => {
  assert.equal(accessState(true, "unconfirmed"), "checking");
  assert.equal(accessState(false, "unconfirmed"), "unconfirmed");
  assert.equal(accessState(false, "error"), "error");
  assert.equal(accessState(false, "access_pending"), "pending");
  assert.deepEqual(accessTitles, {
    checking: "Checking your account",
    unconfirmed: "Confirm your email",
    error: "Let’s try again",
    pending: "Waiting for access",
  });
});

test("notifications: the permission chip shows the permission's title, or checking and failure", () => {
  assert.equal(permissionChip("preview", false), "Design preview");
  assert.equal(permissionChip("denied", true), "Permission is off");
  assert.equal(permissionChip(null, true), "Checking permission…");
  assert.equal(permissionChip(null, false), "Couldn’t check permission");
});

test("UX3 notifications wording: reminders use the permission, updates aren’t active yet", () => {
  // The titles keep their UX4 wording; the details no longer say there's nothing to enable.
  assert.deepEqual(
    Object.fromEntries(Object.entries(permissionCopy).map(([key, copy]) => [key, copy.title])),
    {
      undetermined: "Not requested",
      denied: "Permission is off",
      granted: "Permission is allowed",
      provisional: "Quiet permission",
      ephemeral: "Temporary permission",
      unknown: "Permission unavailable",
      preview: "Design preview",
      unsupported: "Available in the mobile app",
    },
  );
  assert.equal(permissionCopy.undetermined.detail, "Resbite asks the first time it can set a reminder.");
  assert.equal(
    permissionCopy.denied.detail,
    "Turn notifications on in Settings to get reminders. Updates aren’t active yet.",
  );
  assert.equal(permissionCopy.granted.detail, "Reminders can reach you. Updates aren’t active yet.");
  assert.equal(permissionCopy.provisional.detail, "Reminders arrive quietly. Updates aren’t active yet.");
  assert.equal(
    permissionCopy.ephemeral.detail,
    "Reminders can reach you for now. Updates aren’t active yet.",
  );
  for (const copy of Object.values(permissionCopy)) {
    assert.ok(!copy.detail.includes("nothing you need to enable"), copy.detail);
    assert.ok(!copy.detail.includes("Delivery is still unavailable"), copy.detail);
    assert.ok(!copy.detail.includes("'"), "Curly apostrophes only");
  }
  assert.equal(reminderCopy.line, "1 day and 1 hour before resbites you’re going to, or might. Set on this phone.");
  assert.match(reminderCopy.about, /it may still arrive at the old time\.$/);
  // Server sending follows EXPO_PUBLIC_PUSH_ENABLED (Plan 4), unset in tests.
  assert.equal(notificationDelivery.enabled, false);
});

test("email-link page headings", () => {
  assert.equal(callbackTitle(true, false), "New password");
  assert.equal(callbackTitle(false, true), "Let’s try again");
  assert.equal(callbackTitle(false, false), "Confirming…");
  assert.equal(callbackTitle(true, true), "New password");
});

test("introduction: three slides with two-word titles and one line each", () => {
  assert.equal(introSlides.length, 3);
  for (const slide of introSlides) {
    assert.equal(slide.title.split(" ").length, 2, slide.title);
    assert.ok(slide.line.length > 0 && !slide.line.includes("\n"), slide.title);
  }
});

test("Wellness sample: approved categories, today's minutes, 2h 30m in total", () => {
  assert.deepEqual(
    wellnessSample.map((row) => [row.category, row.minutes]),
    [
      ["creative", 60],
      ["physical", 60],
      ["community", 30],
    ],
  );
  assert.equal(formatMinutes(wellnessSample.reduce((sum, row) => sum + row.minutes, 0)), "2h 30m");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(180), "3h");
  assert.equal(formatMinutes(0), "0m");
});
