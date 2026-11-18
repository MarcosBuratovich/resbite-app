import test from "node:test";
import assert from "node:assert/strict";
import {
  DELETION_COPY,
  PRIVACY_ADDRESS,
  deletionPhone,
  deletionProof,
  describeDeletionStatus,
  type DeletionAccount,
} from "./deletion";

const account = (over: Partial<DeletionAccount> = {}): DeletionAccount => ({
  providers: [],
  email: null,
  phone: null,
  phoneConfirmed: false,
  ...over,
});

test("the proof follows how the account signs in (ASR2-2)", () => {
  assert.equal(deletionProof(account({ providers: ["apple"] })), "apple");
  assert.equal(deletionProof(account({ providers: ["apple", "email"], email: "ana@example.invalid" })), "apple");
  assert.equal(deletionProof(account({ providers: ["email"], email: "ana@example.invalid" })), "email");
  assert.equal(
    deletionProof(account({ providers: ["google", "phone"], email: "ana@example.invalid", phone: "447700900301", phoneConfirmed: true })),
    "email",
  );
  assert.equal(deletionProof(account({ providers: ["phone"], phone: "447700900301", phoneConfirmed: true })), "phone");
  assert.equal(deletionProof(account({ providers: ["phone"], phone: "447700900301", phoneConfirmed: false })), null);
  assert.equal(deletionProof(account()), null);
});

test("deletionPhone sends to the sign-in form of the number", () => {
  const confirmed = (phone: string) => deletionPhone(account({ providers: ["phone"], phone, phoneConfirmed: true }));
  assert.equal(confirmed("447700900301"), "+447700900301");
  // Review Focus 3: Auth may hold the Argentine key or the 549 form; sign-in texts the 549 form.
  assert.equal(confirmed("541122334455"), "+5491122334455");
  assert.equal(confirmed("5491122334455"), "+5491122334455");
  assert.equal(deletionPhone(account({ providers: ["phone"], phone: "447700900301", phoneConfirmed: false })), null);
  assert.equal(deletionPhone(account({ providers: ["phone"], phone: null, phoneConfirmed: true })), null);
});

test("status lines", () => {
  const accepted =
    "We’ve accepted your request and closed your account. We finish deleting it within 30 days, usually in a few minutes. Check here to see when it’s done.";
  assert.equal(describeDeletionStatus("queued", true), accepted);
  assert.equal(describeDeletionStatus("processing", false), accepted);
  assert.equal(describeDeletionStatus("complete", false), "Your account is deleted. Copies in our backups are gone within 7 days.");
  assert.equal(
    describeDeletionStatus("not_found", true),
    "We can’t find a deletion request for this account. Confirm it’s you and try again.",
  );
  assert.equal(
    describeDeletionStatus("not_found", false),
    "We can’t find this request. We keep requests for 30 days after deletion is complete.",
  );
});

test("the copy is the agreed text", () => {
  assert.equal(PRIVACY_ADDRESS, "privacy@resbite.com");
  assert.equal(DELETION_COPY.intro, "Deleting your account closes it straight away, on every device.");
  assert.equal(DELETION_COPY.whatHappens, "What happens");
  assert.deepEqual(DELETION_COPY.sheet, [
    "Your access ends straight away, on every device. Your name and photo are removed, and your messages show as “Message deleted”.",
    "Resbites you host that haven’t happened yet are cancelled, and every guest is told. Weekly groups you host end. Co-hosts don’t take them over.",
    "You leave every resbite and group you joined. Your connections and blocks end. Reports you made stay with us, without your name, until we’ve dealt with them.",
    "We finish deleting your account within 30 days. Usually it takes a few minutes. Check here to see when it’s done.",
    "We keep a few records for a limited time, such as reports about you and a receipt so you can check the deletion. Our Delete your account page explains what we keep and for how long.",
    "Deleting the app or signing out doesn’t delete your account. Copies other people made can’t be deleted.",
  ]);
  assert.equal(DELETION_COPY.proveHeading, "Confirm it’s you");
  assert.equal(DELETION_COPY.typeHeading, "Type DELETE");
  assert.equal(DELETION_COPY.typeField, "Type DELETE to confirm");
  assert.equal(DELETION_COPY.cannotUndo, "Once we accept your request, it can’t be undone.");
  assert.equal(DELETION_COPY.phoneBody("+44 7700 900301"), "We’ll text a code to +44 7700 900301.");
  assert.equal(DELETION_COPY.emailBody("ana@example.invalid"), "We’ll email a code to ana@example.invalid.");
  assert.equal(DELETION_COPY.appleBody, "Type DELETE, then confirm with Apple.");
  assert.equal(DELETION_COPY.sendCode, "Send code");
  assert.equal(DELETION_COPY.phoneCodeField, "Code from the text");
  assert.equal(DELETION_COPY.emailCodeField, "Code from the email");
  assert.equal(DELETION_COPY.phoneSent("+44 7700 900301"), "We sent a 6-digit code to +44 7700 900301.");
  assert.equal(DELETION_COPY.emailSent, "Check your email for the code.");
  assert.equal(DELETION_COPY.passwordField, "Current password");
  assert.equal(DELETION_COPY.usePassword, "Use my password instead");
  assert.equal(DELETION_COPY.useEmailCode, "Use an email code instead");
  assert.equal(DELETION_COPY.delete, "Permanently delete account");
  assert.equal(DELETION_COPY.retry, "Try again");
  assert.equal(DELETION_COPY.appleHint, "Signs in with Apple again, then permanently deletes your account.");
  assert.equal(
    DELETION_COPY.noProof,
    "We can’t confirm it’s you in the app. Email privacy@resbite.com and we’ll delete your account for you.",
  );
  assert.equal(DELETION_COPY.unavailable, "To delete your account, email privacy@resbite.com.");
  assert.equal(DELETION_COPY.preview, "You’re exploring the design. Preview can’t delete a real account.");
  assert.equal(DELETION_COPY.savedReceipt, "A deletion request from this iPhone is saved. Check its progress below.");
  assert.equal(DELETION_COPY.check, "Check deletion status");
});

test("no copy faces a user with beta or build wording", () => {
  const strings = Object.values(DELETION_COPY).flatMap((value): string[] =>
    typeof value === "string" ? [value] : typeof value === "function" ? [value("x")] : [...value],
  );
  const statuses = (["not_found", "queued", "processing", "complete"] as const).flatMap((status) => [
    describeDeletionStatus(status, true),
    describeDeletionStatus(status, false),
  ]);
  assert.ok(strings.length >= 30);
  for (const text of [...strings, ...statuses]) assert.doesNotMatch(text, /beta|build|development|configured/i);
});
