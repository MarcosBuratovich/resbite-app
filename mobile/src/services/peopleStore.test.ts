import { prepareInvitation, revokeInvitation } from "../domain/invitations";
import test from "node:test";
import assert from "node:assert/strict";
import { person, mergePeople } from "../domain/people";
import { createPeopleStore } from "./peopleStore";
const a = person("Alex", "A@example.com")!,
  b = person("Bea", "b@example.com")!,
  c = person("Cam", "+44 7700 900123")!;
function store() {
  const data = new Map<string, string>();
  return createPeopleStore({
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  });
}
test("overlapping groups deduplicate exact contact details without guessing identities", () => {
  assert.deepEqual(
    mergePeople([a, b], [b, c]).map((p) => p.key),
    [a.key, b.key, c.key],
  );
  assert.equal(person("Alex", " a@EXAMPLE.com ")?.key, a.key);
  assert.equal(person("Cam", "+44 (7700) 900-123")?.key, c.key);
  assert.notEqual(person("Cam", "07700900123")?.key, c.key);
  assert.equal(person("No detail", ""), null);
  assert.equal(person("Invalid", "abc"), null);
});
test("group edits/deletion never mutate a saved plan selection", async () => {
  const groups = store();
  await groups.saveGroup("owner", {
    id: "one",
    name: "Friends",
    members: [a, b],
  });
  await groups.saveGroup("owner", {
    id: "two",
    name: "Weekend",
    members: [b, c],
  });
  await groups.saveSelection("owner", "plan", mergePeople([a, b], [b, c]));
  await groups.saveGroup("owner", { id: "one", name: "Renamed", members: [a] });
  await groups.deleteGroup("owner", "two");
  const data = await groups.list("owner");
  assert.deepEqual(data.plans.plan, [a, b, c]);
  assert.equal(data.groups[0].name, "Renamed");
});
test("groups and plan selections are account-scoped and cleared on sign-out", async () => {
  const groups = store();
  await groups.saveGroup("a", { id: "one", name: "Friends", members: [a] });
  await groups.saveGroup("b", { id: "two", name: "Other", members: [b] });
  await groups.saveSelection("a", "plan", [a]);
  await groups.clear("a");
  assert.deepEqual(await groups.list("a"), { groups: [], plans: {} });
  assert.equal((await groups.list("b")).groups.length, 1);
});
test("clearing invalidates queued saves so a signing-out account is not repopulated", async () => {
  const groups = store();
  const save = groups.saveGroup("a", {
    id: "one",
    name: "Friends",
    members: [a],
  });
  const clear = groups.clear("a");
  await assert.rejects(save);
  await clear;
  assert.deepEqual((await groups.list("a")).groups, []);
});

test("invitation preparation journals before RPC and restart retries the same secret", async () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
  let journal = createPeopleStore(storage);
  const candidate = {
    id: "invite",
    token: "a".repeat(64),
    planId: "plan",
    targetKey: a.key,
    label: a.name,
    state: "pending" as const,
  };
  const requests: unknown[] = [];
  const gateway = {
    create: async (slot: unknown) => {
      requests.push(slot);
      assert.equal(
        (await journal.list("owner")).invitations?.[0].state,
        "pending",
      );
      if (requests.length === 1) throw Error("Lost reply");
    },
    revoke: async () => {},
  };
  await assert.rejects(prepareInvitation(journal, gateway, "owner", candidate));
  journal = createPeopleStore(storage);
  await prepareInvitation(journal, gateway, "owner", {
    ...candidate,
    id: "replacement",
    token: "b".repeat(64),
  });
  assert.deepEqual(requests[0], requests[1]);
  assert.equal((await journal.list("owner")).invitations?.[0].state, "ready");
  assert.equal((await journal.list("other")).invitations, undefined);
});
test("failed local journaling and preview never call invitation RPC", async () => {
  let writes = 0;
  const journal = createPeopleStore({
    getItem: async () => null,
    setItem: async () => {
      throw Error("Storage unavailable");
    },
    removeItem: async () => {},
  });
  const gateway = {
    create: async () => {
      writes++;
    },
    revoke: async () => {
      writes++;
    },
  };
  const candidate = {
    id: "one",
    token: "a".repeat(64),
    planId: "plan",
    targetKey: a.key,
    label: a.name,
    state: "pending" as const,
  };
  await assert.rejects(prepareInvitation(journal, gateway, "owner", candidate));
  await assert.rejects(
    prepareInvitation(journal, gateway, "preview", candidate),
  );
  assert.equal(writes, 0);
});
test("revocation stays disabled across failed replies and late preparation cannot revive it", async () => {
  const journal = store();
  const slot = {
    id: "one",
    token: "a".repeat(64),
    planId: "plan",
    targetKey: a.key,
    label: a.name,
    state: "pending" as const,
  };
  let fail = true;
  const gateway = {
    create: async () => {},
    revoke: async () => {
      if (fail) throw Error("Lost reply");
    },
  };
  const ready = await prepareInvitation(journal, gateway, "owner", slot);
  await assert.rejects(revokeInvitation(journal, gateway, "owner", ready));
  const saved = (await journal.list("owner")).invitations![0];
  assert.equal(saved.state, "revoking");
  await assert.rejects(journal.setInvitationState("owner", slot.id, "ready"));
  await assert.rejects(prepareInvitation(journal, gateway, "owner", slot));
  fail = false;
  await revokeInvitation(journal, gateway, "owner", saved);
  assert.equal((await journal.list("owner")).invitations![0].state, "revoked");
  const replacement = await prepareInvitation(journal, gateway, "owner", {
    ...slot,
    id: "two",
  });
  assert.equal(replacement.id, "two");
});
test("session change during journaling prevents invitation creation", async () => {
  const journal = store();
  let checks = 0,
    writes = 0;
  await assert.rejects(
    prepareInvitation(
      journal,
      {
        create: async () => {
          writes++;
        },
        revoke: async () => {},
      },
      "owner",
      {
        id: "one",
        token: "a".repeat(64),
        planId: "plan",
        targetKey: a.key,
        label: a.name,
        state: "pending",
      },
      () => {
        if (++checks > 1) throw Error("Session changed");
      },
    ),
  );
  assert.equal(writes, 0);
});
