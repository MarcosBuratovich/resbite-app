// The personal invitation page's pure step logic (contact invitations, Task 11): the page's words, matching a typed
// number to the invitation's country, the step reducer and the mapping of server replies to words. No DOM, storage
// or network here; /personal.js does those. Tested under node by links/personal-flow.test.mjs.

/** "1:00", "0:59", "0:05"; never negative. The app's formatCountdown. */
export function formatCountdown(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Every word the script puts on the page. The mockup's strings (invitee-web-journey, screens 1–3 and direction A),
 * GI2's tick and terms, and the app's code-step words, so the web and the app say the same things.
 */
export const PAGE_COPY = {
  answer: "Answer",
  notYou: (host) => `Not your number? Ask ${host} to check it.`,
  confirmHeading: "Confirm it’s you",
  confirmBody: (host) => `Type the number ${host} invited. We’ll text it a code.`,
  tick: "I’m 18 or over",
  terms: "I agree to the Terms and Privacy Policy.",
  ageHelper: "Resbite is for people aged 18 and over.",
  numberField: "Mobile number",
  send: "Send code",
  invalidNumber: "Enter a valid mobile number.",
  wrongNumber: (host) => `That isn’t the number ${host} invited.`,
  codeHeading: "Enter the code",
  codeSent: "Code sent",
  codeBody: (number) => `We sent a 6-digit code to ${number}.`,
  codeField: "6-digit code",
  verify: "Verify",
  mismatch: "That code doesn’t match. Try again.",
  expired: "That code has expired. Send a new one.",
  wait: "Wait a minute, then send a new code.",
  resendIn: (seconds) => `Didn’t get it? Send a new code in ${formatCountdown(seconds)}`,
  resend: "Send a new code",
  changeNumber: "Change number",
  verified: (ending) => `✓ Verified · ••${ending}`,
  nameField: "Your first name",
  nameRule: "Use a name between 1 and 80 characters.",
  answerLegend: "Your answer",
  going: "Going",
  maybe: "Maybe",
  cantGo: "Can’t go",
  chooseAnswer: "Choose Going, Maybe or Can’t go.",
  sendAnswer: "Send answer",
  hostSees: (host) => `${host} will see your answer.`,
  hostCanSee: (host) => `${host} can see your answer.`,
  goingHeading: "You’re going!",
  maybeHeading: "You might come",
  cantHeading: "Thanks for letting them know",
  benefits: [
    "Hear when the time or place changes",
    "See who else is going",
    "Get the exact address and meeting details",
    "Reminders before it starts",
    "Add it to your calendar",
  ],
  getApp: "Get Resbite",
  waiting: (formatted) => `Sign up with ${formatted} and this resbite will be waiting.`,
  notNow: "Not now",
  planOwn: "Plan your own with Resbite.",
  changeAnswer: "Change answer",
  connection: "Check your connection and try again.",
  tooMany: "Too many tries. Try again later.",
  unavailable: "This invitation is no longer active.",
};

/** The error keys the reducer holds; anything else in `error` is a server message shown as it came. */
const ERROR_KEYS = new Set([
  "ageHelper", "invalidNumber", "wrongNumber", "mismatch", "expired", "wait", "connection", "tooMany", "unavailable",
  "nameRule", "chooseAnswer",
]);

/** The words for an error the reducer holds; "" for none. */
export function errorText(error, host) {
  if (!error) return "";
  if (!ERROR_KEYS.has(error)) return String(error);
  const copy = PAGE_COPY[error];
  return typeof copy === "function" ? copy(host) : copy;
}

export const RESPONSES = ["accepted", "maybe", "declined"];
export const RESEND_DELAY_MS = 60_000;
const CODE_LIFETIME_MS = 600_000;
const MAX_NAME = 80;

/**
 * The typed number in international form, or null. "+…" is used as typed and "00…" becomes "+…"; anything else
 * is the invitation's calling code plus the digits without leading zeros ("07700 900834" with 44 is +447700900834).
 * Spaces, dashes, dots and brackets are allowed; any other character, fewer than 7 digits or more than 15 is null.
 */
export function composeNumber(input, country) {
  const text = typeof input === "string" ? input.trim() : "";
  if (!/^\+?[\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  let number;
  if (text.startsWith("+")) number = digits;
  else if (digits.startsWith("00")) number = digits.slice(2);
  else {
    if (!/^\d{1,3}$/.test(country ?? "")) return null;
    const national = digits.replace(/^0+/, "");
    if (national.length < 7) return null;
    number = country + national;
  }
  if (number.replace(/^0+/, "").length < 7 || number.length > 15) return null;
  return `+${number}`;
}

/** "+44 ••• 834": the calling code and the last three digits of the confirmed number; null without one. */
export function maskNumber(phone, country) {
  const digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  if (digits.length < 3) return null;
  return `+${country} ••• ${digits.slice(-3)}`;
}

/** Only this code is swapped for the stored one in test mode (the server returns null when test mode is off). */
export const isTestCode = (code) => code === "000000";

export function initialState() {
  return {
    step: "invite",
    ticked: false,
    number: "",
    phone: null,
    sentAt: null,
    code: "",
    choice: null,
    name: "",
    response: null,
    pitch: true,
    busy: false,
    error: null,
  };
}

/**
 * The page's steps: "invite" → "confirm" → "code" → "answer" → "done". Events that start a request ("send",
 * "resend", "verify", "submit") set `busy`; personal.js then makes the request and reports back with "checked",
 * "sent", "verified", "answered", "refused" or "fail". An event out of step, or one that would start a second
 * request while one runs, returns the same state.
 */
export function next(state, event) {
  const s = state;
  const at = (step) => s.step === step;
  switch (event?.type) {
    case "open":
      return at("invite") ? { ...s, step: "confirm", error: null } : s;
    case "tick":
      if (!at("confirm") || s.busy) return s;
      return { ...s, ticked: Boolean(event.ticked), error: s.error === "ageHelper" ? null : s.error };
    case "send": {
      if (!at("confirm") || s.busy) return s;
      if (!s.ticked) return { ...s, error: "ageHelper" };
      const phone = composeNumber(event.input, event.country);
      if (!phone) return { ...s, error: "invalidNumber", phone: null };
      return { ...s, busy: true, error: null, phone, number: String(event.input).trim() };
    }
    case "checked":
      if (!at("confirm") || !s.busy) return s;
      return event.matches ? s : { ...s, busy: false, error: "wrongNumber", phone: null };
    case "sent":
      if (!(at("confirm") || at("code")) || !s.busy) return s;
      return { ...s, step: "code", busy: false, error: null, sentAt: event.at, code: "" };
    case "resend":
      return at("code") && !s.busy ? { ...s, busy: true, error: null } : s;
    case "back":
      return at("code") && !s.busy ? { ...s, step: "confirm", error: null, phone: null, sentAt: null, code: "" } : s;
    case "verify": {
      if (!at("code") || s.busy) return s;
      const code = String(event.code ?? "").replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) return { ...s, error: "mismatch", code: "" };
      return { ...s, busy: true, error: null, code };
    }
    case "verified":
      return at("code") && s.busy ? { ...s, step: "answer", busy: false, error: null, code: "" } : s;
    case "choose":
      if (!at("answer") || s.busy || !RESPONSES.includes(event.response)) return s;
      return { ...s, choice: event.response, error: s.error === "chooseAnswer" ? null : s.error };
    case "submit": {
      if (!at("answer") || s.busy) return s;
      if (!s.choice) return { ...s, error: "chooseAnswer" };
      // A changed answer keeps the name the first answer saved.
      const name = String(event.name ?? "").trim();
      if (!s.response && (name.length < 1 || name.length > MAX_NAME)) return { ...s, error: "nameRule" };
      return { ...s, busy: true, error: null, name: s.response ? "" : name };
    }
    case "answered":
      if (!at("answer") || !s.busy) return s;
      return { ...s, step: "done", busy: false, error: null, response: event.response, choice: event.response, pitch: true };
    case "refused":
      // Signed in with a number that isn't this invitation's: sign in again from the number.
      if (!at("answer")) return s;
      return { ...s, step: "confirm", busy: false, error: event.error ?? null, phone: null, response: null, choice: null, sentAt: null };
    case "change":
      return at("done") ? { ...s, step: "answer", error: null, choice: s.response } : s;
    case "notNow":
      return at("done") ? { ...s, pitch: false } : s;
    case "restore": {
      if (!at("invite")) return s;
      const response = RESPONSES.includes(event.response) ? event.response : null;
      return { ...s, step: response ? "done" : "answer", phone: event.phone ?? null, response, choice: response, pitch: true, error: null };
    }
    case "fail":
      return s.busy ? { ...s, busy: false, error: event.error || "connection" } : s;
    default:
      return s;
  }
}

const offline = (status) => status === 0 || status >= 500;

/** A PostgREST reply's error as an error key. */
export function rpcError(status, body) {
  if (offline(status)) return "connection";
  const message = String(body?.message ?? "");
  if (status === 401 || message === "Sign-in required") return "signedOut";
  if (body?.code === "22023" && /too many/i.test(message)) return "tooMany";
  if (body?.code === "22023" && /name/i.test(message)) return "nameRule";
  if (body?.code === "42501" && /invited number/i.test(message)) return "wrongNumber";
  return "unavailable";
}

/** POST /auth/v1/otp's error, as the app maps it: the connection, a rate limit, else GoTrue's own message. */
export function sendError(status, body) {
  if (offline(status)) return "connection";
  if (status === 429) return "wait";
  return typeof body?.msg === "string" && body.msg ? body.msg : "connection";
}

/** POST /auth/v1/verify's error: GoTrue words wrong and expired codes alike, so the clock tells them apart. */
export function verifyError(status, body, sentAt, now) {
  if (offline(status)) return "connection";
  if (status === 429) return "wait";
  return sentAt != null && now - sentAt >= CODE_LIFETIME_MS ? "expired" : "mismatch";
}

/**
 * What the page keeps of a GoTrue session: the tokens, when the access token expires (seconds) and the confirmed
 * number ("+447700900834"; auth.users holds digits). `phone` is used when the reply carries no user.
 */
export function sessionFrom(body, now, phone = null) {
  if (!body || typeof body.access_token !== "string" || typeof body.refresh_token !== "string") return null;
  const expires_at = Number.isFinite(body.expires_at)
    ? body.expires_at
    : Math.floor(now / 1000) + (Number.isFinite(body.expires_in) ? body.expires_in : 3600);
  const digits = typeof body.user?.phone === "string" ? body.user.phone.replace(/\D/g, "") : "";
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at, phone: digits ? `+${digits}` : phone };
}

/** True from a minute before the access token expires. */
export function sessionExpired(session, now) {
  return !Number.isFinite(session?.expires_at) || session.expires_at * 1000 - 60_000 <= now;
}
