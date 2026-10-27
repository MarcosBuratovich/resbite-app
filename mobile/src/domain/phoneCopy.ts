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
  aboutHeading: "About you",
  nameField: "Your name",
  continue: "Continue",
  addHeading: "Add your number",
  addBody: "Your friends find and invite you by your number.",
};
