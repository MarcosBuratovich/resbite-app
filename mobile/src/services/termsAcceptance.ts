// The Accept your Terms screen's one call (plan 4, C8): accept_terms records this account's acceptance of the
// version the server reports as current. The server refuses any other version with "Terms changed" (22023), so a
// screen read before the owner published a newer one asks again instead of recording the old one.
import { TERMS_COPY } from "../domain/termsCopy";

export type TermsAcceptanceDeps = { acceptTerms(version: string): Promise<void> };

const client = () => (require("./supabase") as typeof import("./supabase")).supabase;

const defaultDeps: TermsAcceptanceDeps = {
  // The same 15s deadline as the account read that follows it: a call cut short reads as failed, and Continue
  // can be pressed again (the server keeps one record per account and version).
  acceptTerms: async (p_terms_version) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const { error } = await client()
        .rpc("accept_terms", { p_terms_version })
        .abortSignal(controller.signal);
      if (error) throw new Error(error.message);
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Accepts `version` (the one the server reported) for the signed-in account; rejects with the server's words. */
export async function acceptTerms(version: string, d: TermsAcceptanceDeps = defaultDeps): Promise<void> {
  await d.acceptTerms(version);
}

/** What the screen says after a failed accept, and whether it was the server's "Terms changed" refusal. */
export function termsErrorMessage(e: unknown): { message: string; changed: boolean } {
  return e instanceof Error && e.message === "Terms changed"
    ? { message: TERMS_COPY.changed, changed: true }
    : { message: TERMS_COPY.failed, changed: false };
}
