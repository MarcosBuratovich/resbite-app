// Calls on a signed-in phone account: note app use, and hand the 18+ tick to the server once there is
// a session. The tick lives in module memory so it survives the navigator remount on sign-in.

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
  attestAge: async (p_terms_version) => {
    const { error } = await client().rpc("attest_age", { p_terms_version });
    if (error) throw new Error(error.message);
  },
};

let pendingTerms: string | null = null;

export async function noteAppSession(d: PhoneAccountDeps = defaultDeps): Promise<void> {
  try {
    await d.noteAppSession();
  } catch {
    // Best effort.
  }
}

export function rememberAttestation(termsVersion: string): void {
  pendingTerms = termsVersion;
}

export async function flushAttestation(d: PhoneAccountDeps = defaultDeps): Promise<void> {
  const version = pendingTerms;
  if (version === null) return;
  try {
    await d.attestAge(version);
    if (pendingTerms === version) pendingTerms = null;
  } catch {
    // Kept for the next account refresh.
  }
}
