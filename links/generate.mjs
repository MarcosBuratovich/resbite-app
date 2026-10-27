// Generates the invitation-link site for review and deployment (UX3, link.resbite.com). Never uploads anything
// or changes app config: the output folder is deployed separately, as its own Vercel project.
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { invitationOrigin } from "../mobile/src/domain/appLinks.ts";

/** The headers every invitation page carries; also written into vercel.json so the host serves them. */
export const INVITE_CSP =
  "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'";
const pageHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
  { key: "Content-Security-Policy", value: INVITE_CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

export async function generate(originValue, teamId, bundleId, output) {
  if (
    !originValue ||
    !/^[A-Z0-9]{10}$/.test(teamId ?? "") ||
    !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId ?? "") ||
    !output
  ) {
    throw Error(
      "Usage: node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs https://OWNED_DOMAIN TEAM_ID BUNDLE_ID OUTPUT_DIRECTORY",
    );
  }
  const origin = invitationOrigin(originValue);
  const root = resolve(output),
    source = dirname(fileURLToPath(import.meta.url));
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
  const page = (await readFile(resolve(source, "assets", "invite.html"), "utf8")).replaceAll("{{ORIGIN}}", origin);
  await write("invite.html", page);
  for (const name of ["invite.js", "invite.css"]) await write(name, await readFile(resolve(source, "assets", name)));
  await copyFile(resolve(source, "../mobile/assets/brand/resbite-mark.png"), resolve(root, "resbite-mark.png"));
  // The event page (GI1): two Vercel functions, their shared code, its style and script, and the activity
  // illustrations the image route serves. Nothing here holds a secret; the keys are Vercel environment variables.
  for (const dir of ["api", "lib", "activities"]) await mkdir(resolve(root, dir), { recursive: true });
  for (const name of await readdir(resolve(source, "server", "api"))) await copyFile(resolve(source, "server", "api", name), resolve(root, "api", name));
  for (const name of await readdir(resolve(source, "server", "lib"))) await copyFile(resolve(source, "server", "lib", name), resolve(root, "lib", name));
  for (const name of ["page.css", "page.js", "personal.js", "personal-flow.mjs", "personal.css"]) await write(name, await readFile(resolve(source, "assets", name)));
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
        ],
        redirects: [{ source: "/", destination: "https://www.resbite.com/", permanent: false }],
        // The image route reads these files from disk, so Vercel must bundle them with the function.
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
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await write(
    "hosting-requirements.txt",
    `Origin: ${origin}\nDeploy this folder as its own Vercel project (vercel.json sets the rewrite and headers).\nServe /invite as invite.html (200, no redirect).\nServe /.well-known/apple-app-site-association as application/json over HTTPS, without authentication or redirects.\nSet Referrer-Policy: no-referrer; Cache-Control: no-store on /invite.\nSet Content-Security-Policy: ${INVITE_CSP}\nDisable request query logging, analytics, session replay and third-party scripts on invitation pages. Fragments are not sent to the server.\nEvent pages (/r/<code>) are rendered by api/page.mjs and need these Vercel environment variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (cover photos only), LINK_ORIGIN, APP_STORE_URL, APP_STORE_ID (optional). Personal invitation pages (/i/<code>) are rendered by api/personal.mjs and also read TERMS_VERSION (default 2026-10), TERMS_URL and PRIVACY_URL (both optional). Add a per-address rate limit for /r/* and /i/* in the Vercel firewall.\nReview before deployment; this script does not publish anything.\n`,
  );
  await write(
    "expo-ios-config.fragment.json",
    JSON.stringify({ ios: { associatedDomains: [`applinks:${new URL(origin).hostname}`] } }, null, 2) + "\n",
  );
  return root;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [originValue, teamId, bundleId, output] = process.argv.slice(2);
  await generate(originValue, teamId, bundleId, output);
  console.log(
    "Generated the invitation-link site. Deploy it as its own Vercel project; domain association, the native build and device checks are still required.",
  );
}
