import test from "node:test";
import assert from "node:assert/strict";
import { connectionErrorMessage, createConnectionGateway } from "./connections";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(data: unknown = null, error: unknown = null) {
  const calls: Call[] = [];
  const gw = createConnectionGateway(async (fn, args) => {
    calls.push({ fn, args });
    return { data, error };
  });
  return { calls, gw };
}

test("request sends request_connection with the person and the resbite, and returns the outcome", async () => {
  const { calls, gw } = gateway("requested");
  assert.equal(await gw.request("user-2", "plan-1"), "requested");
  assert.deepEqual(calls, [{ fn: "request_connection", args: { p_user: "user-2", p_plan: "plan-1" } }]);
  assert.equal(await gateway("connected").gw.request("u", "p"), "connected");
});

test("accept, decline, cancel and remove each send their own function with the person", async () => {
  const { calls, gw } = gateway();
  await gw.accept("u1");
  await gw.decline("u2");
  await gw.cancel("u3");
  await gw.remove("u4");
  assert.deepEqual(calls, [
    { fn: "accept_connection", args: { p_user: "u1" } },
    { fn: "decline_connection", args: { p_user: "u2" } },
    { fn: "cancel_connection_request", args: { p_user: "u3" } },
    { fn: "remove_connection", args: { p_user: "u4" } },
  ]);
});

test("a refusal is thrown as the server sent it", async () => {
  const refusal = { code: "42501", message: "Names required" };
  const { gw } = gateway(null, refusal);
  await assert.rejects(gw.request("u", "p"), (e) => e === refusal);
  await assert.rejects(gw.accept("u"), (e) => e === refusal);
  await assert.rejects(gw.decline("u"), (e) => e === refusal);
  await assert.rejects(gw.cancel("u"), (e) => e === refusal);
  await assert.rejects(gw.remove("u"), (e) => e === refusal);
  await assert.rejects(gw.mine(), (e) => e === refusal);
  await assert.rejects(gw.statesFor("p"), (e) => e === refusal);
});

test("mine sends my_connections and maps the server's rows", async () => {
  const { calls, gw } = gateway({
    requests: [
      { user_id: "a", name: "Ana", avatar_path: "a.jpg", avatar_revision: 3, series_id: "s1", title: "Picnic", context: "going" },
      { user_id: "b", name: "Bo", avatar_path: null, avatar_revision: 0, series_id: null, title: null, context: "met" },
    ],
    connected: [{ user_id: "c", name: "Cy", avatar_path: null, avatar_revision: 1, series_id: "s2", title: "Hike" }],
  });
  const mine = await gw.mine();
  assert.deepEqual(calls, [{ fn: "my_connections", args: {} }]);
  assert.deepEqual(mine, {
    requests: [
      { userId: "a", name: "Ana", avatarPath: "a.jpg", avatarRevision: 3, seriesId: "s1", title: "Picnic", context: "going" },
      { userId: "b", name: "Bo", avatarPath: null, avatarRevision: 0, seriesId: null, title: null, context: "met" },
    ],
    connected: [{ userId: "c", name: "Cy", avatarPath: null, avatarRevision: 1, seriesId: "s2", title: "Hike" }],
  });
  assert.equal("context" in mine.connected[0], false);
});

test("mine reads missing arrays as empty", async () => {
  assert.deepEqual(await gateway({}).gw.mine(), { requests: [], connected: [] });
  assert.deepEqual(await gateway(null).gw.mine(), { requests: [], connected: [] });
});

test("statesFor sends plan_connection_states with the resbite and returns the states by user", async () => {
  const states = { u1: "none", u2: "requested_by_me", u3: "requested_by_them", u4: "connected" };
  const { calls, gw } = gateway(states);
  assert.deepEqual(await gw.statesFor("plan-1"), states);
  assert.deepEqual(calls, [{ fn: "plan_connection_states", args: { p_plan: "plan-1" } }]);
  assert.deepEqual(await gateway(null).gw.statesFor("p"), {});
});

test("the server's refusals read as plain words; anything else is the connection line", () => {
  assert.equal(connectionErrorMessage({ code: "42501", message: "Names required" }), "Answer first to connect with people here.");
  assert.equal(connectionErrorMessage({ code: "42501", message: "Not on this resbite" }), "That person isn't on this resbite.");
  assert.equal(connectionErrorMessage({ code: "42501", message: "Not a connection" }), "Couldn't do that. Try again.");
  assert.equal(connectionErrorMessage({ code: "22023", message: "That is you" }), "Couldn't do that. Try again.");
  for (const other of [new Error("Failed to fetch"), { code: "42501", message: "Something new" }, { code: "57014" }, null])
    assert.equal(connectionErrorMessage(other), "Check your connection and try again.");
});
