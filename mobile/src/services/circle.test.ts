import test from "node:test";
import assert from "node:assert/strict";
import { circleErrorMessage, createCircleGateway, saveCircle } from "./circle";
import { circleSave, type CircleSaveState } from "../domain/circle";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(data: unknown = 8, error: unknown = null) {
  const calls: Call[] = [];
  const gw = createCircleGateway(async (fn, args) => {
    calls.push({ fn, args });
    return { data, error };
  });
  return { calls, gw };
}

test("set sends set_plan_circle with the resbite and the two numbers, and returns the new version", async () => {
  const { calls, gw } = gateway(8);
  assert.equal(await gw.set("plan-1", 2, 3), 8);
  assert.deepEqual(calls, [{ fn: "set_plan_circle", args: { p_plan: "plan-1", p_invites: 2, p_levels: 3 } }]);
});

test("set sends Nobody as 0 with the levels kept", async () => {
  const { calls, gw } = gateway(4);
  await gw.set("plan-1", 0, 2);
  assert.deepEqual(calls[0].args, { p_plan: "plan-1", p_invites: 0, p_levels: 2 });
});

test("set runs inside the deadline it is given", async () => {
  let wrapped = 0;
  const gw = createCircleGateway(
    async () => ({ data: 3, error: null }),
    async (request) => {
      wrapped += 1;
      return request(new AbortController().signal);
    },
  );
  assert.equal(await gw.set("p", 1, 1), 3);
  assert.equal(wrapped, 1);
});

test("a refusal is thrown as the server sent it", async () => {
  for (const refusal of [
    { code: "42501", message: "Active plan owner required" },
    { code: "22023", message: "Invalid circle" },
  ]) {
    const { gw } = gateway(null, refusal);
    await assert.rejects(gw.set("p", 1, 1), (e) => e === refusal);
  }
});

test("a reply without a version is not taken as saved", async () => {
  await assert.rejects(gateway(null).gw.set("p", 1, 1), /Check your connection and try again\./);
  await assert.rejects(gateway("8").gw.set("p", 1, 1), /Check your connection and try again\./);
});

test("42501 is a failed save that reloads the screen; 22023 a failed save; anything else the connection line and a reload", () => {
  assert.deepEqual(circleErrorMessage({ code: "42501", message: "Active plan owner required" }), {
    message: "Couldn’t save the circle. Try again.",
    reload: true,
  });
  assert.deepEqual(circleErrorMessage({ code: "22023", message: "Invalid circle" }), {
    message: "Couldn’t save the circle. Try again.",
    reload: false,
  });
  for (const other of [new Error("Failed to fetch"), { code: "57014" }, { code: "40001", message: "Plan changed; refresh" }, null, undefined])
    assert.deepEqual(circleErrorMessage(other), { message: "Check your connection and try again.", reload: true });
});

const refusing = (error: unknown) => ({
  set: async () => {
    throw error;
  },
});

test("saveCircle sends the tapped circle and answers saved with it", async () => {
  const { calls, gw } = gateway(9);
  assert.deepEqual(await saveCircle(gw, "plan-1", { invites: 2, levels: 2 }), {
    event: { type: "saved", value: { invites: 2, levels: 2 }, version: 9 },
    error: null,
  });
  assert.deepEqual(calls, [{ fn: "set_plan_circle", args: { p_plan: "plan-1", p_invites: 2, p_levels: 2 } }]);
});

test("saveCircle answers failed with the words and whether the screen reloads", async () => {
  assert.deepEqual(await saveCircle(refusing({ code: "42501", message: "Active plan owner required" }), "p", { invites: 1, levels: 1 }), {
    event: { type: "failed" },
    error: { message: "Couldn’t save the circle. Try again.", reload: true },
  });
  assert.deepEqual(await saveCircle(refusing({ code: "22023", message: "Invalid circle" }), "p", { invites: 1, levels: 1 }), {
    event: { type: "failed" },
    error: { message: "Couldn’t save the circle. Try again.", reload: false },
  });
  assert.deepEqual(await saveCircle(refusing(new Error("Failed to fetch")), "p", { invites: 1, levels: 1 }), {
    event: { type: "failed" },
    error: { message: "Check your connection and try again.", reload: true },
  });
});

