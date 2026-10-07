import type { KeyStore } from "./secureChunks";

export type EmailRequestKind = "confirmation" | "recovery";
export type PendingEmailRequest = {
  schema: 1;
  email: string;
  kind: EmailRequestKind;
  requestedAt: number;
  retryAt: number;
  expiresAt: number;
};
const key = "resbite.pending-auth-email.v1";
const minimumCooldown = 60_000;
const lifetime = 7 * 24 * 60 * 60 * 1000;
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const validEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function retrySeconds(pending: PendingEmailRequest | null, now = Date.now()) {
  return pending ? Math.max(0, Math.ceil((pending.retryAt - now) / 1000)) : 0;
}

export function emailRequestFailure(error: unknown) {
  const failure = error as { code?: string; status?: number; message?: string } | null;
  const limited = failure?.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(failure?.code ?? "");
  // auth-js exposes the server error text, but does not expose Retry-After headers.
  // Respect a server-provided wait; the server remains authoritative if it gives none.
  const seconds = limited ? failure?.message?.match(/(?:after|in)\s+(\d+)\s+seconds?/i)?.[1] : null;
  const cooldown = limited
    ? Math.max(minimumCooldown, Math.min(Number(seconds) || 0, 86_400) * 1000)
    : minimumCooldown;
  return {
    cooldown,
    message: limited
      ? "Email requests are temporarily limited. Wait before trying again; the email service may need longer than the countdown."
      : "We couldn’t confirm the email request. Check your inbox before trying again, and check your connection if nothing arrives.",
  };
}

export class EmailRequestCooldownError extends Error {
  constructor(readonly pending: PendingEmailRequest) {
    super("Please wait before requesting another email.");
  }
}

/** Only a destination and retry time are stored. Never passwords, codes or profile details. */
export function createConfirmationStore(storage: KeyStore, now = Date.now) {
  let queue: Promise<unknown> = Promise.resolve();
  function run<T>(work: () => Promise<T>) {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  }
  async function read(): Promise<PendingEmailRequest | null> {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    let value: Partial<PendingEmailRequest> = {};
    try { value = JSON.parse(raw) ?? {}; } catch { /* Discard malformed local state. */ }
    if (value.schema !== 1 || typeof value.email !== "string" || !validEmail(value.email) ||
      !["confirmation", "recovery"].includes(value.kind ?? "") ||
      ![value.requestedAt, value.retryAt, value.expiresAt].every((n) => typeof n === "number" && Number.isFinite(n)) ||
      value.expiresAt! <= now() || value.expiresAt! > now() + lifetime ||
      value.retryAt! < value.requestedAt! || value.retryAt! > value.expiresAt!) {
      await storage.removeItem(key);
      return null;
    }
    return value as PendingEmailRequest;
  }
  return {
    read: () => run(read),
    reserve: (email: string, kind: EmailRequestKind) => run(async () => {
      if (!validEmail(email)) throw new Error("Enter a valid email address.");
      const previous = await read();
      if (previous && normalizeEmail(previous.email) === normalizeEmail(email) && retrySeconds(previous, now()))
        throw new EmailRequestCooldownError(previous);
      const pending: PendingEmailRequest = {
        schema: 1, email: email.trim(), kind, requestedAt: now(),
        retryAt: now() + minimumCooldown, expiresAt: now() + lifetime,
      };
      // Reserve before network work, so a restart or lost response cannot immediately send twice.
      await storage.setItem(key, JSON.stringify(pending));
      return pending;
    }),
    failure: (pending: PendingEmailRequest, error: unknown) => run(async () => {
      const current = await read();
      if (!current || current.requestedAt !== pending.requestedAt ||
        current.email !== pending.email || current.kind !== pending.kind) return current;
      const updated = { ...current, retryAt: Math.max(current.retryAt, now() + emailRequestFailure(error).cooldown) };
      await storage.setItem(key, JSON.stringify(updated));
      return updated;
    }),
    clear: (expected?: PendingEmailRequest) => run(async () => {
      const current = await read();
      if (expected && current && (expected.requestedAt !== current.requestedAt ||
        expected.email !== current.email || expected.kind !== current.kind)) return;
      await storage.removeItem(key);
    }),
  };
}

type Account = { id: string; email?: string };
export async function checkEmailConfirmation(email: string, auth: {
  session: () => Promise<Account | null>;
  user: () => Promise<(Account & { email_confirmed_at?: string }) | null>;
}): Promise<"confirmed" | "sign_in" | "different_account" | "unconfirmed"> {
  const initial = await auth.session();
  if (!initial) return "sign_in";
  if (normalizeEmail(initial.email ?? "") !== normalizeEmail(email)) return "different_account";
  const verified = await auth.user();
  const current = await auth.session();
  if (!verified || !current) return "sign_in";
  if (current.id !== initial.id || verified.id !== initial.id ||
    normalizeEmail(verified.email ?? "") !== normalizeEmail(email) ||
    normalizeEmail(current.email ?? "") !== normalizeEmail(email)) return "different_account";
  return verified.email_confirmed_at ? "confirmed" : "unconfirmed";
}

export const confirmationNotice = "If this address needs confirmation, check its inbox and spam folder for a Resbite email. If you already have an account, sign in or reset your password.";
export const recoveryNotice = "If this address has an account that can use a password, check its inbox and spam folder for a reset email.";

export function authLinkGuidance(error: unknown, recovery: boolean) {
  const code = (error as { code?: string } | null)?.code;
  if (["pkce_code_verifier_not_found", "bad_code_verifier", "flow_state_not_found"].includes(code ?? ""))
    return "This link needs the device where you requested it. If you switched devices, reinstalled Resbite or cleared its data, request a new link here and open it on this device.";
  return recovery
    ? "We couldn’t open this password reset link. It may have expired or already been used. Request a new reset link and open only the most recent email on this device."
    : "We couldn’t confirm this link. It may have expired or already been used. Try signing in if you already confirmed, or request a new confirmation email on this device.";
}
