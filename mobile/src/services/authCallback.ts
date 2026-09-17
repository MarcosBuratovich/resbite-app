import { supabase } from "./supabase";
// Router and the native OAuth browser may receive the same one-use callback.
const exchanges = new Map<string, Promise<void>>();
export function exchangeAuthCode(code: string): Promise<void> {
  const existing = exchanges.get(code);
  if (existing) return existing;
  const pending = supabase.auth
    .exchangeCodeForSession(code)
    .then(({ error }) => {
      if (error) throw error;
    });
  exchanges.set(code, pending);
  if (exchanges.size > 8) exchanges.delete(exchanges.keys().next().value!);
  return pending;
}
