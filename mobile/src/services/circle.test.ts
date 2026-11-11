import test from "node:test";
import assert from "node:assert/strict";
import { bringerRevokeError, circleErrorMessage, createCircleGateway, saveCircle } from "./circle";
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

test("the people list's four calls: their function names and arguments", async () => {
  const { calls, gw } = gateway({});
  await gw.bringers("plan-1");
  const links = gateway([]);
  await links.gw.broughtLinks("plan-1");
  const revoke = gateway(null);
  await revoke.gw.revokeBrought("plan-1", "inv-1");
  await revoke.gw.withdraw("plan-1", "clara");
  assert.deepEqual([...calls, ...links.calls, ...revoke.calls], [
    { fn: "plan_bringers", args: { p_plan: "plan-1" } },
    { fn: "plan_brought_invitations", args: { p_plan: "plan-1" } },
    { fn: "revoke_brought_invitation", args: { p_plan: "plan-1", p_invitation: "inv-1" } },
    { fn: "withdraw_brought_invitation", args: { p_plan: "plan-1", p_user: "clara" } },
  ]);
});

test("bringers: each bringer's first name by id; a blank one is no name; a reply it can't read is the connection line", async () => {
  assert.deepEqual(await gateway({ pedro: "Pedro", clara: "Clara" }).gw.bringers("p"), { pedro: "Pedro", clara: "Clara" });
  // The server's first word of a blank display name is "".
  assert.deepEqual(await gateway({ pedro: "Pedro", sol: "", leo: "  ", odd: 7 }).gw.bringers("p"), { pedro: "Pedro" });
  for (const odd of [null, [], "Pedro", 3]) await assert.rejects(gateway(odd).gw.bringers("p"), /Check your connection and try again\./, JSON.stringify(odd));
  const refusal = { code: "42501", message: "Names required" };
  await assert.rejects(gateway(null, refusal).gw.bringers("p"), (e) => e === refusal);
});

test("broughtLinks: id, ending, country and the bringer's first name, null when left out (C14); never the number", async () => {
  const reply = [
    { id: "inv-1", ending: "23", country: "GB", brought_by_name: "Sol" },
    { id: "inv-2", ending: "07", country: "AR" },
    { id: "inv-3", ending: "45", country: "ES", brought_by_name: null, phone: "447700900145" },
    { id: "inv-4", ending: "61", country: "GB", brought_by_name: "" },
  ];
  assert.deepEqual(await gateway(reply).gw.broughtLinks("p"), [
    { id: "inv-1", ending: "23", country: "GB", broughtByName: "Sol" },
    { id: "inv-2", ending: "07", country: "AR", broughtByName: null },
    { id: "inv-3", ending: "45", country: "ES", broughtByName: null },
    { id: "inv-4", ending: "61", country: "GB", broughtByName: null },
  ]);
  for (const odd of [null, {}, "x", [{ ending: "23", country: "GB" }], [{ id: "inv-1", country: "GB" }], [{ id: "inv-1", ending: 23, country: "GB" }], [null]])
    await assert.rejects(gateway(odd).gw.broughtLinks("p"), /Check your connection and try again\./, JSON.stringify(odd));
  const refusal = { code: "42501", message: "Plan owner required" };
  await assert.rejects(gateway(null, refusal).gw.broughtLinks("p"), (e) => e === refusal);
});

test("revokeBrought and withdraw: 42501 is 'You can’t take this invitation back any more.', anything else the connection line (C14)", async () => {
  for (const call of ["revokeBrought", "withdraw"] as const) {
    for (const refusal of [
      { code: "42501", message: "Not your invitation" },
      { code: "42501", message: "Active plan owner required" },
    ])
      await assert.rejects(gateway(null, refusal).gw[call]("p", "x"), (e) => e instanceof Error && e.message === "You can’t take this invitation back any more.", `${call} ${refusal.message}`);
    for (const other of [{ code: "57014" }, { code: "P0001", message: "boom" }, { message: "Failed to fetch" }])
      await assert.rejects(gateway(null, other).gw[call]("p", "x"), (e) => e instanceof Error && e.message === "Check your connection and try again.", `${call} ${JSON.stringify(other)}`);
    // A lost connection or the deadline throws before any reply.
    const thrown = createCircleGateway(async () => {
      throw new Error("Failed to fetch");
    });
    await assert.rejects(thrown[call]("p", "x"), (e) => e instanceof Error && e.message === "Check your connection and try again.", call);
  }
  assert.equal(await gateway(null).gw.revokeBrought("p", "inv-1"), undefined);
  assert.equal(await gateway(null).gw.withdraw("p", "clara"), undefined);
});

test("a bringer removing their own link too late hears it in a bringer's words, not the hosts' (C14)", () => {
  // contactInviteGateway.revoke words a 42501 for hosts ("Only a host can invite people…"); a bringer's is too late.
  assert.equal(bringerRevokeError(new Error("Only a host can invite people to a resbite that hasn’t ended.")).message, "You can’t take this invitation back any more.");
  assert.equal(bringerRevokeError(new Error("Check your connection and try again.")).message, "Check your connection and try again.");
  assert.equal(bringerRevokeError("odd").message, "Check your connection and try again.");
});
