import { GUEST_COPY } from "./guestAccount";

// The words of the phone screens: sign up, sign in, the code, and (Task 8) About you and Add your number.
export const PHONE_COPY = {
  signupHeading: "Your number",
  signinHeading: "Sign in",
  codeHeading: "Enter the code",
  numberField: "Mobile number",
  numberHint: "We’ll text you a 6-digit code.",
  send: "Send code",
  codeBody: (formatted: string) => `We sent a 6-digit code to ${formatted}.`,
  resendIn: GUEST_COPY.resendIn,
  resend: "Send a new code",
  changeNumber: "Change number",
  createInstead: "Create an account",
  useEmail: "Use email and password",
  retry: "Retry",
  checking: "Checking the code",
  aboutHeading: "About you",
  nameField: "Your name",
  /** Why Continue is off: the same words as Profile's name check (useProfile). */
  nameRule: "Use a name between 1 and 80 characters.",
  appleNameHint: "Links your Apple ID and fills in your name from it.",
  googleNameHint: "Links your Google account and fills in your name from it.",
  continue: "Continue",
  addHeading: "Add your number",
  addBody: "Your friends find and invite you by your number.",
  /** Also PHONE_CODE_COPY.taken. While folding is off, signing in with the number would make a second account, so the
   * way out is support, not that number (contact invitations F2). */
  taken: "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help.",
  foldOffer: "This number answered an invitation on the web. Confirm it with a code to bring its resbites here.",
  foldOff: "Bringing an invitation into this account isn’t switched on yet.",
  foldGone: "That web account is gone, so we sent a code to add this number instead.",
};
