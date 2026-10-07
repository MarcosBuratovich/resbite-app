import { supabase } from "./supabase";
// Router and the native OAuth browser may receive the same one-use callback.
const exchanges = new Map<string, Promise<string>>();
export function exchangeAuthCode(code: string): Promise<string> {
  const existing = exchanges.get(code);
  if (existing) return existing;
  const pending = supabase.auth
    .exchangeCodeForSession(code)
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data.session) throw new Error("No session returned for this link.");
      return data.session.user.id;
    });
  exchanges.set(code, pending);
  if (exchanges.size > 8) exchanges.delete(exchanges.keys().next().value!);
  return pending;
}
