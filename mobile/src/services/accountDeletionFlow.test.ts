import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccountDeletionFlow,
  phoneProofDeps,
  type DeletionReceipt,
  type DeletionDependencies,
  type DeletionStatus,
  type PhoneProofClient,
} from "./accountDeletionFlow";
import { DELETION_COPY } from "../domain/deletion";
function harness(overrides: Partial<DeletionDependencies> = {}) {
  let saved: DeletionReceipt | null = null;
  const calls: string[] = [];
  let status: DeletionStatus = "not_found";
  const d: DeletionDependencies = {
    enabled: true,
    preview: false,
    accountId: "account-a",
    proof: "email",
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
test("the flow picks apple mode for the Apple proof and calls reauthenticateWithApple before requesting", async () => {
  for (const proof of ["email", "phone"] as const) {
    const other = harness({ proof });
    other.d.reauthenticateWithApple = async () => {
      other.calls.push("apple");
      return { ok: true };
    };
    const flow = createAccountDeletionFlow(other.d);
    assert.equal(flow.mode, "credential");
    assert.equal(await flow.submit(true), "queued");
    assert.deepEqual(other.calls, ["save", "status", "proof", "request", "cleanup"]);
  }
  const h = harness({ proof: "apple" });
  h.d.reauthenticateWithApple = async () => {
    h.calls.push("apple");
    return { ok: true };
  };
  const flow = createAccountDeletionFlow(h.d);
  assert.equal(flow.mode, "apple");
  assert.equal(await flow.submit(true), "queued");
  assert.deepEqual(h.calls, ["save", "status", "apple", "proof", "request", "cleanup"]);
  // Without the Apple dependency nothing is requested.
  const missing = harness({ proof: "apple" });
  await assert.rejects(createAccountDeletionFlow(missing.d).submit(true), new Error(DELETION_COPY.noProof));
  assert.equal(missing.calls.includes("request"), false);
});
test("a null proof requests nothing", async () => {
  const h = harness({ proof: null });
  await assert.rejects(createAccountDeletionFlow(h.d).submit(true), new Error(DELETION_COPY.noProof));
  assert.deepEqual(h.calls, []);
  assert.equal(h.receipt(), null);
});
test("the Apple authorisation code reaches the request and is never saved", async () => {
  const sent: (string | undefined)[] = [];
  const h = harness({
    proof: "apple",
    reauthenticateWithApple: async () => ({ ok: true }),
    reauthenticate: async () => ({ accountId: "account-a", accessToken: "fresh-token", appleAuthorizationCode: "c.1" }),
  });
  h.d.request = async (receipt, proof, appleAuthorizationCode) => {
    assert.equal(receipt, h.receipt());
    assert.equal(proof, "fresh-token");
    sent.push(appleAuthorizationCode);
    h.accepted();
    return "queued";
  };
  assert.equal(await createAccountDeletionFlow(h.d).submit(true), "queued");
  assert.deepEqual(sent, ["c.1"]);
  assert.equal(JSON.stringify(h.receipt()).includes("c.1"), false);
  // Without a code there is none to pass.
  const plain = harness();
  const plainSent: (string | undefined)[] = [];
  plain.d.request = async (_receipt, _proof, appleAuthorizationCode) => {
    plainSent.push(appleAuthorizationCode);
    plain.accepted();
    return "queued";
  };
  assert.equal(await createAccountDeletionFlow(plain.d).submit(true), "queued");
  assert.deepEqual(plainSent, [undefined]);
});
test("phoneProofDeps captures the session only from a successful verification", async () => {
  const sessions: { accountId: string; accessToken: string }[] = [];
  const sends: unknown[] = [];
  const verifies: unknown[] = [];
  let answer: Awaited<ReturnType<PhoneProofClient["auth"]["verifyOtp"]>> = {
    data: { session: null, user: null },
    error: { message: "Token has expired or is invalid", status: 403 },
  };
  const client: PhoneProofClient = {
    auth: {
      signInWithOtp: async (a) => {
        sends.push(a);
        return { error: null };
      },
      verifyOtp: async (a) => {
        verifies.push(a);
        return answer;
      },
    },
  };
  const deps = phoneProofDeps(client, (s) => sessions.push(s));
  assert.deepEqual(Object.keys(deps).sort(), ["now", "signInWithOtp", "updatePhone", "verifyOtp"]);
  const send = { phone: "+447700900301", options: { shouldCreateUser: false } };
  assert.deepEqual(await deps.signInWithOtp(send), { error: null });
  assert.deepEqual(sends, [send]);
  const verify = { phone: "+447700900301", token: "123456", type: "sms" as const };
  assert.deepEqual(await deps.verifyOtp(verify), { error: answer.error });
  assert.deepEqual(sessions, []);
  // No error, but no session or no user: still nothing to capture.
  answer = { data: { session: { access_token: "t" }, user: null }, error: null };
  await deps.verifyOtp(verify);
  answer = { data: { session: null, user: { id: "u" } }, error: null };
  await deps.verifyOtp(verify);
  assert.deepEqual(sessions, []);
  answer = { data: { session: { access_token: "t" }, user: { id: "u" } }, error: null };
  assert.deepEqual(await deps.verifyOtp(verify), { error: null });
  assert.deepEqual(sessions, [{ accountId: "u", accessToken: "t" }]);
  assert.deepEqual(verifies, [verify, verify, verify, verify]);
  await assert.rejects(deps.updatePhone("+447700900302"));
  assert.equal(typeof deps.now(), "number");
});
test("a closed Apple sheet ends the flow quietly and keeps the receipt", async () => {
  const h = harness({ proof: "apple" });
  h.d.reauthenticateWithApple = async () => {
    h.calls.push("apple");
    return { ok: false };
  };
  assert.equal(await createAccountDeletionFlow(h.d).submit(true), null);
  assert.deepEqual(h.calls, ["save", "status", "apple"]);
  assert.ok(h.receipt());
  // A failed Apple sign-in surfaces its message and requests nothing.
  const failed = harness({ proof: "apple" });
  failed.d.reauthenticateWithApple = async () => {
    throw new Error("Check your connection and try again.");
  };
  await assert.rejects(
    createAccountDeletionFlow(failed.d).submit(true),
    /Check your connection and try again\./,
  );
  assert.equal(failed.calls.includes("proof"), false);
  assert.equal(failed.calls.includes("request"), false);
});
