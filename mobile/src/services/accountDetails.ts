import type { User } from "@supabase/supabase-js";
import {
  detailsFromMetadata,
  optionalMetadata,
  hasReviewedDetails,
  validateOptionalDetails,
  type RegistrationDetails,
} from "../domain/registration";

export type DetailsAdapter = {
  read(signal: AbortSignal): Promise<User>;
  update(data: Record<string, unknown>, signal: AbortSignal): Promise<User>;
};
const fingerprint = (user: User) =>
  JSON.stringify(optionalMetadata(detailsFromMetadata(user.user_metadata)));
export async function saveAccountDetails(options: {
  accountId: string;
  baseline: User;
  value: RegistrationDetails;
  assertCurrent: () => void;
  adapter: DetailsAdapter;
}): Promise<User> {
  const { accountId, baseline, value, assertCurrent, adapter } = options;
  const error = validateOptionalDetails(value);
  if (error) throw Error(error);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = (user?: User) => {
    assertCurrent();
    if (controller.signal.aborted)
      throw Error(
        "Save could not be confirmed. Your changes are kept; try Save again to check.",
      );
    if (user && user.id !== accountId)
      throw Error("Account changed. Reopen your account details.");
  };
  const desired = optionalMetadata(value);
  const matches = (user: User) =>
    fingerprint(user) === JSON.stringify(desired) &&
    hasReviewedDetails(user.user_metadata);
  const work = async () => {
    check(baseline);
    const fresh = await adapter.read(controller.signal);
    check(fresh);
    // A previous attempt may have reached the server even if its reply was lost.
    if (matches(fresh)) return fresh;
    if (fingerprint(fresh) !== fingerprint(baseline))
      throw Error(
        "Your account details changed on another device. Reload saved details before editing again.",
      );
    const metadata = fresh.user_metadata ?? {};
    const old = metadata.registration_details;
    try {
      check();
      const saved = await adapter.update(
        {
          registration_details: {
            ...(old && typeof old === "object" && !Array.isArray(old)
              ? old
              : {}),
            ...desired,
          },
          registration_details_version: 1,
        },
        controller.signal,
      );
      check(saved);
      if (!matches(saved)) throw Error("Saved details could not be verified.");
      return saved;
    } catch {
      check();
      const saved = await adapter.read(controller.signal);
      check(saved);
      if (matches(saved)) return saved;
      if (fingerprint(saved) !== fingerprint(baseline))
        throw Error(
          "Your account details changed on another device. Reload saved details before editing again.",
        );
      throw Error(
        "Save could not be confirmed. Your changes are kept; try Save again to check.",
      );
    }
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            Error(
              "Save could not be confirmed. Your changes are kept; try Save again to check.",
            ),
          );
        }, 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Explicit bearer binding prevents a delayed write from adopting a different account's session.
export function accountDetailsAdapter(accessToken: string): DetailsAdapter {
  let baseline: User | null = null;
  const headers = {
    apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return {
    async read(signal) {
      const response = await fetch(`${base}/auth/v1/user`, { headers, signal });
      if (!response.ok)
        throw Error("Account details could not be reached. Please try again.");
      const user = await response.json();
      if (!user || typeof user.id !== "string")
        throw Error("Account details could not be verified.");
      baseline = user as User;
      return baseline;
    },
    async update(data, signal) {
      if (!baseline) throw Error("Load account details before saving.");
      const current = baseline;
      const response = await fetch(
        `${base}/rest/v1/rpc/save_registration_details`,
        {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify({
            p_expected: current.user_metadata?.registration_details ?? null,
            p_details: optionalMetadata(detailsFromMetadata(data)),
          }),
        },
      );
      if (!response.ok)
        throw Error(
          "Account details could not be saved. Reload to check for changes.",
        );
      const result = await response.json();
      if (
        result?.account_id !== current.id ||
        !result.registration_details ||
        typeof result.registration_details !== "object"
      )
        throw Error("Saved account details could not be verified.");
      return {
        ...current,
        user_metadata: {
          ...current.user_metadata,
          registration_details: result.registration_details,
          registration_details_version: 1,
        },
      };
    },
  };
}
