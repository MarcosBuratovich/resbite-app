// Read-only checks of a deployed link site, run by the owner after a deploy: node links/check-live.mjs https://link.resbite.com
// GET only, no redirects followed, nothing sent to the contact function. Prints PASS and the x-vercel-id of an /i/ reply
// (for the region record), or the failures, and exits 1.
import { LEGAL_PAGES } from "./legal/pages.mjs";
import { COMPANY } from "./server/lib/site.mjs";

const CODE = "AAAAAAAAAAAAAAAAAAAAAA";
const PARTICULARS = `${COMPANY.name} is a private limited company registered in ${COMPANY.registeredIn}, company number ${COMPANY.number}. Registered office: ${COMPANY.office}.`;
const FORBIDDEN = ["[[OWNER:", "draft for solicitor review", "before publishing", "<script"];

/** Every failure as "<path>: <what>"; [] when all pass. `last` receives the /i/ reply's headers when given. */
export async function checkSite(origin, fetchImpl = fetch, last = {}) {
  const base = origin.replace(/\/+$/, "");
  const failures = [];
  const fail = (path, what) => failures.push(`${path}: ${what}`);
  const get = async (path) => {
    try {
      const res = await fetchImpl(`${base}${path}`, { method: "GET", redirect: "manual" });
      return { res, body: await res.text() };
    } catch (e) {
      fail(path, `the request failed (${e?.message ?? e})`);
      return null;
    }
  };
  const ok200 = (path, got) => {
    if (got.res.status !== 200) {
      fail(path, `expected 200, got ${got.res.status}`);
      return false;
    }
    return true;
  };

  for (const page of LEGAL_PAGES) {
    const got = await get(page.route);
    if (!got || !ok200(page.route, got)) continue;
    const { res, body } = got;
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) fail(page.route, "not text/html");
    if (res.headers.get("content-security-policy") !== page.csp) fail(page.route, "the CSP header is not the page's own");
    if (res.headers.get("x-content-type-options") !== "nosniff") fail(page.route, "no nosniff header");
    if (!body.includes(PARTICULARS)) fail(page.route, "the footer's particulars are missing");
    for (const anchor of page.anchors) if (!body.includes(`id="${anchor}"`)) fail(page.route, `no id="${anchor}"`);
    for (const bad of FORBIDDEN) if (body.includes(bad)) fail(page.route, `contains "${bad}"`);
    if (page.form && !body.includes('action="/api/contact"')) fail(page.route, "the form does not post to /api/contact");
  }

  const sent = await get("/support/sent");
  if (sent && ok200("/support/sent", sent) && !(sent.res.headers.get("x-robots-tag") ?? "").includes("noindex")) fail("/support/sent", "no noindex");

  const contact = await get("/api/contact");
  if (contact && contact.res.status !== 405) fail("/api/contact", `expected 405, got ${contact.res.status}`);

  const invite = await get("/invite");
  if (invite && ok200("/invite", invite)) {
    if (!invite.body.includes('class="site-footer"')) fail("/invite", "no footer");
    if (/private testing/i.test(invite.body)) fail("/invite", 'still says "private testing"');
  }

  for (const path of [`/i/${CODE}`, `/r/${CODE}`]) {
    const got = await get(path);
    if (!got || !ok200(path, got)) continue;
    if (path.startsWith("/i/")) last.vercelId = got.res.headers.get("x-vercel-id");
    if (!got.body.includes("This invitation is no longer active.")) fail(path, "not the inactive page");
    if (!got.body.includes('class="site-footer"')) fail(path, "no footer");
    const csp = got.res.headers.get("content-security-policy") ?? "";
    if (!csp.includes("default-src 'none'") || !csp.includes("script-src 'self'")) fail(path, "the CSP lacks default-src 'none' or script-src 'self'");
  }

  const aasa = await get("/.well-known/apple-app-site-association");
  if (aasa && ok200("/.well-known/apple-app-site-association", aasa)) {
    const path = "/.well-known/apple-app-site-association";
    if (!(aasa.res.headers.get("content-type") ?? "").includes("application/json")) fail(path, "not application/json");
    try {
      const paths = JSON.parse(aasa.body).applinks.details[0].components.map((c) => c["/"]);
      if (JSON.stringify(paths) !== JSON.stringify(["/invite", "/r/*"])) fail(path, `paths are ${JSON.stringify(paths)}`);
    } catch {
      fail(path, "not the expected JSON");
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const origin = process.argv[2];
  if (!/^https?:\/\//.test(origin ?? "")) {
    console.error("Usage: node links/check-live.mjs https://link.resbite.com");
    process.exit(2);
  }
  const last = {};
  const failures = await checkSite(origin, fetch, last);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`PASS: ${origin} serves the four legal pages, the form's pages, /invite, /i/ and /r/ and the Apple link file as expected. x-vercel-id of /i/: ${last.vercelId ?? "(none)"}`);
}
