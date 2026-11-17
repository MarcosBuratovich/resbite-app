// Writes src/domain/licences.json from package-lock.json and node_modules.
// Run from mobile/: node --import tsx scripts/generate-licences.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { buildLicences } from "../src/domain/licenceNotices.ts";

const reader = {
  read(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  list(dir) {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch {
      return null;
    }
  },
};
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const licences = buildLicences(lock, reader);
writeFileSync("src/domain/licences.json", JSON.stringify(licences, null, 2) + "\n");
console.log(
  `wrote ${licences.packages.length} packages, ${licences.texts.length} texts, 2 fonts, ${licences.native.length} native libraries`,
);
