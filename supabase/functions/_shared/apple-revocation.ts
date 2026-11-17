// Sign in with Apple token revocation (DEL-4, ASR2-8).
// Exchanges the authorisation code from the app's Apple re-authentication at
// /auth/token, then revokes the refresh token (else the access token) at
// /auth/revoke. Best effort: it never throws, logs nothing and never reads an
// error body. Only WebCrypto, fetch, btoa, atob and TextEncoder, so it runs in
// Deno and Node alike.

export type AppleRevocationConfig = { teamId: string; keyId: string; clientId: string; privateKeyPem: string };

const APPLE = "https://appleid.apple.com";
const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_FOOTER = "-----END PRIVATE KEY-----";
const APPLE_ID = /^[A-Z0-9]{10}$/;
const CLIENT_ID = /^[A-Za-z0-9.-]{1,255}$/;
const AUTHORIZATION_CODE = /^[A-Za-z0-9._-]{1,1024}$/;
const encoder = new TextEncoder();

/** The four function secrets, or null unless all of them are set and well formed. */
export function appleRevocationConfig(get: (name: string) => string | undefined): AppleRevocationConfig | null {
  const teamId = get("APPLE_TEAM_ID");
  const keyId = get("APPLE_KEY_ID");
  const clientId = get("APPLE_CLIENT_ID");
  const key = get("APPLE_PRIVATE_KEY");
  if (!teamId || !keyId || !clientId || !key) return null;
  if (!APPLE_ID.test(teamId) || !APPLE_ID.test(keyId) || !CLIENT_ID.test(clientId)) return null;
  // The owner sets the .p8 key as a one-line secret, with literal "\n" for newlines.
  const privateKeyPem = key.replace(/\\n/g, "\n");
  if (!privateKeyPem.includes(PEM_HEADER)) return null;
  return { teamId, keyId, clientId, privateKeyPem };
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const jsonPart = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

function pemToDer(pem: string) {
  const body = pem.replace(PEM_HEADER, "").replace(PEM_FOOTER, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}

/** The client_secret Apple asks for: a compact ES256 JWS signed with the .p8 key, valid for five minutes. */
export async function appleClientSecret(config: AppleRevocationConfig, nowSeconds: number): Promise<string> {
  const header = jsonPart({ alg: "ES256", kid: config.keyId });
  const claims = jsonPart({
    iss: config.teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    aud: APPLE,
    sub: config.clientId,
  });
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(config.privateKeyPem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  // WebCrypto's ECDSA signature is already the raw 64-byte r||s that JWS wants.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
}

const post = (fetcher: typeof fetch, path: string, form: Record<string, string>) =>
  fetcher(`${APPLE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });

// Release the connection without reading what Apple sent.
const discard = (response: Response) => response.body?.cancel().catch(() => {});

const token = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Revokes the Apple tokens behind an authorisation code. Never throws. */
export async function revokeAppleAuthorization(
  code: string,
  config: AppleRevocationConfig,
  fetcher: typeof fetch = fetch,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<"revoked" | "failed"> {
  if (typeof code !== "string" || !AUTHORIZATION_CODE.test(code)) return "failed";
  try {
    const clientSecret = await appleClientSecret(config, now());
    const exchange = await post(fetcher, "/auth/token", {
      client_id: config.clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    });
    if (!exchange.ok) {
      await discard(exchange);
      return "failed";
    }
    const tokens = await exchange.json();
    const [value, hint] = token(tokens?.refresh_token)
      ? [tokens.refresh_token, "refresh_token"]
      : token(tokens?.access_token)
        ? [tokens.access_token, "access_token"]
        : [null, null];
    if (!value || !hint) return "failed";
    const revoke = await post(fetcher, "/auth/revoke", {
      client_id: config.clientId,
      client_secret: clientSecret,
      token: value,
      token_type_hint: hint,
    });
    await discard(revoke);
    return revoke.ok ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}
