import type { KeyStore } from "./secureChunks";

/** A personal link's code and the name it was made for, kept so the host can send it again. */
export type StoredInvite = { code: string; name: string; sentVia?: "whatsapp" | "messages" };
type Saved = Record<string, Record<string, StoredInvite>>;

/** The host's personal codes, on their phone only, by account, event and E.164 number. */
export function createInviteCodeStore(store: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };
  const key = (scope: string) => `resbite.invite-codes.v1.${scope}`;
  async function read(scope: string): Promise<Saved> {
    const raw = await store.getItem(key(scope));
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("Invalid saved invitation codes");
    return data;
  }
  const change = (scope: string, update: (d: Saved) => Saved) =>
    run(async () => {
      await store.setItem(key(scope), JSON.stringify(update(await read(scope))));
    });
  return {
    get: (scope: string, plan: string) => run(async () => (await read(scope))[plan] ?? {}),
    put: (scope: string, plan: string, e164: string, value: StoredInvite) =>
      change(scope, (d) => ({ ...d, [plan]: { ...d[plan], [e164]: value } })),
    remove: (scope: string, plan: string, e164: string) =>
      change(scope, (d) => {
        const { [e164]: _gone, ...rest } = d[plan] ?? {};
        const { [plan]: _old, ...others } = d;
        return Object.keys(rest).length ? { ...others, [plan]: rest } : others;
      }),
    clear: (scope: string) => run(() => store.removeItem(key(scope))),
  };
}

// The secure storage loads on first use, so the store's logic runs under node without React Native.
const device = async () => (await import("./supabase")).storage;
export const inviteCodeStore = createInviteCodeStore({
  getItem: async (k) => (await device()).getItem(k),
  setItem: async (k, v) => (await device()).setItem(k, v),
  removeItem: async (k) => (await device()).removeItem(k),
});
