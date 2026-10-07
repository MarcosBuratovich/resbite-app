import type { KeyStore } from "./secureChunks";
import { UUID_PATTERN, coverPhotoLayout, coverScope } from "../domain/covers";
import { canEditPlan, type Plan } from "../domain/plans";
import type { createPhotoChangeStore } from "./profilePhotoStore";

const idPattern = new RegExp(`^${UUID_PATTERN}$`, "i");

export const coverIndexKey = (owner: string) => `resbite.cover.v1.index.${owner}`;

function checked(owner: string, planId?: string) {
  if (!idPattern.test(owner) || (planId !== undefined && !idPattern.test(planId)))
    throw Error("Invalid cover owner.");
}

/** Per-owner list of plan ids that may have a cover journal on this device. */
export function createCoverJournalIndex(storage: KeyStore) {
  const queues = new Map<string, Promise<unknown>>();
  function run<T>(owner: string, action: () => Promise<T>): Promise<T> {
    try {
      checked(owner);
    } catch (error) {
      return Promise.reject(error);
    }
    const next = (queues.get(owner) ?? Promise.resolve()).catch(() => {}).then(action);
    queues.set(owner, next.catch(() => {}));
    return next;
  }
  async function load(owner: string): Promise<string[]> {
    const raw = await storage.getItem(coverIndexKey(owner));
    if (!raw) return [];
    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      return [
        ...new Set(value.filter((v): v is string => typeof v === "string" && idPattern.test(v))),
      ];
    } catch {
      return [];
    }
  }
  async function save(owner: string, ids: string[]) {
    if (ids.length) await storage.setItem(coverIndexKey(owner), JSON.stringify(ids));
    else await storage.removeItem(coverIndexKey(owner));
  }
  return {
    list: (owner: string) => run(owner, () => load(owner)),
    add: (owner: string, planId: string) =>
      run(owner, async () => {
        checked(owner, planId);
        const ids = await load(owner);
        if (!ids.includes(planId)) await save(owner, [...ids, planId]);
      }),
    remove: (owner: string, planId: string) =>
      run(owner, async () => {
        const ids = await load(owner);
        if (ids.includes(planId)) await save(owner, ids.filter((id) => id !== planId));
      }),
    /** Remove several ids in one queued operation. */
    removeMany: (owner: string, planIds: string[]) =>
      run(owner, async () => {
        const ids = await load(owner);
        const kept = ids.filter((id) => !planIds.includes(id));
        await save(owner, kept);
      }),
    /** Replace the index with exactly these ids (empty removes the key). */
    replace: (owner: string, ids: string[]) => run(owner, () => save(owner, ids)),
    clearKey: (owner: string) => run(owner, () => storage.removeItem(coverIndexKey(owner))),
  };
}
export type CoverJournalIndex = ReturnType<typeof createCoverJournalIndex>;

export type JournalStore = Pick<
  ReturnType<typeof createPhotoChangeStore>,
  "read" | "begin" | "bytes" | "clear"
>;
export type StalePlan = { id: string; owner_id: string; status: string; starts_at: string };

/**
 * Wraps a cover journal store so every journal is findable per owner.
 * Index first on begin; unindex only after the journal and bytes are cleared.
 */
export function createIndexedCoverStore(
  store: JournalStore,
  index: CoverJournalIndex,
) {
  const scopeGen = new Map<string, number>();
  const ownerGen = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const split = (scope: string) => {
    if (!coverPhotoLayout.validScope(scope)) throw Error("Invalid cover owner.");
    const [owner, planId] = scope.split("/");
    return { owner, planId };
  };
  async function clear(scope: string) {
    const { owner, planId } = split(scope);
    bump(scopeGen, scope);
    await store.clear(scope);
    await index.remove(owner, planId);
  }
  async function clearList(owner: string, planIds: string[]) {
    const failed: string[] = [];
    let failure: unknown;
    for (const planId of planIds) {
      try {
        await store.clear(coverScope(owner, planId));
      } catch (error) {
        failed.push(planId);
        failure ??= error;
      }
    }
    return { failed, failure };
  }
  return {
    read: store.read,
    bytes: store.bytes,
    begin: async (...args: Parameters<JournalStore["begin"]>) => {
      const [scope, , , assertCurrent] = args;
      const { owner, planId } = split(scope);
      const scopeAt = scopeGen.get(scope) ?? 0;
      const ownerAt = ownerGen.get(owner) ?? 0;
      const check = () => {
        assertCurrent();
        if ((scopeGen.get(scope) ?? 0) !== scopeAt || (ownerGen.get(owner) ?? 0) !== ownerAt)
          throw Error("Cover change cancelled.");
      };
      check();
      await index.add(owner, planId);
      return store.begin(args[0], args[1], args[2], check);
    },
    clear,
    /** Sign-out and deletion: clear every indexed journal, then the index. */
    async clearCoverJournals(owner: string) {
      bump(ownerGen, owner);
      const ids = await index.list(owner);
      for (const id of ids) bump(scopeGen, coverScope(owner, id));
      const { failed, failure } = await clearList(owner, ids);
      await index.removeMany(owner, ids.filter((id) => !failed.includes(id)));
      if (failed.length) throw failure;
    },
    /** Drop journals of listed plans that can never complete. Unlisted ids are kept. */
    async discardStaleCoverJournals(
      owner: string,
      plans: StalePlan[],
      now: Date = new Date(),
    ) {
      const indexed = new Set(await index.list(owner));
      const stale = plans
        .filter(
          (p) =>
            indexed.has(p.id) &&
            !canEditPlan(p as unknown as Plan, owner, false, now.getTime()),
        )
        .map((p) => p.id);
      for (const planId of stale) bump(scopeGen, coverScope(owner, planId));
      for (const planId of stale) {
        const { failed } = await clearList(owner, [planId]);
        if (!failed.length) await index.remove(owner, planId);
      }
    },
  };
}
