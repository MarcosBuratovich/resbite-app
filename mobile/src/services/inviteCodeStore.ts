import type { KeyStore } from "./secureChunks";

/** A personal link's code and the name it was made for, kept so the host can send it again. */
export type StoredInvite = {
  code: string;
  name: string;
  sentVia?: "whatsapp" | "messages";
};
type Saved = Record<string, Record<string, StoredInvite>>;

/** The host's personal codes, on their phone only, by account, event and E.164 number. */
export function createInviteCodeStore(store: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };
  const epochs = new Map<string, number>();
  const blocked = new Set<string>();
  const key = (scope: string) => `resbite.invite-codes.v1.${scope}`;
  async function read(scope: string): Promise<Saved> {
    const raw = await store.getItem(key(scope));
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Error("Invalid saved invitation codes");
    return data;
  }
  const epochOf = (scope: string) => epochs.get(scope) ?? 0;
  // A write issued after sign-out began (or finishing after the clear) must not bring the codes back.
  function change(scope: string, update: (d: Saved) => Saved) {
    if (blocked.has(scope)) return Promise.reject(Error("Session changed"));
    const epoch = epochOf(scope);
    return run(async () => {
      if (epoch !== epochOf(scope)) throw Error("Session changed");
      const current = await read(scope);
      if (blocked.has(scope) || epoch !== epochOf(scope))
        throw Error("Session changed");
      await store.setItem(key(scope), JSON.stringify(update(current)));
    });
  }
  return {
    suspend: (scope: string) => {
      blocked.add(scope);
      epochs.set(scope, epochOf(scope) + 1);
    },
    resume: (scope: string) => {
      blocked.delete(scope);
    },
    get: (scope: string, plan: string) =>
      run(async () => (await read(scope))[plan] ?? {}),
    put: (scope: string, plan: string, e164: string, value: StoredInvite) =>
      change(scope, (d) => ({ ...d, [plan]: { ...d[plan], [e164]: value } })),
    remove: (scope: string, plan: string, e164: string) =>
      change(scope, (d) => {
        const { [e164]: _gone, ...rest } = d[plan] ?? {};
        const { [plan]: _old, ...others } = d;
        return Object.keys(rest).length ? { ...others, [plan]: rest } : others;
      }),
    clear: (scope: string) => {
      epochs.set(scope, epochOf(scope) + 1);
      return run(() => store.removeItem(key(scope)));
    },
  };
}

// The secure storage loads on first use, so the store's logic runs under node without React Native.
const device = async () => (await import("./supabase")).storage;
export const inviteCodeStore = createInviteCodeStore({
  getItem: async (k) => (await device()).getItem(k),
  setItem: async (k, v) => (await device()).setItem(k, v),
  removeItem: async (k) => (await device()).removeItem(k),
});
