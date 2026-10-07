// Generates reviewable local artifacts only. Never uploads or changes app config.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { invitationOrigin } from "../mobile/src/domain/appLinks.ts";
const [originValue, teamId, bundleId, output] = process.argv.slice(2);
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
const write = (path, data) =>
  writeFile(resolve(root, path), data, { flag: "wx" });
await write(
  ".well-known/apple-app-site-association",
  JSON.stringify(
    {
      applinks: {
        details: [
          {
            appIDs: [`${teamId}.${bundleId}`],
            components: [
              {
                "/": "/invite",
                comment:
                  "Resbite invitations only; auth setup remains separate.",
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  ) + "\n",
);
for (const name of ["invite.html", "invite.js", "invite.css"]) {
  await write(name, await readFile(resolve(source, "assets", name)));
}
await write(
  "hosting-requirements.txt",
  `Origin: ${origin}\nServe /invite as invite.html (200, no redirect).\nServe /.well-known/apple-app-site-association as application/json over HTTPS, without authentication or redirects.\nSet Referrer-Policy: no-referrer; Cache-Control: no-store on /invite.\nSet Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'\nDisable request query logging, analytics, session replay and third-party scripts on invitation pages. Fragments are not sent to the server.\nReview before deployment; this script does not publish anything.\n`,
);
await write(
  "expo-ios-config.fragment.json",
  JSON.stringify(
    { ios: { associatedDomains: [`applinks:${new URL(origin).hostname}`] } },
    null,
    2,
  ) + "\n",
);
console.log(
  "Generated local invitation-link files. Domain association, native build and device verification are still required.",
);
