import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccountDeletionFlow,
  type DeletionReceipt,
  type DeletionDependencies,
  type DeletionStatus,
} from "./accountDeletionFlow";
function harness(overrides: Partial<DeletionDependencies> = {}) {
  let saved: DeletionReceipt | null = null;
  const calls: string[] = [];
  let status: DeletionStatus = "not_found";
  const d: DeletionDependencies = {
    enabled: true,
    preview: false,
    accountId: "account-a",
    assertCurrent: () => {},
    load: async () => saved,
    save: async (receipt) => {
      calls.push("save");
      saved = receipt;
    },
    createReceipt: () => ({
      accountId: "account-a",
      requestId: "stable-id",
      recoveryToken: "secret",
    }),
    status: async () => {
      calls.push("status");
      return status;
    },
    reauthenticate: async () => {
      calls.push("proof");
      return { accountId: "account-a", accessToken: "fresh-token" };
    },
    request: async (receipt) => {
      assert.equal(receipt, saved);
      calls.push("request");
      status = "queued";
      return status;
    },
    cleanup: async () => {
      calls.push("cleanup");
    },
    ...overrides,
  };
  return {
    d,
    calls,
    receipt: () => saved,
    accepted: () => {
      status = "queued";
    },
  };
}
test("deletion gate, preview and explicit confirmation prevent all storage/network operations", async () => {
  for (const override of [{ enabled: false }, { preview: true }, {}]) {
    const h = harness(override);
    await assert.rejects(createAccountDeletionFlow(h.d).submit(false));
    assert.deepEqual(h.calls, []);
  }
});
test("journals a stable receipt before network; secrets/proof never persist", async () => {
  const h = harness();
  assert.equal(await createAccountDeletionFlow(h.d).submit(true), "queued");
  assert.deepEqual(h.calls, ["save", "status", "proof", "request", "cleanup"]);
  assert.equal(JSON.stringify(h.receipt()).includes("fresh-token"), false);
});
test("storage failure prevents deletion", async () => {
  const h = harness({
    save: async () => {
      throw Error("disk full");
    },
  });
  await assert.rejects(
    createAccountDeletionFlow(h.d).submit(true),
    /disk full/,
  );
  assert.deepEqual(h.calls, []);
});
test("lost reply reconciles accepted request without repeating deletion", async () => {
  const h = harness();
  h.d.request = async () => {
    h.calls.push("request");
    h.accepted();
    throw Error("offline");
  };
  assert.equal(await createAccountDeletionFlow(h.d).submit(true), "queued");
  assert.deepEqual(h.calls, [
    "save",
    "status",
    "proof",
    "request",
    "status",
    "cleanup",
  ]);
  h.calls.length = 0;
  await createAccountDeletionFlow(h.d).submit(true);
  assert.deepEqual(h.calls, ["save", "status", "cleanup"]);
});
test("unknown request after network loss retains receipt and never claims deletion", async () => {
  const h = harness({
    request: async () => {
      throw Error("offline");
    },
  });
  await assert.rejects(
    createAccountDeletionFlow(h.d).submit(true),
    /not confirmed/,
  );
  assert.ok(h.receipt());
  assert.equal(h.calls.includes("cleanup"), false);
});
test("wrong-account proof and account changes cannot request deletion", async () => {
  const h = harness({
    reauthenticate: async () => ({
      accountId: "account-b",
      accessToken: "token",
    }),
  });
  await assert.rejects(
    createAccountDeletionFlow(h.d).submit(true),
    /different account/,
  );
  assert.equal(h.calls.includes("request"), false);
  let current = true;
  const changed = harness({
    assertCurrent: () => {
      if (!current) throw Error("changed");
    },
    reauthenticate: async () => {
      current = false;
      return { accountId: "account-a", accessToken: "token" };
    },
  });
  await assert.rejects(
    createAccountDeletionFlow(changed.d).submit(true),
    /changed/,
  );
  assert.equal(changed.calls.includes("request"), false);
});
test("duplicate taps share one operation and failed cleanup remains retryable", async () => {
  let clean = false;
  const h = harness({
    cleanup: async () => {
      if (!clean) throw Error("cleanup");
    },
  });
  const flow = createAccountDeletionFlow(h.d);
  const first = flow.submit(true);
  assert.equal(first, flow.submit(true));
  await assert.rejects(first, /cleanup/);
  clean = true;
  h.calls.length = 0;
  await flow.submit(true);
  assert.deepEqual(h.calls, ["save", "status"]);
});
