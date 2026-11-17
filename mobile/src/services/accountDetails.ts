import type { User } from "@supabase/supabase-js";

// Plan 4 (D-9): the optional details are gone, so this only reads the account (AccountState). The captured
// bearer token binds the read to the account that started it, never a later session's.
export function accountDetailsAdapter(accessToken: string): {
  read(signal: AbortSignal): Promise<User>;
} {
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
      return user as User;
    },
  };
}
