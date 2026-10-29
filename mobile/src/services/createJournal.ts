import type { KeyStore } from "./secureChunks";
import type { PlanWrite } from "../domain/plans";

/** The one create this device has started and not yet seen finish (spec CR-P13). */
export type PendingCreate = { requestId: string; write: PlanWrite; savedAt: string };

export type JournalStore = ReturnType<typeof createJournalStore>;

// Serialize operations so reading, journaling and clearing one scope cannot race.
export function createJournalStore(store: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  function run<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  }
  const key = (scope: string) => `resbite.create-journal.v1.${scope}`;
  async function stored(scope: string): Promise<PendingCreate | null> {
    try {
      const raw = await store.getItem(key(scope));
      if (!raw) return null;
      const entry = JSON.parse(raw) as PendingCreate;
      return entry && typeof entry.requestId === "string" && typeof entry.write?.id === "string" ? entry : null;
    } catch {
      return null;
    }
  }
  return {
    read: (scope: string): Promise<PendingCreate | null> => run(() => stored(scope)),
    put: (scope: string, entry: PendingCreate): Promise<void> =>
      run(() => store.setItem(key(scope), JSON.stringify(entry))),
    /**
     * Drops the entry. With a `requestId`, only when the entry is that create's: a create that finishes never
     * clears another one journaled since. Without one (account deletion), whatever is there.
     */
    clear: (scope: string, requestId?: string): Promise<void> =>
      run(async () => {
        if (requestId !== undefined && (await stored(scope))?.requestId !== requestId) return;
        await store.removeItem(key(scope));
      }),
  };
}
