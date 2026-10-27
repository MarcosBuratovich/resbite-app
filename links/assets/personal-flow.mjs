// The personal invitation page's pure step logic (contact invitations, Task 11): the page's words, matching a typed
// number to the invitation's country, the step reducer and the mapping of server replies to words. No DOM, storage
// or network here; /personal.js does those. Tested under node by links/personal-flow.test.mjs.
// The open link /r/<code> runs the same steps in open mode (open-link approval, plan 3): any number can answer, and
// the answer becomes a request that waits for the host, so the last step is one of three screens (`join`).

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
  signOut: "Not you? Sign out",
  // The open link (plan 3). Its number step names no invited number: it says what the app's number step says.
  numberHint: "We’ll text you a 6-digit code.",
  outsideUk: "Outside the UK? Start with + and your country code.",
  waitingHeading: (host) => `Waiting for ${host}`,
  waitingBody: (host) => `${host} will confirm your spot.`,
  notAdded: "You weren’t added to this resbite.",
  alreadyIn: "You’re on this resbite.",
  openApp: "Open Resbite",
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
/** The open link's last screens: waiting for the host, declined on this link, or already on the resbite. */
const JOINS = ["waiting", "notAdded", "alreadyIn"];
export const RESEND_DELAY_MS = 60_000;
const CODE_LIFETIME_MS = 600_000;
const MAX_NAME = 80;

/**
 * The typed number in international form, or null. "+…" is used as typed and "00…" becomes "+…"; anything else
 * is the invitation's calling code plus the digits without leading zeros ("07700 900834" with 44 is +447700900834).
 * A national "(0)" written after the calling code is dropped ("+44 (0) 7700 900834" is +447700900834).
 * Spaces, dashes, dots and brackets are allowed; any other character, fewer than 7 digits or more than 15 is null.
 */
export function composeNumber(input, country) {
  const text = (typeof input === "string" ? input.trim() : "").replace(/^(\+|00)(\s*\d{1,3})\s*\(\s*0\s*\)/, "$1$2 ");
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
    join: null,
    pitch: true,
    busy: false,
    error: null,
  };
}

/** A first answer needs a name; a changed answer, or a request already waiting (made in the app, say), has one. */
export const needsName = (state) => !state.response && !state.join;

/** The last two digits of a number, for "✓ Verified · ••34" on the open link, which names no number; "" without. */
export function endingOf(phone) {
  const digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  return digits.length >= 2 ? digits.slice(-2) : "";
}

const answerOf = (response) => (RESPONSES.includes(response) ? response : null);

/**
 * The open link's screen for my_join_request's reply when the page comes back, by the first rule that applies: the
 * owner or a guest is on the resbite; a waiting request brings its answer back to change ("pending", from the app,
 * is none yet); a declined one says so; anything else (no request, or an approval whose guest has since been
 * removed) is the answer step (`join` null).
 */
export function screenForReturn(page) {
  if (page?.member === "owner" || page?.member === "attendee") return { join: "alreadyIn", response: null };
  if (page?.request?.status === "waiting") return { join: "waiting", response: answerOf(page.request.response) };
  if (page?.request?.status === "declined") return { join: "notAdded", response: null };
  return { join: null, response: null };
}

/** The open link's screen for request_to_join's reply, as screenForReturn's; null for a reply it doesn't know. */
export function screenForRequest(result) {
  switch (result?.state) {
    case "owner":
    case "already":
      return { join: "alreadyIn", response: null };
    case "waiting":
      return { join: "waiting", response: answerOf(result.response) };
    case "declined":
      return { join: "notAdded", response: null };
    default:
      return null;
  }
}

