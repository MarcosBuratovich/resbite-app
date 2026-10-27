// GET /i/<code> (rewritten to /api/personal?code=<code>): the personal invitation page or one of its closed states.
import { isLinkCode } from "../lib/render.mjs";
import { personalHeaders, renderPersonalPage } from "../lib/personal.mjs";
import { readPersonalInvitation } from "../lib/supabase.mjs";

/** `deps` lets tests inject the database reader. */
export default async function handler(req, res, deps = {}) {
  const read = deps.readPersonalInvitation ?? readPersonalInvitation;
  const code = typeof req.query?.code === "string" ? req.query.code : "";
  let data = { state: "inactive" };
  if (isLinkCode(code)) {
    try {
      data = await read(code);
    } catch {
      // A database hiccup shows the same page as an unknown link; the host's link keeps working next time.
      data = { state: "inactive" };
    }
  }
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const html = renderPersonalPage(data, {
    origin: process.env.LINK_ORIGIN || "https://link.resbite.com",
    code: isLinkCode(code) ? code : "",
    appStoreUrl: process.env.APP_STORE_URL || "https://apps.apple.com/",
    supabaseUrl,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
    termsVersion: process.env.TERMS_VERSION || "2026-10",
    termsUrl: process.env.TERMS_URL || "",
    privacyUrl: process.env.PRIVACY_URL || "",
  });
  for (const [key, value] of Object.entries({ ...personalHeaders(supabaseUrl), "X-Robots-Tag": "noindex, nofollow" })) res.setHeader(key, value);
  res.status(200).send(html);
}
