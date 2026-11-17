import { httpsUrl } from "./legal";
import { supportAddress } from "./safetyCopy";

export type ReleaseEnv = Readonly<Record<string, string | undefined>>;

/**
 * What a production build must have before it can be submitted. One line per problem, in a fixed order. Run by EAS as
 * its `eas-build-post-install` hook for the production profile (scripts/check-release.mjs).
 */
export function releaseProblems(env: ReleaseEnv): string[] {
  const problems: string[] = [];
  if (supportAddress(env.EXPO_PUBLIC_SUPPORT_ADDRESS) === null)
    problems.push("EXPO_PUBLIC_SUPPORT_ADDRESS must be the support email address.");
  for (const name of ["EXPO_PUBLIC_TERMS_URL", "EXPO_PUBLIC_PRIVACY_URL"]) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "" && httpsUrl(value) === null)
      problems.push(`${name} is set but is not an https link.`);
  }
  if (env.EXPO_PUBLIC_PUSH_ENABLED !== "true") problems.push('EXPO_PUBLIC_PUSH_ENABLED must be "true".');
  if (env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED !== "true")
    problems.push('EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED must be "true".');
  return problems;
}
