// The production release check. EAS runs it as `eas-build-post-install`; `npm run check:release` runs it by hand.
import { releaseProblems } from "../src/domain/releaseChecks.ts";
import { legalUrls } from "../src/domain/legal.ts";

const profile = process.env.EAS_BUILD_PROFILE;
if (profile && profile !== "production") {
  console.log(`Release check skipped: build profile "${profile}" is not production.`);
  process.exit(0);
}

const problems = releaseProblems(process.env);
if (problems.length > 0) {
  console.error("Release check failed:");
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const urls = legalUrls({ terms: process.env.EXPO_PUBLIC_TERMS_URL, privacy: process.env.EXPO_PUBLIC_PRIVACY_URL });
console.log(
  `PASS release check: support address set, push on, deletion on, Privacy Policy ${urls.privacy}, Terms of Use ${urls.terms}, Support ${urls.support}.`,
);
