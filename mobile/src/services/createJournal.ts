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
  return {
    read: (scope: string): Promise<PendingCreate | null> =>
      run(async () => {
        try {
          const raw = await store.getItem(key(scope));
          if (!raw) return null;
          const entry = JSON.parse(raw) as PendingCreate;
          return entry && typeof entry.requestId === "string" && entry.write ? entry : null;
        } catch {
          return null;
        }
      }),
    put: (scope: string, entry: PendingCreate): Promise<void> =>
      run(() => store.setItem(key(scope), JSON.stringify(entry))),
    clear: (scope: string): Promise<void> => run(() => store.removeItem(key(scope))),
  };
}
