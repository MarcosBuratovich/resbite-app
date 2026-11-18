// Generates the invitation-link site for review and deployment (UX3, link.resbite.com). Never uploads anything
// or changes app config: the output folder is deployed separately, as its own Vercel project.
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { invitationOrigin } from "../mobile/src/domain/appLinks.ts";
import { buildLegalPages } from "./legal/pages.mjs";
import { renderContactSent } from "./server/lib/contact.mjs";
import { PAGE_CSP } from "./server/lib/render.mjs";
import { siteFooter } from "./server/lib/site.mjs";
import { TERMS_VERSION_FALLBACK } from "./server/lib/options.mjs";

const MODES = ["final", "draft", "off"];
const USAGE =
  "Usage: node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs https://OWNED_DOMAIN TEAM_ID BUNDLE_ID OUTPUT_DIRECTORY [--legal=final|draft|off]";

/** The headers every invitation page carries; also written into vercel.json so the host serves them. */
export const INVITE_CSP =
  "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'";
const pageHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
  { key: "Content-Security-Policy", value: INVITE_CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

export async function generate(originValue, teamId, bundleId, output, options = {}) {
  const source = dirname(fileURLToPath(import.meta.url));
  const { legal = "final", legalDir = resolve(source, "../docs/legal") } = options;
  if (
    !MODES.includes(legal) ||
    !originValue ||
    !/^[A-Z0-9]{10}$/.test(teamId ?? "") ||
    !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId ?? "") ||
    !output
  ) {
    throw Error(USAGE);
  }
  const origin = invitationOrigin(originValue);
  const root = resolve(output);
  // The documents are checked before anything is written: a final build with an unfinished one leaves no folder.
  let legalPages = [];
  if (legal !== "off") {
    try {
      legalPages = await buildLegalPages({ legalDir, mode: legal });
    } catch (e) {
      if (legal === "final") e.message += "\nBuild with --legal=draft for a preview, or --legal=off to leave the legal pages out.";
      throw e;
    }
  }
  await mkdir(resolve(root, ".well-known"), { recursive: true });
  const write = (path, data) => writeFile(resolve(root, path), data, { flag: "wx" });
  await write(
    ".well-known/apple-app-site-association",
    JSON.stringify(
      {
        applinks: {
          details: [
            {
              appIDs: [`${teamId}.${bundleId}`],
              components: [
                { "/": "/invite", comment: "Resbite invitations only; auth setup remains separate." },
                { "/": "/r/*", comment: "Event links (GI1): the app opens on the invitation." },
              ],
            },
          ],
        },
      },
      null,
      2,
    ) + "\n",
  );
  // The preview image needs an absolute address; nothing else about the page depends on the origin.
  const page = (await readFile(resolve(source, "assets", "invite.html"), "utf8"))
    .replaceAll("{{ORIGIN}}", origin)
    .replaceAll("{{FOOTER}}", legal === "off" ? "" : siteFooter());
  await write("invite.html", page);
  for (const name of ["invite.js", "invite.css", "site.css"]) await write(name, await readFile(resolve(source, "assets", name)));
  await copyFile(resolve(source, "../mobile/assets/brand/resbite-mark.png"), resolve(root, "resbite-mark.png"));
  // The event page (GI1): two Vercel functions, their shared code, its style and script, and the activity
  // illustrations the image route serves. Nothing here holds a secret; the keys are Vercel environment variables.
  for (const dir of ["api", "lib", "activities"]) await mkdir(resolve(root, dir), { recursive: true });
  for (const name of await readdir(resolve(source, "server", "api")))
    if (legal !== "off" || name !== "contact.mjs") await copyFile(resolve(source, "server", "api", name), resolve(root, "api", name));
  // legal-mode.mjs is written below with this build's mode, not copied from the source.
  for (const name of await readdir(resolve(source, "server", "lib")))
    if (name !== "legal-mode.mjs") await copyFile(resolve(source, "server", "lib", name), resolve(root, "lib", name));
  await write("lib/legal-mode.mjs", `export const LEGAL_MODE = "${legal}";\n`);
  const legalRoutes = [];
  if (legal !== "off") {
    await write("legal.css", await readFile(resolve(source, "assets", "legal.css")));
    for (const p of legalPages) await write(p.file, p.html);
    await write("support-sent.html", renderContactSent());
    for (const p of legalPages) legalRoutes.push({ route: p.route, file: p.file, csp: p.csp, robots: p.robots });
    legalRoutes.push({ route: "/support/sent", file: "support-sent.html", csp: PAGE_CSP, robots: false });
  }
  const legalHeaders = legalRoutes.flatMap(({ route, file, csp, robots }) => {
    const headers = [
      { key: "Content-Security-Policy", value: csp },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Cache-Control", value: "public, max-age=300" },
      ...(robots ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
    ];
    return [{ source: route, headers }, { source: `/${file}`, headers }];
  });
  for (const name of ["page.css", "page.js", "personal.js", "personal-flow.mjs", "personal.css"]) await write(name, await readFile(resolve(source, "assets", name)));
  // The phone library's browser bundle (a classic script defining window.libphonenumber) and the country list as a
  // module: the CSP's script-src is 'self' and connect-src is Supabase only, so the list ships as code, never fetched.
  await write("libphonenumber-min.js", await readFile(resolve(source, "../mobile/node_modules/libphonenumber-js/bundle/libphonenumber-min.js")));
  const countries = JSON.parse(await readFile(resolve(source, "../mobile/src/domain/countries.json"), "utf8"));
  await write("countries.mjs", `export default ${JSON.stringify(countries)};\n`);
  for (const name of await readdir(resolve(source, "../mobile/assets/activities")))
    if (name.endsWith(".png")) await copyFile(resolve(source, "../mobile/assets/activities", name), resolve(root, "activities", name));
  await write(
    "vercel.json",
    JSON.stringify(
      {
        rewrites: [
          { source: "/invite", destination: "/invite.html" },
          // No pattern on :code: the functions render a malformed or truncated code as inactive.
          { source: "/r/:code/image", destination: "/api/image?code=:code" },
          { source: "/r/:code", destination: "/api/page?code=:code" },
          // The personal invitation page (contact invitations): web-only, so the Apple link file does not list /i/.
          { source: "/i/:code/image", destination: "/api/image?kind=personal&code=:code" },
          { source: "/i/:code", destination: "/api/personal?code=:code" },
          ...legalRoutes.map(({ route, file }) => ({ source: route, destination: `/${file}` })),
        ],
        redirects: [{ source: "/", destination: "https://www.resbite.com/", permanent: false }],
        // The image route reads these files from disk, so Vercel must bundle them with the function.
        regions: ["lhr1"],
        functions: { "api/image.mjs": { includeFiles: "{resbite-mark.png,activities/**}" } },
        headers: [
          {
            source: "/.well-known/apple-app-site-association",
            headers: [
              { key: "Content-Type", value: "application/json" },
              { key: "Cache-Control", value: "max-age=300" },
            ],
          },
          { source: "/invite", headers: pageHeaders },
          { source: "/invite.html", headers: pageHeaders },
          ...legalHeaders,
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await write(
    "hosting-requirements.txt",
    `Origin: ${origin}\nDeploy this folder as its own Vercel project (vercel.json sets the rewrite and headers).\nServe /invite as invite.html (200, no redirect).\nServe /.well-known/apple-app-site-association as application/json over HTTPS, without authentication or redirects.\nSet Referrer-Policy: no-referrer; Cache-Control: no-store on /invite.\nSet Content-Security-Policy: ${INVITE_CSP}\nDisable request query logging, analytics, session replay and third-party scripts on invitation pages. Fragments are not sent to the server.\nEvent pages (/r/<code>) are rendered by api/page.mjs and need these Vercel environment variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (cover photos only), LINK_ORIGIN, APP_STORE_URL, APP_STORE_ID (optional). Personal invitation pages (/i/<code>) are rendered by api/personal.mjs. Both, while their event is open, are answered from the browser through SUPABASE_URL (the only host their CSP allows) and read TERMS_VERSION (default ${TERMS_VERSION_FALLBACK}), TERMS_URL and PRIVACY_URL (both optional). \nLegal pages: ${legal}.\nFunctions run in London (lhr1).\nThe contact form (/api/contact) needs RESEND_API_KEY, a sending-only Resend key; without it the form tells people to email us.\nAdd per-address rate limits in the Vercel firewall for /r/*, /i/* and POST /api/contact.\n${legal === "draft" ? "DRAFT BUILD: deploy to a protected preview only, never to production.\n" : ""}Review before deployment; this script does not publish anything.\n`,
  );
  await write(
    "expo-ios-config.fragment.json",
    JSON.stringify({ ios: { associatedDomains: [`applinks:${new URL(origin).hostname}`] } }, null, 2) + "\n",
  );
  return root;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a) => !a.startsWith("--"));
  const legalFlags = flags.filter((a) => a.startsWith("--legal="));
  if (legalFlags.length > 1 || flags.length !== legalFlags.length) throw Error(USAGE);
  const legal = legalFlags.length ? legalFlags[0].slice("--legal=".length) : "final";
  const [originValue, teamId, bundleId, output] = positional;
  await generate(originValue, teamId, bundleId, output, { legal });
  console.log(
    "Generated the invitation-link site. Deploy it as its own Vercel project; domain association, the native build and device checks are still required.",
  );
  if (legal === "draft") console.log("Draft build: deploy it to a protected preview only.");
}
