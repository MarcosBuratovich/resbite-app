// GI2 Sign in with Apple, native: Apple's sheet signs the request with a SHA-256 hash of a one-use
// nonce, and Supabase checks the identity token against the raw nonce. The native modules load
// lazily so the mapper runs under node with stub dependencies, as calendar.ts and contacts.ts do.

export type AppleCredential = {
  identityToken: string | null;
  email: string | null;
  fullName: { givenName: string | null; familyName: string | null } | null;
};
export type AppleSignInDeps = {
  randomUUID: () => string;
  sha256: (text: string) => Promise<string>;
  requestCredential: (hashedNonce: string) => Promise<AppleCredential>;
  signInWithIdToken: (args: {
    provider: "apple";
    token: string;
    nonce: string;
  }) => Promise<{ error: { message: string; status?: number } | null }>;
};
export type AppleSignInResult =
  | { ok: true; name: string | null }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

const connectionCopy = "Check your connection and try again.";
// auth-js returns network failures as status 0 rather than throwing (emailCode.ts does the same).
const isConnectionFailure = (error: { status?: number }) =>
  error.status === 0 || (error.status !== undefined && error.status >= 500);

/** Apple's name joined as given then family, or `null`. Apple sends it on the first authorisation only. */
export function appleName(fullName: AppleCredential["fullName"]): string | null {
  const parts = [fullName?.givenName, fullName?.familyName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/**
 * A closed sheet is `cancelled`, not an error: the screen stays as it was and nothing is stored.
 * Supabase's error is shown as it is, unless it is a connection failure (status 0 or 500 and above);
 * that and any other failure get the connection copy, since Apple's own messages are technical
 * (signInAsync throws ERR_REQUEST_FAILED itself when the token is missing).
 */
export async function signInWithApple(d: AppleSignInDeps): Promise<AppleSignInResult> {
  try {
    const nonce = d.randomUUID();
    const credential = await d.requestCredential(await d.sha256(nonce));
    if (!credential.identityToken) return { ok: false, cancelled: false, message: connectionCopy };
    const { error } = await d.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce });
    if (error)
      return { ok: false, cancelled: false, message: isConnectionFailure(error) ? connectionCopy : error.message };
    return { ok: true, name: appleName(credential.fullName) };
  } catch (failure) {
    if (typeof failure === "object" && failure !== null && "code" in failure && failure.code === "ERR_REQUEST_CANCELED")
      return { ok: false, cancelled: true };
    return { ok: false, cancelled: false, message: connectionCopy };
  }
}

const expoCrypto = () => require("expo-crypto") as typeof import("expo-crypto");
const apple = () => require("expo-apple-authentication") as typeof import("expo-apple-authentication");

export const appleSignInDeps: AppleSignInDeps = {
  randomUUID: () => expoCrypto().randomUUID(),
  sha256: (text) => expoCrypto().digestStringAsync(expoCrypto().CryptoDigestAlgorithm.SHA256, text),
  requestCredential: async (hashedNonce) => {
    const { AppleAuthenticationScope, signInAsync } = apple();
    const credential = await signInAsync({
      requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    return { identityToken: credential.identityToken, email: credential.email, fullName: credential.fullName };
  },
  signInWithIdToken: (args) => {
    const { supabase } = require("./supabase") as typeof import("./supabase");
    return supabase.auth.signInWithIdToken(args);
  },
};

/** Whether to offer Apple: iOS with Apple authentication available; `false` on web and Android. */
export const appleSignInAvailable = async (): Promise<boolean> => {
  // Only Platform: a namespace import evaluates React Native's lazy legacy getters (contacts.ts).
  const { Platform } = require("react-native") as typeof import("react-native");
  if (Platform.OS !== "ios") return false;
  return apple().isAvailableAsync().catch(() => false);
};
