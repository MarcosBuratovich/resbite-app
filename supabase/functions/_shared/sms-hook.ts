/** Supabase Auth's Send SMS hook as an HTTP hook: checks Auth's Standard Webhooks signature, texts the code through
 * Twilio's Messages API and answers Auth inside its 5-second budget. Never logs or echoes a phone number, a code, the
 * text, a token or an upstream body: a log entry holds an outcome word, an HTTP status and Twilio's numeric code. */

export const SMS_COPY = {
  invalid: "Invalid code request.",
  cantText: "We can’t text this number. Check it, or use another number.",
  unavailable: "Text messages aren’t available right now. Try again later.",
} as const;

/** Twilio's answers that mean this number cannot be texted: invalid "To" (21211), no permission for that region
 * (21408), the number sent STOP (21610), unreachable "To" (21612) and not a mobile number (21614). */
export const REFUSED_NUMBER_CODES: ReadonlySet<number> = new Set([21211, 21408, 21610, 21612, 21614]);

/** How long the sender waits for Twilio, inside Auth's 5 seconds. */
export const TWILIO_TIMEOUT_MS = 4000;

/** The Standard Webhooks tolerance either side of now, in seconds. */
const SIGNATURE_WINDOW_SECONDS = 300;

export type SendResult =
  | { ok: true }
  | { ok: false; kind: "refused" | "transient" | "config"; status: number; code: number | null };

export type LogEntry = {
  route: "hook" | "sweep";
  outcome: string;
  status?: number;
  code?: number | null;
  deleted?: number;
  kept?: number;
  failed?: number;
};

export type HookDeps = {
  secrets: string[];
  nowSeconds(): number;
  send(to: string, body: string): Promise<SendResult>;
  log(entry: LogEntry): void;
};

export type TwilioConfig = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  messagingServiceSid: string;
  fetch?: typeof fetch;
};

/** The hook secrets from one variable: several split on `|` while one is being rotated. */
export function hookSecrets(raw: string | undefined): string[] {
  return (raw ?? "").split("|").map((s) => s.trim()).filter((s) => s !== "");
}

const encoder = new TextEncoder();

function decodeSecret(secret: string) {
  const encoded = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  try {
    const binary = atob(encoded);
    if (binary.length === 0) return null;
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Compares two strings in time that depends only on their length. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Standard Webhooks: HMAC-SHA256 over `id.timestamp.body` with any listed secret matches any `v1,` signature in the
 * header, and the timestamp is within five minutes of now. */
export async function verifyHookSignature(secrets: string[], headers: Headers, body: string, nowSeconds: number): Promise<boolean> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const header = headers.get("webhook-signature");
  if (!id || !timestamp || !header) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS) return false;
  const offered = header.split(" ").filter((s) => s.startsWith("v1,")).map((s) => s.slice(3));
  if (offered.length === 0) return false;
  const signed = encoder.encode(`${id}.${timestamp}.${body}`);
  let match = false;
  for (const secret of secrets) {
    const raw = decodeSecret(secret);
    if (!raw) continue;
    const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = base64(await crypto.subtle.sign("HMAC", key, signed));
    for (const candidate of offered) if (sameText(expected, candidate)) match = true;
  }
  return match;
}

/** Who to text and what code: the number being added (`user.new_phone`) when there is one, else the account's
 * number, as its stored digits (never folded to the phone key) with a leading `+`. */
export function smsTarget(event: unknown): { to: string; otp: string } | null {
  if (!event || typeof event !== "object") return null;
  const { user, sms } = event as { user?: unknown; sms?: unknown };
  if (!user || typeof user !== "object" || !sms || typeof sms !== "object") return null;
  const { phone, new_phone: newPhone } = user as { phone?: unknown; new_phone?: unknown };
  const { otp } = sms as { otp?: unknown };
  const number = typeof newPhone === "string" && newPhone.trim() !== "" ? newPhone : phone;
  if (typeof number !== "string" || typeof otp !== "string") return null;
  const digits = number.replace(/\D/g, "");
  if (!/^[1-9][0-9]{6,14}$/.test(digits) || !/^[0-9]{6}$/.test(otp)) return null;
  return { to: `+${digits}`, otp };
}

