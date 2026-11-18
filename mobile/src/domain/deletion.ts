import { PRIVACY_ADDRESS } from "./legal";
import { phoneSendForm } from "./phone";

// Account deletion's words and its proof rule (B3, ASR2-2). Pure: no React Native import, so it runs under node.

/** Plan 3 owns the address (legal.ts); it is re-exported here for the deletion screen. */
export { PRIVACY_ADDRESS };

/** How the person confirms it is them before deleting. */
export type DeletionProof = "apple" | "email" | "phone";
/** What the session tells about the account: `app_metadata.providers`, `email`, `phone` and whether the phone is confirmed. */
export type DeletionAccount = {
  providers: readonly string[];
  email: string | null;
  phone: string | null;
  phoneConfirmed: boolean;
};

/**
 * ASR2-2: Apple when Apple is linked, since it is also the only way to get the code that revokes Apple's tokens. Otherwise
 * an email code for an account with an email (an email or Google account). Otherwise an SMS code to a confirmed number.
 * Otherwise `null`: the account can't prove itself in the app and writes to the privacy address.
 */
export function deletionProof(a: DeletionAccount): DeletionProof | null {
  if (a.providers.includes("apple")) return "apple";
  if (a.email) return "email";
  if (a.phone && a.phoneConfirmed) return "phone";
  return null;
}

/**
 * The number the deletion code goes to: the form sign-in sends to (Review Focus 3). Auth may hold an Argentine mobile
 * as the key `54…` or as `549…`; both give `+549…`. `null` when there is no confirmed number.
 */
export function deletionPhone(a: DeletionAccount): string | null {
  return a.phone && a.phoneConfirmed ? phoneSendForm(a.phone) : null;
}

export const DELETION_COPY = {
  intro: "Deleting your account closes it straight away, on every device.",
  whatHappens: "What happens",
  sheet: [
    "Your access ends straight away, on every device. Your name and photo are removed, and your messages show as “Message deleted”.",
    "Resbites you host that haven’t happened yet are cancelled, and every guest is told. Weekly groups you host end. Co-hosts don’t take them over.",
    "You leave every resbite and group you joined. Your connections and blocks end. Reports you made stay with us, without your name, until we’ve dealt with them.",
    "We finish deleting your account within 30 days. Usually it takes a few minutes. Check here to see when it’s done.",
    "We keep a few records for a limited time, such as reports about you and a receipt so you can check the deletion. Our Delete your account page explains what we keep and for how long.",
    "Deleting the app or signing out doesn’t delete your account. Copies other people made can’t be deleted.",
  ] as readonly string[],
  proveHeading: "Confirm it’s you",
  typeHeading: "Type DELETE",
  typeField: "Type DELETE to confirm",
  cannotUndo: "Once we accept your request, it can’t be undone.",
  phoneBody: (formatted: string) => `We’ll text a code to ${formatted}.`,
  emailBody: (email: string) => `We’ll email a code to ${email}.`,
  appleBody: "Type DELETE, then confirm with Apple.",
  sendCode: "Send code",
  phoneCodeField: "Code from the text",
  emailCodeField: "Code from the email",
  phoneSent: (formatted: string) => `We sent a 6-digit code to ${formatted}.`,
  emailSent: "Check your email for the code.",
  passwordField: "Current password",
  usePassword: "Use my password instead",
  useEmailCode: "Use an email code instead",
  delete: "Permanently delete account",
  retry: "Try again",
  appleHint: "Signs in with Apple again, then permanently deletes your account.",
  noProof: `We can’t confirm it’s you in the app. Email ${PRIVACY_ADDRESS} and we’ll delete your account for you.`,
  unavailable: `To delete your account, email ${PRIVACY_ADDRESS}.`,
  preview: "You’re exploring the design. Preview can’t delete a real account.",
  savedReceipt: "A deletion request from this iPhone is saved. Check its progress below.",
  check: "Check deletion status",
};

/** The line for a request's status. A missing request reads differently signed in (try again) and signed out (purged). */
export function describeDeletionStatus(
  status: "not_found" | "queued" | "processing" | "complete",
  signedIn: boolean,
): string {
  switch (status) {
    case "queued":
    case "processing":
      return "We’ve accepted your request and closed your account. We finish deleting it within 30 days, usually in a few minutes. Check here to see when it’s done.";
    case "complete":
      return "Your account is deleted. Copies in our backups are gone within 7 days.";
    case "not_found":
      return signedIn
        ? "We can’t find a deletion request for this account. Confirm it’s you and try again."
        : "We can’t find this request. We keep requests for 30 days after deletion is complete.";
  }
}
