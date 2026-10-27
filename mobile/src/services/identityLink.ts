// Link Apple or Google to the signed-in phone account and take the provider's name. The native
// modules load lazily (see appleSignIn.ts) so the flows run under node with stub dependencies.
import { appleName, appleSignInDeps, type AppleSignInDeps } from "./appleSignIn";
import { appleNameToSave } from "../domain/guestAccount";
import { safeAuthCode } from "../domain/rules";
import type { AuthError } from "./phoneCode";

export type LinkResult =
  | { ok: true; name: string | null; email: string | null }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export type AppleLinkDeps = Pick<AppleSignInDeps, "randomUUID" | "sha256" | "requestCredential"> & {
  linkIdToken(a: { provider: "apple"; token: string; nonce: string }): Promise<{ error: AuthError }>;
  saveName(name: string): Promise<void>;
};
export type GoogleLinkDeps = {
  linkUrl(redirectTo: string): Promise<{ url: string | null; error: AuthError }>;
  openAuthSession(url: string, redirectTo: string): Promise<{ type: string; url?: string }>;
  exchange(code: string): Promise<void>;
  googleIdentity(): Promise<{ name: string | null; email: string | null }>;
  saveName(name: string): Promise<void>;
  redirectTo: string;
};

export const LINK_COPY = {
  appleTaken: "This Apple ID already has a Resbite account. Sign out, then sign in with Apple.",
  googleTaken: "This Google account already has a Resbite account. Sign out, then sign in with Google.",
};
const connectionCopy = "Check your connection and try again.";

const isTaken = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "identity_already_exists";
const isConnectionFailure = (e: { status?: number }) => e.status === 0 || (e.status !== undefined && e.status >= 500);

/** Saves the provider's name when the account has none; a failed save is not an error. */
async function takeName(name: string | null, save: (n: string) => Promise<void>): Promise<void> {
  const toSave = appleNameToSave(name, undefined);
  if (!toSave) return;
  try {
    await save(toSave);
  } catch {
    /* The account is linked; the name can be asked for later. */
  }
}

export async function linkApple(d: AppleLinkDeps): Promise<LinkResult> {
  try {
    const nonce = d.randomUUID();
    const credential = await d.requestCredential(await d.sha256(nonce));
    if (!credential.identityToken) return { ok: false, cancelled: false, message: connectionCopy };
    const { error } = await d.linkIdToken({ provider: "apple", token: credential.identityToken, nonce });
    if (error) {
      if (isTaken(error)) return { ok: false, cancelled: false, message: LINK_COPY.appleTaken };
      return { ok: false, cancelled: false, message: isConnectionFailure(error) ? connectionCopy : error.message };
    }
    const name = appleName(credential.fullName);
    await takeName(name, d.saveName);
    return { ok: true, name, email: credential.email };
  } catch (failure) {
    if (typeof failure === "object" && failure !== null && "code" in failure && failure.code === "ERR_REQUEST_CANCELED")
      return { ok: false, cancelled: true };
    if (isTaken(failure)) return { ok: false, cancelled: false, message: LINK_COPY.appleTaken };
    return { ok: false, cancelled: false, message: connectionCopy };
  }
}

export async function linkGoogle(d: GoogleLinkDeps): Promise<LinkResult> {
  try {
    const { url, error } = await d.linkUrl(d.redirectTo);
    if (error) {
      if (isTaken(error)) return { ok: false, cancelled: false, message: LINK_COPY.googleTaken };
      return { ok: false, cancelled: false, message: isConnectionFailure(error) ? connectionCopy : error.message };
    }
    if (!url) return { ok: false, cancelled: false, message: "Google sign-in is not configured." };
    const result = await d.openAuthSession(url, d.redirectTo);
    if (result.type !== "success") return { ok: false, cancelled: true };
    const code = result.url ? safeAuthCode(result.url) : null;
    if (!code) return { ok: false, cancelled: false, message: "Unable to verify the sign-in link." };
    await d.exchange(code);
    const { name, email } = await d.googleIdentity();
    await takeName(name, d.saveName);
    return { ok: true, name, email };
  } catch (failure) {
    if (isTaken(failure)) return { ok: false, cancelled: false, message: LINK_COPY.googleTaken };
    return { ok: false, cancelled: false, message: connectionCopy };
  }
}

const auth = () => (require("./supabase") as typeof import("./supabase")).supabase.auth;

/** Saves only if the signed-in account still has no display name. */
async function saveNameIfNone(name: string): Promise<void> {
  const { data } = await auth().getSession();
  const toSave = appleNameToSave(name, data.session?.user.user_metadata);
  if (toSave) await auth().updateUser({ data: { display_name: toSave } });
}

export const appleLinkDeps: AppleLinkDeps = {
  randomUUID: appleSignInDeps.randomUUID,
  sha256: appleSignInDeps.sha256,
  requestCredential: appleSignInDeps.requestCredential,
  linkIdToken: (args) => auth().linkIdentity(args),
  saveName: saveNameIfNone,
};

export const googleLinkDeps: GoogleLinkDeps = {
  redirectTo: "resbite://auth/callback",
  linkUrl: async (redirectTo) => {
    const { data, error } = await auth().linkIdentity({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    return { url: data?.url ?? null, error };
  },
  openAuthSession: (url, redirectTo) => {
    const WebBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
    return WebBrowser.openAuthSessionAsync(url, redirectTo);
  },
  exchange: async (code) => {
    const { exchangeAuthCode } = require("./authCallback") as typeof import("./authCallback");
    await exchangeAuthCode(code);
  },
  googleIdentity: async () => {
    const { data } = await auth().getUser();
    const google = data.user?.identities?.find((i) => i.provider === "google")?.identity_data;
    const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return { name: pick(google?.full_name) ?? pick(google?.name), email: pick(google?.email) };
  },
  saveName: saveNameIfNone,
};
