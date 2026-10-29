import test from "node:test";
import assert from "node:assert/strict";
import { createAdminGateway } from "./admins";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(error: unknown = null) {
  const calls: Call[] = [];
  const gw = createAdminGateway(async (fn, args) => {
    calls.push({ fn, args });
    return { data: null, error };
  });
  return { calls, gw };
}

test("appointing sends appoint_admin with the plan and the person", async () => {
  const { calls, gw } = gateway();
  await gw.appoint("plan-1", "user-2");
  assert.deepEqual(calls, [{ fn: "appoint_admin", args: { p_plan: "plan-1", p_user: "user-2" } }]);
});

test("removing sends remove_admin with the plan and the person", async () => {
  const { calls, gw } = gateway();
  await gw.remove("plan-1", "user-2");
  assert.deepEqual(calls, [{ fn: "remove_admin", args: { p_plan: "plan-1", p_user: "user-2" } }]);
});

test("a refusal is thrown as the server sent it", async () => {
  const refusal = { code: "42501", message: "not the host" };
  const { gw } = gateway(refusal);
  await assert.rejects(gw.appoint("p", "u"), (e) => e === refusal);
  await assert.rejects(gw.remove("p", "u"), (e) => e === refusal);
});