test("the card's save, step by step: a tap disables both choices, a 42501 shows the saved value, the line and a reload", async () => {
  let card: CircleSaveState = { saved: { invites: 1, levels: 2 }, shown: { invites: 1, levels: 2 }, saving: false, version: 4 };
  const tapped = { invites: 2, levels: 2 } as const;
  card = circleSave(card, { type: "tap", value: tapped });
  assert.deepEqual(card, { saved: { invites: 1, levels: 2 }, shown: tapped, saving: true, version: 4 });
  const { event, error } = await saveCircle(refusing({ code: "42501", message: "Active plan owner required" }), "p", tapped);
  card = circleSave(card, event);
  assert.deepEqual(card, { saved: { invites: 1, levels: 2 }, shown: { invites: 1, levels: 2 }, saving: false, version: 4 });
  assert.deepEqual(error, { message: "Couldn’t save the circle. Try again.", reload: true });
});

test("the card's save, step by step: a saved tap becomes what the card has", async () => {
  let card: CircleSaveState = { saved: { invites: 0, levels: 1 }, shown: { invites: 0, levels: 1 }, saving: false, version: 5 };
  card = circleSave(card, { type: "tap", value: { invites: 1, levels: 1 } });
  assert.equal(card.saving, true);
  const { event, error } = await saveCircle(gateway(6).gw, "p", { invites: 1, levels: 1 });
  card = circleSave(card, event);
  assert.deepEqual(card, { saved: { invites: 1, levels: 1 }, shown: { invites: 1, levels: 1 }, saving: false, version: 6 });
  assert.equal(error, null);
  // The screen's refresh read, taken before the save landed, is older and changes nothing.
  assert.equal(circleSave(card, { type: "read", value: { invites: 0, levels: 1 }, version: 5 }), card);
});

test("the card's save, step by step: a save whose answer is lost reloads, and the read shows what the server holds (Q6)", async () => {
  let card: CircleSaveState = { saved: { invites: 1, levels: 2 }, shown: { invites: 1, levels: 2 }, saving: false, version: 4 };
  card = circleSave(card, { type: "tap", value: { invites: 3, levels: 2 } });
  const { event, error } = await saveCircle(refusing(new DOMException("The operation was aborted.", "AbortError")), "p", { invites: 3, levels: 2 });
  card = circleSave(card, event);
  assert.deepEqual(error, { message: "Check your connection and try again.", reload: true });
  assert.deepEqual(card.shown, { invites: 1, levels: 2 });
  // The save had reached the database: the reload reads it back at v5.
  card = circleSave(card, { type: "read", value: { invites: 3, levels: 2 }, version: 5 });
  assert.deepEqual(card, { saved: { invites: 3, levels: 2 }, shown: { invites: 3, levels: 2 }, saving: false, version: 5 });
});

test("allowance asks my_bring_allowance for the resbite and maps may_bring", async () => {
  const { calls, gw } = gateway({ allowed: 2, used: 1, remaining: 1, level: 1, may_bring: true });
  assert.deepEqual(await gw.allowance("plan-1"), { allowed: 2, used: 1, remaining: 1, level: 1, mayBring: true });
  assert.deepEqual(calls, [{ fn: "my_bring_allowance", args: { p_plan: "plan-1" } }]);
  assert.deepEqual(await gateway({ allowed: 0, used: 0, remaining: 0, level: 0, may_bring: false }).gw.allowance("p"), {
    allowed: 0,
    used: 0,
    remaining: 0,
    level: 0,
    mayBring: false,
  });
  // bring_allowance gives a null level to someone without a guest row; the app reads it as 0.
  assert.equal((await gateway({ allowed: 1, used: 0, remaining: 1, level: null, may_bring: false }).gw.allowance("p")).level, 0);
});

test("allowance: a refusal is thrown as the server sent it; a reply it can't read is the connection line", async () => {
  const refusal = { code: "42501", message: "Not invited" };
  await assert.rejects(gateway(null, refusal).gw.allowance("p"), (e) => e === refusal);
  for (const odd of [null, [], "x", { allowed: 1, used: 0, remaining: 1, level: 1 }, { allowed: "1", used: 0, remaining: 1, level: 1, may_bring: true }, { allowed: 1, used: -1, remaining: 1, level: 1, may_bring: true }])
    await assert.rejects(gateway(odd).gw.allowance("p"), /Check your connection and try again\./);
});

test("allowance runs inside the deadline it is given", async () => {
  let wrapped = 0;
  const gw = createCircleGateway(
    async () => ({ data: { allowed: 1, used: 0, remaining: 1, level: 1, may_bring: true }, error: null }),
    async (request) => {
      wrapped += 1;
      return request(new AbortController().signal);
    },
  );
  assert.equal((await gw.allowance("p")).remaining, 1);
  assert.equal(wrapped, 1);
});
