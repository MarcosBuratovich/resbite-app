import type { InvitationSlot } from "../domain/invitations";
import type { KeyStore } from "./secureChunks";
import { mergePeople, type Person, type PeopleGroup } from "../domain/people";
export type PeopleData = {
  invitations?: InvitationSlot[];
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
    return data;
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
    reserveInvitation: async (scope: string, slot: InvitationSlot) => {
      const data = await change(scope, (d) => {
        const existing = d.invitations?.find(
          (i) =>
            i.planId === slot.planId &&
            i.targetKey === slot.targetKey &&
            i.state !== "revoked",
        );
        return existing
          ? d
          : { ...d, invitations: [...(d.invitations ?? []), slot] };
      });
      return data.invitations!.find(
        (i) =>
          i.planId === slot.planId &&
          i.targetKey === slot.targetKey &&
          i.state !== "revoked",
      )!;
    },
    setInvitationState: async (
      scope: string,
      id: string,
      state: InvitationSlot["state"],
    ) => {
      await change(scope, (d) => {
        if (!d.invitations?.some((i) => i.id === id))
          throw Error("Invitation no longer exists on this device.");
        return {
          ...d,
          invitations: d.invitations.map((i) =>
            i.id === id
              ? (() => {
                  const allowed =
                    i.state === state ||
                    (i.state === "pending" && state === "ready") ||
                    (i.state === "ready" && state === "revoking") ||
                    (i.state === "revoking" && state === "revoked");
                  if (!allowed)
                    throw Error(
                      "Invitation state changed. Reload before continuing.",
                    );
                  return { ...i, state };
                })()
              : i,
          ),
        };
      });
    },
    clear: (scope: string) => {
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
      return run(() => storage.removeItem(key(scope)));
    },
  };
}
