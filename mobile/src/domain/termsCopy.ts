// The words of the Accept your Terms screen (plan 4, B2): docs/legal/community-rules-short.md section 3, the text
// for version 1.0 of the Terms. The tick and the line under it are GUEST_COPY's, shared with sign-up.
export const TERMS_COPY = {
  heading: "Please accept our Terms",
  intro: "To use Resbite, confirm that you’re 18 or over and accept our Terms of Use. They include our community rules.",
  /** Written fresh for each version: what this one changes. */
  whatsNew:
    "This is the first full version of our Terms. It sets out our community rules, how we keep Resbite safe, how to complain or appeal, and what happens when you delete your account.",
  continue: "Continue",
  /** Terms section 16.2: someone who doesn't accept a version can delete their account instead. */
  deleteAccount: "Delete my account",
  signOut: "Sign out",
  /** The server published a newer version while the screen was open (accept_terms refused the one sent). */
  changed: "Our Terms changed while you were reading. Please read them again.",
  failed: "That didn’t go through. Check your connection and try again.",
} as const;
