// Calls on a signed-in phone account: note app use, and hand the 18+ tick to the server once there is
// a session. The tick lives in module memory so it survives the navigator remount on sign-in, and it is
// tied to the number being verified: only an account holding that number records it.
import { samePhone } from "../domain/phone";

export type PhoneAccountDeps = {
  noteAppSession(): Promise<void>;
  attestAge(termsVersion: string): Promise<void>;
};

const client = () => (require("./supabase") as typeof import("./supabase")).supabase;

const defaultDeps: PhoneAccountDeps = {
  noteAppSession: async () => {
    const { error } = await client().rpc("note_app_session");
    if (error) throw new Error(error.message);
  },
  // The account read awaits this call (the tick goes before the Terms gate), so it has the same 15s deadline
  // as that read's other calls; a call cut short keeps the tick for the next refresh.
  attestAge: async (p_terms_version) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const { error } = await client()
        .rpc("attest_age", { p_terms_version })
        .abortSignal(controller.signal);
      if (error) throw new Error(error.message);
    } finally {
      clearTimeout(timer);
    }
  },
};

type PendingTick = { termsVersion: string; e164: string };
let pending: PendingTick | null = null;

export async function noteAppSession(d: PhoneAccountDeps = defaultDeps): Promise<void> {
  try {
    await d.noteAppSession();
  } catch {
    // Best effort.
  }
}

/** Remembered just before the verify that completes a sign-up for `e164`, and only then. */
export function rememberAttestation(termsVersion: string, e164: string): void {
  pending = { termsVersion, e164 };
}

/** Drops the pending tick: a failed sign-up verify and sign-out. */
export function clearAttestation(): void {
  pending = null;
}

/**
 * Records the pending tick for the signed-in account when its phone is the number the tick was given
 * for, as the server's current Terms version when it knows one (so a new account isn't asked to accept
 * again), else the version the tick was given with. Resolves with the version recorded, or null when
 * nothing was: no tick, another account (it stays pending), or a failure (kept for the next refresh).
 */
export async function flushAttestation(
  user: { phone?: string | null } | null,
  d: PhoneAccountDeps = defaultDeps,
  serverVersion: string | null = null,
): Promise<string | null> {
  const tick = pending;
  if (tick === null || !samePhone(user?.phone, tick.e164)) return null;
  const version = serverVersion ?? tick.termsVersion;
  try {
    await d.attestAge(version);
    if (pending === tick) pending = null;
    return version;
  } catch {
    // Kept for the next account refresh.
    return null;
  }
}
