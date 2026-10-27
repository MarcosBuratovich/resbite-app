// GET /i/<code> (rewritten to /api/personal?code=<code>): the personal invitation page or one of its closed states.
import { isLinkCode } from "../lib/render.mjs";
import { personalHeaders, renderPersonalPage } from "../lib/personal.mjs";
import { pageOptions } from "../lib/options.mjs";
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
  const options = pageOptions(code);
  const html = renderPersonalPage(data, options);
  for (const [key, value] of Object.entries({ ...personalHeaders(options.supabaseUrl), "X-Robots-Tag": "noindex, nofollow" })) res.setHeader(key, value);
  res.status(200).send(html);
}