/**
 * The page's steps: "invite" → "confirm" → "code" → "answer" → "done". Events that start a request ("send",
 * "resend", "verify", "submit") set `busy`; personal.js then makes the request and reports back with "checked",
 * "sent", "verified", "answered", "refused" or "fail". An event out of step, or one that would start a second
 * request while one runs, returns the same state. On the open link nothing is "checked" (any number can answer), and
 * "answered" and "restore" carry the screen (`join`); only a waiting answer can change.
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
      const named = needsName(s);
      if (named && (name.length < 1 || name.length > MAX_NAME)) return { ...s, error: "nameRule" };
      return { ...s, busy: true, error: null, name: named ? name : "" };
    }
    case "answered": {
      if (!at("answer") || !s.busy) return s;
      const join = JOINS.includes(event.join) ? event.join : null;
      return { ...s, step: "done", busy: false, error: null, response: event.response, choice: event.response, join, pitch: true };
    }
    case "refused":
      // Signed in with a number that isn't this invitation's: sign in again from the number.
      if (!at("answer")) return s;
      return { ...s, step: "confirm", busy: false, error: event.error ?? null, phone: null, response: null, choice: null, join: null, sentAt: null };
    case "change":
      // The open link's answer changes only while it waits: declined or let in, the host has decided.
      return at("done") && (!s.join || s.join === "waiting") ? { ...s, step: "answer", error: null, choice: s.response } : s;
    case "notNow":
      return at("done") ? { ...s, pitch: false } : s;
    case "signOut":
      // Not you? Back to the invitation as a new visitor: nothing of the verified person stays.
      return (at("answer") || at("done")) && !s.busy ? initialState() : s;
    case "restore": {
      if (!at("invite")) return s;
      const response = RESPONSES.includes(event.response) ? event.response : null;
      const join = JOINS.includes(event.join) ? event.join : null;
      return { ...s, step: response || join ? "done" : "answer", phone: event.phone ?? null, response, choice: response, join, pitch: true, error: null };
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

// ---- The kept session: one entry per invitation code, in this origin's localStorage. ----

/** Every kept entry's key starts with this; the rest is the invitation's code. */
export const KEPT_PREFIX = "resbite.personal.session.";
export const keptKey = (code) => `${KEPT_PREFIX}${code}`;

const digitsOf = (phone) => (typeof phone === "string" ? phone.replace(/\D/g, "") : "");

/**
 * What the page stores for one invitation: the session, the full number this page verified for this code, and when
 * the event starts (ms since 1970), after which the entry is dropped.
 */
export function keptEntry(session, phone, startsAt) {
  return { session, phone, until: Number.isFinite(startsAt) ? startsAt : null };
}

function readEntry(storage, key) {
  try {
    const entry = JSON.parse(storage.getItem(key) ?? "null");
    const session = entry?.session;
    if (!session || typeof session.access_token !== "string" || typeof session.refresh_token !== "string") return null;
    if (typeof entry.phone !== "string" || !Number.isFinite(entry.until)) return null;
    return entry;
  } catch {
    return null;
  }
}

/** True when the session belongs to exactly the number this page verified for the code: every digit, not an ending. */
export const sameNumber = (session, entry) => Boolean(digitsOf(entry?.phone)) && digitsOf(session?.phone) === digitsOf(entry?.phone);

/**
 * The entry kept for this code, or null. An entry that is malformed, whose event has started, or whose session holds
 * another number than the one verified for this code is dropped, so it is never restored.
 */
export function readKept(storage, code, now) {
  const key = keptKey(code);
  let entry;
  try {
    if (storage.getItem(key) == null) return null;
    entry = readEntry(storage, key);
  } catch {
    return null;
  }
  if (entry && entry.until > now && sameNumber(entry.session, entry)) return entry;
  dropKept(storage, code);
  return null;
}

/** Stores the entry for this code; false when storage refuses (the visit still works, the next one asks again). */
export function writeKept(storage, code, entry) {
  try {
    storage.setItem(keptKey(code), JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

export function dropKept(storage, code) {
  try {
    storage.removeItem(keptKey(code));
  } catch {
    // Nothing to remove.
  }
}

/** Drops every kept entry, for any code, whose event has started or that can't be read. Returns the codes dropped. */
export function sweepKept(storage, now) {
  const dropped = [];
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(KEPT_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const entry = readEntry(storage, key);
      if (entry && entry.until > now) continue;
      storage.removeItem(key);
      dropped.push(key.slice(KEPT_PREFIX.length));
    }
  } catch {
    // Storage blocked: nothing is kept there either.
  }
  return dropped;
}

/**
 * Not you? Sign out: the entry goes at once, then GoTrue ends this one session (scope local, so the person's app
 * session, if any, stays). The reply doesn't matter: the token is already gone from this browser.
 */
export async function signOutKept({ storage, code, session, post }) {
  dropKept(storage, code);
  if (typeof session?.access_token !== "string") return;
  try {
    await post("/auth/v1/logout?scope=local", {}, session.access_token);
  } catch {
    // Ignored, as the reply is.
  }
}
