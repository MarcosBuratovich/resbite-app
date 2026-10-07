import type { KeyStore } from "./secureChunks";

export const RECENT_PLACES_MAX = 5;

// UX-P6: the account's last five meeting places, on this device only, cleared at
// sign-out and account deletion. A convenience: unreadable data reads as none.
export function createRecentPlacesStore(storage: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  const key = (scope: string) => `resbite.recent-places.v1.${scope}`;
  async function read(scope: string): Promise<string[]> {
    const raw = await storage.getItem(key(scope));
    let items: unknown;
    try {
      items = raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
    return Array.isArray(items)
      ? items
          .filter((item): item is string => typeof item === "string" && item.trim() !== "")
          .slice(0, RECENT_PLACES_MAX)
      : [];
  }
  return {
    list: (scope: string): Promise<string[]> => run(() => read(scope)).catch(() => []),
    remember: (scope: string, place: string, assertCurrent: () => void = () => {}) =>
      run(async () => {
        const value = place.trim();
        if (!value) return;
        assertCurrent();
        const current = await read(scope);
        assertCurrent();
        const lower = value.toLocaleLowerCase();
        const next = [value, ...current.filter((p) => p.toLocaleLowerCase() !== lower)].slice(0, RECENT_PLACES_MAX);
        await storage.setItem(key(scope), JSON.stringify(next));
      }),
    clear: (scope: string) => run(() => storage.removeItem(key(scope))),
  };
}
