import type { KeyStore } from "./secureChunks";
import type { LocalPlan } from "../state/AppState";
import type { PlanWrite } from "../domain/plans";

export type PlanDraft = {
  schema: 1;
  scope: string;
  key: string;
  activityId: string;
  planId?: string;
  requestId: string;
  original: LocalPlan | null;
  initial: string;
  start: string;
  place: string;
  note: string;
  zone: string;
  startInstant?: string;
  pending: PlanWrite | null;
  updatedAt: string;
};

// Serialize bucket updates so typing, journaling a request and clearing it cannot race.
export function createDraftStore(storage: KeyStore) {
  const deletedScopes = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();
  function run<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  }
  const key = (scope: string) => `resbite.drafts.v1.${scope}`;
  async function read(scope: string): Promise<PlanDraft[]> {
    const raw = await storage.getItem(key(scope));
    if (!raw) return [];
    const items: unknown = JSON.parse(raw);
    if (
      !Array.isArray(items) ||
      items.some(
        (d) =>
          !d ||
          d.schema !== 1 ||
          d.scope !== scope ||
          ![
            "key",
            "activityId",
            "requestId",
            "initial",
            "start",
            "place",
            "note",
            "zone",
            "updatedAt",
          ].every((k) => typeof d[k] === "string") ||
          (d.pending &&
            (d.pending.id !== (d.original?.id ?? d.requestId) ||
              d.pending.activityId !== d.activityId)),
      )
    ) {
      throw new Error("Could not read saved drafts.");
    }
    return items as PlanDraft[];
  }
  return {
    list: (scope: string) => run(() => read(scope)),
    clearScope: (scope: string) => {
      deletedScopes.add(scope);
      return run(() => storage.removeItem(key(scope)));
    },
    put: (draft: PlanDraft) =>
      run(async () => {
        if (deletedScopes.has(draft.scope))
          throw Error("Account drafts have been cleared for deletion.");
        const all = await read(draft.scope);
        await storage.setItem(
          key(draft.scope),
          JSON.stringify([draft, ...all.filter((d) => d.key !== draft.key)]),
        );
      }),
    remove: (scope: string, draftKey: string) =>
      run(async () => {
        const remaining = (await read(scope)).filter((d) => d.key !== draftKey);
        if (remaining.length)
          await storage.setItem(key(scope), JSON.stringify(remaining));
        else await storage.removeItem(key(scope));
      }),
  };
}
