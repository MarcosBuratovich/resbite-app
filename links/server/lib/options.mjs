// The link pages' settings from the Vercel environment, with their defaults in one place: api/page.mjs (/r/<code>)
// and api/personal.mjs (/i/<code>) both render from these. None of them is a secret; the secret key is read only by
// supabase.mjs, to sign cover photos.
import { isLinkCode } from "./render.mjs";

/** The renderers' options for a request's code ("" unless it is a well-formed link code). `env` is for tests. */
export function pageOptions(code, env = process.env) {
  return {
    origin: env.LINK_ORIGIN || "https://link.resbite.com",
    code: isLinkCode(code) ? code : "",
    appStoreUrl: env.APP_STORE_URL || "https://apps.apple.com/",
    // The smart app banner's id: empty while the app is only on TestFlight. The personal page shows no banner.
    appStoreId: env.APP_STORE_ID || "",
    supabaseUrl: env.SUPABASE_URL || "",
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY || "",
    termsVersion: env.TERMS_VERSION || "2026-10",
    termsUrl: env.TERMS_URL || "",
    privacyUrl: env.PRIVACY_URL || "",
  };
}
