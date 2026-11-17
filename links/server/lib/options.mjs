// The link pages' settings from the Vercel environment, with their defaults in one place: api/page.mjs (/r/<code>)
// and api/personal.mjs (/i/<code>) both render from these. None of them is a secret; the secret key is read only by
// supabase.mjs, to sign cover photos.
import { isLinkCode } from "./render.mjs";
import { LEGAL_MODE } from "./legal-mode.mjs";

/** Used when TERMS_VERSION is unset or is not YYYY-MM, the only form the database accepts. Plan 4 owns its value. */
export const TERMS_VERSION_FALLBACK = "2026-12";

/** The renderers' options for a request's code ("" unless it is a well-formed link code). `env` is for tests. */
export function pageOptions(code, env = process.env, mode = LEGAL_MODE) {
  const legal = mode !== "off";
  const origin = env.LINK_ORIGIN || "https://link.resbite.com";
  return {
    origin,
    code: isLinkCode(code) ? code : "",
    appStoreUrl: env.APP_STORE_URL || "https://apps.apple.com/",
    // The smart app banner's id: empty while the app is only on TestFlight. The personal page shows no banner.
    appStoreId: env.APP_STORE_ID || "",
    supabaseUrl: env.SUPABASE_URL || "",
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY || "",
    termsVersion: /^\d{4}-(0[1-9]|1[0-2])$/.test(env.TERMS_VERSION || "") ? env.TERMS_VERSION : TERMS_VERSION_FALLBACK,
    termsUrl: env.TERMS_URL || (legal ? `${origin}/terms` : ""),
    privacyUrl: env.PRIVACY_URL || (legal ? `${origin}/privacy` : ""),
    legal,
  };
}
