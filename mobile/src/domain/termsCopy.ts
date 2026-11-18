import { TERMS_VERSION } from "./guestAccount";

// The words of the Accept your Terms screen (plan 4, B2): docs/legal/community-rules-short.md section 3, the text
// for version 1.0 of the Terms and for later versions. The tick and the line under it are GUEST_COPY's, shared with
// sign-up.
export const TERMS_COPY = {
  heading: "Please accept our Terms",
  intro: "To use Resbite, confirm that you’re 18 or over and accept our Terms of Use. They include our community rules.",
  /**
   * What each version changes, by the version the server publishes: written fresh for each one. A build knows only
   * the versions up to its own TERMS_VERSION; one published later reads as an update (`termsScreen`).
   */
  whatsNew: {
    [TERMS_VERSION]:
      "This is the first full version of our Terms. It sets out our community rules, how we keep Resbite safe, how to complain or appeal, and what happens when you delete your account.",
  } as Readonly<Record<string, string>>,
  /** A version this build doesn't know: published after it was made (section 3, "later versions"). */
  updatedHeading: "We’ve updated our Terms",
  updatedLine: "To keep using Resbite, please accept the new version.",
  continue: "Continue",
  /** Terms section 16.2: someone who doesn't accept a version can delete their account instead. */
  deleteAccount: "Delete my account",
  signOut: "Sign out",
  /** The server published a newer version while the screen was open (accept_terms refused the one sent). */
  changed: "Our Terms changed while you were reading. Please read them again.",
  failed: "That didn’t go through. Check your connection and try again.",
} as const;

/**
 * The heading and the lines above the tick for the version the server reports. A version this build has words for
 * gets them; any other (published after the build, decision 1) the generic update, never another version's words.
 */
export function termsScreen(version: string): { heading: string; lines: string[] } {
  const known = Object.prototype.hasOwnProperty.call(TERMS_COPY.whatsNew, version);
  const whatsNew = known ? TERMS_COPY.whatsNew[version] : undefined;
  return whatsNew
    ? { heading: TERMS_COPY.heading, lines: [TERMS_COPY.intro, whatsNew] }
    : { heading: TERMS_COPY.updatedHeading, lines: [TERMS_COPY.updatedLine] };
}
