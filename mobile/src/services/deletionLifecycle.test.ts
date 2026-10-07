import test from "node:test";
import assert from "node:assert/strict";
import { createSessionLifecycle } from "./sessionLifecycle";
function setup() {
  const calls: string[] = [];
  let fail = false;
  const life = createSessionLifecycle({
    suspend: (s) => {
      calls.push(`suspend:${s}`);
    },
    resume: (s) => {
      calls.push(`resume:${s}`);
    },
    clearDrafts: async (s) => {
      calls.push(`drafts:${s}`);
      if (fail) throw Error("locked");
    },
    clearPeople: async (s) => {
      calls.push(`people:${s}`);
    },
    clearPhoto: async (s) => {
      calls.push(`photo:${s}`);
    },
    blockPending: () => () => {},
    clearPending: async () => {
      calls.push("pending");
    },
    authSignOut: async (local) => {
      calls.push(`auth:${local}`);
      life.update({ account: null, preview: false });
    },
    finish: () => {
      calls.push("finish");
    },
    busy: () => {},
  });
  life.update({ account: "a", preview: false });
  calls.length = 0;
  return {
    life,
    calls,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}
test("deletion clears drafts as well as scoped data before local-only signout", async () => {
  const h = setup();
  const old = h.life.capture();
  const result = h.life.finishAccountDeletion("a");
  assert.throws(old);
  await result;
  assert.deepEqual(h.calls, [
    "suspend:a",
    "drafts:a",
    "people:a",
    "photo:a",
    "pending",
    "auth:true",
    "suspend:a",
    "finish",
  ]);
});
test("deletion rejects wrong account and preview before clearing anything", async () => {
  const h = setup();
  await assert.rejects(h.life.finishAccountDeletion("b"));
  assert.deepEqual(h.calls, []);
  h.life.update({ account: "a", preview: true });
  h.calls.length = 0;
  await assert.rejects(h.life.finishAccountDeletion("a"));
  assert.deepEqual(h.calls, []);
});
test("failed deletion cleanup stays suspended, blocks writes, and allows explicit cleanup retry", async () => {
  const h = setup();
  h.fail(true);
  await assert.rejects(h.life.finishAccountDeletion("a"), /locked/);
  assert.throws(h.life.capture());
  assert.equal(
    h.calls.some((v) => v.startsWith("resume")),
    false,
  );
  h.fail(false);
  await h.life.finishAccountDeletion("a");
  assert.ok(h.calls.includes("auth:true"));
});
test("account switch cannot resume a deletion-blocked account", async () => {
  const h = setup();
  h.fail(true);
  await assert.rejects(h.life.finishAccountDeletion("a"));
  h.life.update({ account: "b", preview: false });
  h.calls.length = 0;
  h.life.update({ account: "a", preview: false });
  assert.equal(h.calls.includes("resume:a"), false);
});

test("ordinary signout failure cannot resume a deletion-blocked account", async () => {
  const resumed: string[] = [];
  const life = createSessionLifecycle({
    suspend: () => {},
    resume: (scope) => {
      resumed.push(scope);
    },
    clearDrafts: async () => {
      throw Error("storage locked");
    },
    clearPeople: async () => {
      throw Error("storage locked");
    },
    clearPhoto: async () => {},
    blockPending: () => () => {},
    clearPending: async () => {},
    authSignOut: async () => {},
    finish: () => {},
    busy: () => {},
  });
  life.update({ account: "a", preview: false });
  resumed.length = 0;
  await assert.rejects(life.finishAccountDeletion("a"));
  await assert.rejects(life.signOut());
  assert.deepEqual(resumed, []);
  assert.throws(life.capture());
});
