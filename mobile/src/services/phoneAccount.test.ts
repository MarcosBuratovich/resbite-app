import test from "node:test";
import assert from "node:assert/strict";
import { flushAttestation, noteAppSession, rememberAttestation, type PhoneAccountDeps } from "./phoneAccount";

function stub(fail: boolean) {
  const calls: string[] = [];
  const d: PhoneAccountDeps = {
    noteAppSession: async () => {
      calls.push("note");
      if (fail) throw new Error("offline");
    },
    attestAge: async (v) => {
      calls.push(v);
      if (fail) throw new Error("offline");
    },
  };
  return { d, calls };
}

test("noteAppSession resolves when the call rejects", async () => {
  const s = stub(true);
  await noteAppSession(s.d);
  assert.deepEqual(s.calls, ["note"]);
});

test("flush does nothing with no tick, keeps it on failure, clears it on success", async () => {
  const none = stub(false);
  await flushAttestation(none.d);
  assert.deepEqual(none.calls, []);

  rememberAttestation("2026-10");
  const bad = stub(true);
  await flushAttestation(bad.d);
  await flushAttestation(bad.d);
  assert.deepEqual(bad.calls, ["2026-10", "2026-10"]);

  const good = stub(false);
  await flushAttestation(good.d);
  await flushAttestation(good.d);
  assert.deepEqual(good.calls, ["2026-10"]);
});
