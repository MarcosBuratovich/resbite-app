// GET /r/<code> (rewritten to /api/page?code=<code>): the event page or one of its closed states.
import { isLinkCode, pageHeaders, renderPage } from "../lib/render.mjs";
import { readInvitationPage } from "../lib/supabase.mjs";

export default async function handler(req, res) {
  const code = typeof req.query?.code === "string" ? req.query.code : "";
  let data = { state: "inactive" };
  if (isLinkCode(code)) {
    try {
      data = await readInvitationPage(code);
    } catch {
      // A database hiccup shows the same page as an unknown link; the host's link keeps working next time.
      data = { state: "inactive" };
    }
  }
  const html = renderPage(data, {
    origin: process.env.LINK_ORIGIN || "https://link.resbite.com",
    code: isLinkCode(code) ? code : "",
    appStoreUrl: process.env.APP_STORE_URL || "https://apps.apple.com/",
    appStoreId: process.env.APP_STORE_ID || "",
  });
  for (const [key, value] of Object.entries(pageHeaders())) res.setHeader(key, value);
  res.status(200).send(html);
}
