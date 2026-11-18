// The Terms version is one value in three places that must change together in one commit: the app's constant, the link
// site's fallback and the literal in the publishing script. Run from mobile/: node --import tsx ../links/terms-version.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TERMS_VERSION } from "../mobile/src/domain/guestAccount.ts";
import { TERMS_VERSION_FALLBACK } from "./server/lib/options.mjs";

assert.match(TERMS_VERSION, /^\d{4}-(0[1-9]|1[0-2])$/);
assert.equal(TERMS_VERSION_FALLBACK, TERMS_VERSION, "the link site's fallback differs from the app's TERMS_VERSION");
const sql = readFileSync(new URL("../supabase/ops/publish-terms-version.sql", import.meta.url), "utf8");
const literal = sql.match(/with input\(version\) as \(values \('([^']+)'\)\)/);
assert.ok(literal, "publish-terms-version.sql no longer has its one version literal");
assert.equal(literal[1], TERMS_VERSION, "the publish script's version differs from the app's TERMS_VERSION");
console.log("terms version: app, link-site fallback and publish script agree");
