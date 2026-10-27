import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAttestation,
  flushAttestation,
  noteAppSession,
  rememberAttestation,
  type PhoneAccountDeps,
} from "./phoneAccount";

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

// auth.users.phone (and the User object) hold digits only; the tick is remembered with the E.164 number.
const signedUp = { phone: "447700900834" };
const someoneElse = { phone: "447700900999" };

test("noteAppSession resolves when the call rejects", async () => {
  const s = stub(true);
  await noteAppSession(s.d);
  assert.deepEqual(s.calls, ["note"]);
});

test("flush does nothing with no tick, keeps it on failure, clears it on success", async () => {
  clearAttestation();
  const none = stub(false);
  await flushAttestation(signedUp, none.d);
  assert.deepEqual(none.calls, []);

  rememberAttestation("2026-10", "+447700900834");
  const bad = stub(true);
  await flushAttestation(signedUp, bad.d);
  await flushAttestation(signedUp, bad.d);
  assert.deepEqual(bad.calls, ["2026-10", "2026-10"]);

  const good = stub(false);
  await flushAttestation(signedUp, good.d);
  await flushAttestation(signedUp, good.d);
  assert.deepEqual(good.calls, ["2026-10"]);
});

test("a different account's number is not recorded and the tick stays pending", async () => {
  clearAttestation();
  rememberAttestation("2026-10", "+447700900834");
  const s = stub(false);
  await flushAttestation(someoneElse, s.d);
  await flushAttestation({ phone: null }, s.d);
  await flushAttestation(null, s.d);
  assert.deepEqual(s.calls, []);

  await flushAttestation(signedUp, s.d);
  assert.deepEqual(s.calls, ["2026-10"]);
});

test("the matching number is recorded once and the tick cleared", async () => {
  clearAttestation();
  rememberAttestation("2026-10", "+447700900834");
  const s = stub(false);
  await flushAttestation(signedUp, s.d);
  await flushAttestation(signedUp, s.d);
  assert.deepEqual(s.calls, ["2026-10"]);
});

test("clearing empties the pending tick", async () => {
  rememberAttestation("2026-10", "+447700900834");
  clearAttestation();
  const s = stub(false);
  await flushAttestation(signedUp, s.d);
  assert.deepEqual(s.calls, []);
});

test("a newer tick replaces the older one", async () => {
  clearAttestation();
  rememberAttestation("2026-10", "+447700900999");
  rememberAttestation("2026-10", "+447700900834");
  const s = stub(false);
  await flushAttestation(someoneElse, s.d);
  assert.deepEqual(s.calls, []);
  await flushAttestation(signedUp, s.d);
  assert.deepEqual(s.calls, ["2026-10"]);
});
