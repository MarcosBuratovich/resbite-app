import { httpsUrl } from "./legal";
import { supportAddress } from "./safetyCopy";

export type ReleaseEnv = Readonly<Record<string, string | undefined>>;

/** The placeholders of mobile/.env.example and the client's own stand-ins (services/supabase.ts, phoneFold.ts). */
const PLACEHOLDER_PROJECTS = new Set(["your_project", "unconfigured"]);
const PLACEHOLDER_KEYS = new Set(["YOUR_PUBLISHABLE_KEY", "unconfigured"]);

/** True for a hosted project's URL, `https://<project-ref>.supabase.co`, that is not a placeholder. */
function supabaseProjectUrl(value: string | undefined): boolean {
  const text = httpsUrl(value);
  if (text === null) return false;
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(new URL(text).hostname);
  return match !== null && !PLACEHOLDER_PROJECTS.has(match[1]);
}

/**
 * What a production build must have before it can be submitted. One line per problem, in a fixed order. Run by EAS as
 * its `eas-build-post-install` hook for the production profile (scripts/check-release.mjs).
 */
export function releaseProblems(env: ReleaseEnv): string[] {
  const problems: string[] = [];
  if (supportAddress(env.EXPO_PUBLIC_SUPPORT_ADDRESS) === null)
    problems.push("EXPO_PUBLIC_SUPPORT_ADDRESS must be the support email address.");
  // Without them the build signs no one in: every call goes to unconfigured.supabase.co and deletion is off.
  if (!supabaseProjectUrl(env.EXPO_PUBLIC_SUPABASE_URL))
    problems.push("EXPO_PUBLIC_SUPABASE_URL must be the project's https URL.");
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (key === "" || PLACEHOLDER_KEYS.has(key)) problems.push("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
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
