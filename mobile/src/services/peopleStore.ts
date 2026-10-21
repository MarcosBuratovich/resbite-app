import type { KeyStore } from "./secureChunks";
import { mergePeople, type Person, type PeopleGroup } from "../domain/people";
export type PeopleData = {
  groups: PeopleGroup[];
  plans: Record<string, Person[]>;
};
export function createPeopleStore(storage: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const epochs = new Map<string, number>();
  const blocked = new Set<string>();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };
  const key = (scope: string) => `resbite.people.v1.${scope}`;
  async function read(scope: string): Promise<PeopleData> {
    const raw = await storage.getItem(key(scope));
    if (!raw) return { groups: [], plans: {} };
    const data = JSON.parse(raw);
    if (
      !Array.isArray(data.groups) ||
      !data.plans ||
      typeof data.plans !== "object"
    )
      throw Error("Invalid saved groups");
    // GI1: per-person invitation links are gone; their local journal (with its secrets) is dropped on the next write.
    const { invitations: _dropped, ...rest } = data;
    return rest;
  }
  function change(scope: string, update: (d: PeopleData) => PeopleData) {
    if (blocked.has(scope)) return Promise.reject(Error("Session changed"));
    const epoch = epochs.get(scope) ?? 0;
    return run(async () => {
      if (epoch !== (epochs.get(scope) ?? 0)) throw Error("Session changed");
      const current = await read(scope);
      if (blocked.has(scope) || epoch !== (epochs.get(scope) ?? 0))
        throw Error("Session changed");
      const next = update(current);
      await storage.setItem(key(scope), JSON.stringify(next));
      return next;
    });
  }
  return {
    suspend: (scope: string) => {
      blocked.add(scope);
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
    },
    resume: (scope: string) => {
      blocked.delete(scope);
    },
    list: (scope: string) => run(() => read(scope)),
    saveGroup: (scope: string, group: PeopleGroup) =>
      change(scope, (d) => ({
        ...d,
        groups: [
          {
            ...group,
            name: group.name.trim(),
            members: mergePeople(group.members),
          },
          ...d.groups.filter((g) => g.id !== group.id),
        ],
      })),
    deleteGroup: (scope: string, id: string) =>
      change(scope, (d) => ({
        ...d,
        groups: d.groups.filter((g) => g.id !== id),
      })),
    saveSelection: (scope: string, plan: string, people: Person[]) =>
      change(scope, (d) => ({
        ...d,
        plans: { ...d.plans, [plan]: mergePeople(people) },
      })),
    clear: (scope: string) => {
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
      return run(() => storage.removeItem(key(scope)));
    },
  };
}
