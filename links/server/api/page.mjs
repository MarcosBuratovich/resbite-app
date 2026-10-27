// GET /r/<code> (rewritten to /api/page?code=<code>): the open link's page or one of its closed states. An open link
// is the personal page's steps in open mode (open-link approval, plan 3), with the /i/ CSP so its script can reach
// Supabase; a closed one is GI1's page with the strict CSP.
import { isLinkCode, pageHeaders, renderClosedPage } from "../lib/render.mjs";
import { personalHeaders, renderOpenLinkPage } from "../lib/personal.mjs";
import { readInvitationPage } from "../lib/supabase.mjs";

/** `deps` lets tests inject the database reader. */
export default async function handler(req, res, deps = {}) {
  const read = deps.readInvitationPage ?? readInvitationPage;
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
  const options = {
    origin: process.env.LINK_ORIGIN || "https://link.resbite.com",
    code: isLinkCode(code) ? code : "",
    appStoreUrl: process.env.APP_STORE_URL || "https://apps.apple.com/",
    appStoreId: process.env.APP_STORE_ID || "",
    supabaseUrl,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
    termsVersion: process.env.TERMS_VERSION || "2026-10",
    termsUrl: process.env.TERMS_URL || "",
    privacyUrl: process.env.PRIVACY_URL || "",
  };
  const open = data?.state === "open";
  const html = open ? renderOpenLinkPage(data, options) : renderClosedPage(data, options);
  for (const [key, value] of Object.entries(open ? personalHeaders(supabaseUrl) : pageHeaders())) res.setHeader(key, value);
  res.status(200).send(html);
}