/** The text: one GSM-7 segment, no apostrophe (a curly one would make the whole message UCS-2). */
export function smsBody(otp: string): string {
  return `Your Resbite code is ${otp}. It expires in 10 minutes. Do not share it.`;
}

function reply(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });
}
const hookError = (status: number, httpCode: number, message: string, extra: Record<string, string> = {}) =>
  reply(status, { error: { http_code: httpCode, message } }, extra);

export async function handleSendSms(request: Request, deps: HookDeps): Promise<Response> {
  if (request.method !== "POST") {
    deps.log({ route: "hook", outcome: "method" });
    return hookError(405, 405, "Method not allowed", { Allow: "POST" });
  }
  const body = await request.text();
  if (deps.secrets.length === 0) {
    deps.log({ route: "hook", outcome: "unconfigured" });
    return hookError(500, 500, SMS_COPY.unavailable);
  }
  if (!(await verifyHookSignature(deps.secrets, request.headers, body, deps.nowSeconds()))) {
    deps.log({ route: "hook", outcome: "unsigned" });
    return hookError(401, 401, "Invalid signature");
  }
  let event: unknown;
  try { event = JSON.parse(body); } catch { event = null; }
  const target = smsTarget(event);
  if (!target) {
    deps.log({ route: "hook", outcome: "invalid" });
    return hookError(200, 400, SMS_COPY.invalid);
  }
  let result: SendResult;
  try {
    result = await deps.send(target.to, smsBody(target.otp));
  } catch {
    result = { ok: false, kind: "transient", status: 0, code: null };
  }
  if (result.ok) {
    deps.log({ route: "hook", outcome: "sent" });
    return reply(200, {});
  }
  deps.log({ route: "hook", outcome: result.kind, status: result.status, code: result.code });
  if (result.kind === "refused") return hookError(200, 422, SMS_COPY.cantText);
  if (result.kind === "transient") return hookError(503, 503, SMS_COPY.unavailable, { "retry-after": "1" });
  return hookError(500, 500, SMS_COPY.unavailable);
}

/** Twilio's numeric error code from a reply body, or null when the body is not Twilio's JSON. */
function twilioCode(text: string): number | null {
  try {
    const parsed = JSON.parse(text) as { code?: unknown } | null;
    return typeof parsed?.code === "number" && Number.isInteger(parsed.code) ? parsed.code : null;
  } catch {
    return null;
  }
}

/** Sends through a Messaging Service with an API key (revocable on its own), from Twilio's US region. A code that
 * cannot be delivered within 10 minutes is dropped (ValidityPeriod), never delivered late. */
export function twilioSender(c: TwilioConfig): HookDeps["send"] {
  const doFetch = c.fetch ?? ((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(input, init));
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/Messages.json`;
  const authorization = `Basic ${btoa(`${c.apiKeySid}:${c.apiKeySecret}`)}`;
  return async (to, body) => {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, MessagingServiceSid: c.messagingServiceSid, Body: body, ValidityPeriod: "600" }).toString(),
        signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, kind: "transient", status: 0, code: null };
    }
    const status = response.status;
    // Twilio has accepted the message: a body that fails to arrive must not make Auth retry and text twice.
    if (response.ok) {
      await response.body?.cancel().catch(() => {});
      return { ok: true };
    }
    const code = twilioCode(await response.text().catch(() => ""));
    if (status === 400 && code !== null && REFUSED_NUMBER_CODES.has(code)) return { ok: false, kind: "refused", status, code };
    if (status === 429 || status >= 500) return { ok: false, kind: "transient", status, code };
    return { ok: false, kind: "config", status, code };
  };
}

/** One function, two routes: `…/send-sms/sweep` (the daily cron call) goes to the sweep, everything else to the hook.
 * Only the path counts, never the query. */
export function smsRouter(routes: {
  hook(r: Request): Promise<Response>;
  sweep(r: Request): Promise<Response>;
}): (r: Request) => Promise<Response> {
  return (r) => (new URL(r.url).pathname.endsWith("/sweep") ? routes.sweep(r) : routes.hook(r));
}
