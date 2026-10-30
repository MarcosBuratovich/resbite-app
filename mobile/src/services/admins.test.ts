import test from "node:test";
import assert from "node:assert/strict";
import { adminErrorMessage, createAdminGateway } from "./admins";

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

test("the server's refusals of appoint_admin and remove_admin read as plain words; anything else is the connection line", () => {
  // appoint_admin: a guest who never used the app, one who isn't going; both: not the owner (42501 Owner required).
  assert.equal(
    adminErrorMessage({ code: "22023", message: "Only a guest who uses the app can be an admin" }),
    "Only someone who uses the app can be an admin.",
  );
  assert.equal(
    adminErrorMessage({ code: "22023", message: "Only a guest who is going can be an admin" }),
    "Only someone who’s going can be an admin.",
  );
  assert.equal(adminErrorMessage({ code: "42501", message: "Owner required" }), "Only the organizer can change admins.");
  for (const other of [new Error("Failed to fetch"), { code: "22023", message: "Something new" }, { code: "57014" }, null])
    assert.equal(adminErrorMessage(other), "Could not change admins. Check your connection and try again.");
});
