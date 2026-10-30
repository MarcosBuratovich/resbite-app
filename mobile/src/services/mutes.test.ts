import test from "node:test";
import assert from "node:assert/strict";
import { createMuteGateway, muteErrorMessage } from "./mutes";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(reply: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  let selects = 0;
  const gw = createMuteGateway(
    async (fn, args) => {
      calls.push({ fn, args });
      return reply;
    },
    async () => {
      selects++;
      return reply;
    },
  );
  return { calls, gw, selects: () => selects };
}

test("setting a mute sends set_plan_mute and returns the server's state", async () => {
  const on = gateway({ data: true, error: null });
  assert.equal(await on.gw.setMute("plan-1", true), true);
  assert.deepEqual(on.calls, [{ fn: "set_plan_mute", args: { p_plan: "plan-1", p_muted: true } }]);
  const off = gateway({ data: false, error: null });
  assert.equal(await off.gw.setMute("plan-1", false), false);
  assert.deepEqual(off.calls[0].args, { p_plan: "plan-1", p_muted: false });
});

test("a refused mute is thrown as the server sent it", async () => {
  const refusal = { code: "42501" };
  await assert.rejects(gateway({ data: null, error: refusal }).gw.setMute("p", true), (e) => e === refusal);
});

test("the muted series read turns series_id rows into a Set", async () => {
  const { gw, calls } = gateway({ data: [{ series_id: "s1" }, { series_id: "s2" }, { series_id: "s1" }, {}], error: null });
  assert.deepEqual([...(await gw.mutedSeries())].sort(), ["s1", "s2"]);
  assert.equal(calls.length, 0);
  assert.equal((await gateway({ data: [], error: null }).gw.mutedSeries()).size, 0);
});

test("a failed read of the mutes is thrown", async () => {
  const failure = { message: "offline" };
  await assert.rejects(gateway({ data: null, error: failure }).gw.mutedSeries(), (e) => e === failure);
});

test("set_plan_mute's refusal reads as plain words; anything else is the connection line", () => {
  assert.equal(muteErrorMessage({ code: "42501", message: "Host or attendee required" }), "Only someone invited to this resbite can mute it.");
  for (const other of [new Error("Failed to fetch"), { code: "22023", message: "x" }, null])
    assert.equal(muteErrorMessage(other), "Could not change the mute. Check your connection and try again.");
});
