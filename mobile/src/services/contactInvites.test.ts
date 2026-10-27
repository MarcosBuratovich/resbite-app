import test from "node:test";
import assert from "node:assert/strict";
import { createContactInviteGateway, inviteErrorMessage } from "./contactInvites";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(reply: (c: Call) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const call = { fn, args };
    calls.push(call);
    return reply(call);
  };
  return { calls, gw: createContactInviteGateway(rpc) };
}

test("the lookup batches 120 numbers into 3 calls and unions the results", async () => {
  const phones = Array.from({ length: 120 }, (_, i) => String(447700900000 + i));
  const { calls, gw } = gateway((c) => ({ data: (c.args.p_phones as string[]).slice(0, 1), error: null }));
  const found = await gw.onResbite(phones);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => (c.args.p_phones as string[]).length), [50, 50, 20]);
  assert.ok(calls.every((c) => c.fn === "contacts_on_resbite"));
  assert.deepEqual([...found].sort(), [phones[0], phones[50], phones[100]]);
});

test("an empty lookup makes no call", async () => {
  const { calls, gw } = gateway(() => ({ data: [], error: null }));
  assert.equal((await gw.onResbite([])).size, 0);
  assert.equal(calls.length, 0);
});

test("invite maps the reply in input order", async () => {
  const items = [
    { phone: "+447700900201", country: "44", code: "A".repeat(22) },
    { phone: "+447700900202", country: "44", code: "B".repeat(22) },
  ];
  const { calls, gw } = gateway(() => ({
    data: [
      { phone: "447700900201", kind: "app" },
      { phone: "447700900202", kind: "link" },
    ],
    error: null,
  }));
  assert.deepEqual(await gw.invite("plan", items), [
    { phone: "447700900201", kind: "app" },
    { phone: "447700900202", kind: "link" },
  ]);
  assert.equal(calls[0].fn, "invite_contacts");
  assert.deepEqual(calls[0].args, { p_plan: "plan", p_invites: items });
});

test("invite rejects a reply that does not match the request", async () => {
  const { gw } = gateway(() => ({ data: [{ phone: "1", kind: "bogus" }], error: null }));
  await assert.rejects(gw.invite("p", [{ phone: "+1", country: "1", code: "A".repeat(22) }]));
});

test("list and revoke call their RPCs", async () => {
  const { calls, gw } = gateway((c) => ({
    data: c.fn === "plan_phone_invitations" ? [{ phone: "447700900202", country: "44", answered: true, response: "accepted" }] : null,
    error: null,
  }));
  assert.deepEqual(await gw.list("p"), [{ phone: "447700900202", country: "44", answered: true, response: "accepted" }]);
  await gw.revoke("p", "447700900202");
  assert.deepEqual(calls[1], { fn: "revoke_phone_invitation", args: { p_plan: "p", p_phone: "447700900202" } });
});

test("a server error becomes its message", async () => {
  const { gw } = gateway(() => ({ data: null, error: { code: "42501", message: "x" } }));
  await assert.rejects(gw.revoke("p", "1"), { message: "Only the organizer can invite people to an upcoming resbite." });
});

test("error mapping", () => {
  assert.equal(inviteErrorMessage({ code: "42501" }), "Only the organizer can invite people to an upcoming resbite.");
  assert.equal(inviteErrorMessage({ code: "22023", message: "Try again tomorrow." }), "Try again tomorrow.");
  assert.equal(inviteErrorMessage({ code: "22023" }), "Check your connection and try again.");
  assert.equal(inviteErrorMessage(new Error("network")), "Check your connection and try again.");
  assert.equal(inviteErrorMessage(null), "Check your connection and try again.");
});
