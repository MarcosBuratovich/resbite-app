import test from "node:test";
import assert from "node:assert/strict";
import { createContactInviteGateway, inviteConnections, inviteErrorMessage, isNotAConnection } from "./contactInvites";

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

test("invite sends 120 items in 3 calls of at most 50 and keeps their order", async () => {
  const items = Array.from({ length: 120 }, (_, i) => ({
    phone: String(447700900000 + i),
    country: "44",
    code: String(i).padStart(22, "A"),
  }));
  const { calls, gw } = gateway((c) => ({
    data: (c.args.p_invites as typeof items).map((x, j) => ({ phone: x.phone, kind: j % 2 ? "app" : "link" })),
    error: null,
  }));
  const results = await gw.invite("plan", items);
  assert.deepEqual(calls.map((c) => (c.args.p_invites as unknown[]).length), [50, 50, 20]);
  assert.ok(calls.every((c) => c.fn === "invite_contacts" && c.args.p_plan === "plan"));
  assert.deepEqual(calls.flatMap((c) => c.args.p_invites as typeof items), items, "every item once, in order");
  assert.deepEqual(results.map((r) => ("phone" in r ? r.phone : r.user)), items.map((x) => x.phone));
  assert.equal(results[50].kind, "link", "each batch's reply lines up with its own items");
  assert.equal(results[51].kind, "app");
});

test("invite of nothing makes no call; a short reply in a later batch fails the whole invite", async () => {
  const none = gateway(() => ({ data: [], error: null }));
  assert.deepEqual(await none.gw.invite("plan", []), []);
  assert.equal(none.calls.length, 0);
  const items = Array.from({ length: 60 }, (_, i) => ({ phone: String(447700901000 + i), country: "44", code: "A".repeat(22) }));
  // The second batch (10 items) gets 9 results back.
  const short = gateway((c) => {
    const batch = c.args.p_invites as typeof items;
    return { data: batch.slice(0, batch.length === 10 ? 9 : 50).map((x) => ({ phone: x.phone, kind: "link" })), error: null };
  });
  await assert.rejects(short.gw.invite("plan", items));
  assert.equal(short.calls.length, 2);
});

test("invite rejects a reply that does not match the request", async () => {
  const { gw } = gateway(() => ({ data: [{ phone: "1", kind: "bogus" }], error: null }));
  await assert.rejects(gw.invite("p", [{ phone: "+1", country: "1", code: "A".repeat(22) }]));
});

test("invite sends phone and user items in one batch and maps each reply by its own shape", async () => {
  const items = [
    { phone: "447700900201", country: "44", code: "A".repeat(22) },
    { user: "33333333-3333-4333-8333-333333333333" },
  ];
  const { calls, gw } = gateway(() => ({
    data: [
      { phone: "447700900201", kind: "link" },
      { user: "33333333-3333-4333-8333-333333333333", kind: "app" },
    ],
    error: null,
  }));
  assert.deepEqual(await gw.invite("plan", items), [
    { phone: "447700900201", kind: "link" },
    { user: "33333333-3333-4333-8333-333333333333", kind: "app" },
  ]);
  assert.deepEqual(calls, [{ fn: "invite_contacts", args: { p_plan: "plan", p_invites: items } }]);
});

test("a reply missing its user, or with a phone where the user should be, fails as offline", async () => {
  for (const reply of [{ kind: "app" }, { phone: "447700900201", kind: "app" }, { user: 7, kind: "app" }]) {
    const { gw } = gateway(() => ({ data: [reply], error: null }));
    await assert.rejects(gw.invite("plan", [{ user: "u-marta" }]), { message: "Check your connection and try again." });
  }
  // And a phone item's reply needs its phone.
  const { gw } = gateway(() => ({ data: [{ user: "u-marta", kind: "app" }], error: null }));
  await assert.rejects(gw.invite("plan", [{ phone: "1", country: "1", code: "A".repeat(22) }]), {
    message: "Check your connection and try again.",
  });
});

test("a refused connection (42501 'Not a connection') is its own error; any other 42501 is still hosts only", async () => {
  const refused = gateway(() => ({ data: null, error: { code: "42501", message: "Not a connection" } }));
  const e = await refused.gw.invite("plan", [{ user: "u-gone" }]).then(
    () => null,
    (x: unknown) => x,
  );
  assert.ok(isNotAConnection(e));
  assert.equal((e as Error).message, "Couldn't do that. Try again.");
  const host = gateway(() => ({ data: null, error: { code: "42501", message: "Host required" } }));
  const h = await host.gw.invite("plan", [{ user: "u-marta" }]).then(
    () => null,
    (x: unknown) => x,
  );
  assert.ok(!isNotAConnection(h));
  assert.equal((h as Error).message, "Only a host can invite people to a resbite that hasn’t ended.");
  assert.equal(isNotAConnection(new Error("Couldn't do that. Try again.")), false);
});

test("inviteConnections sends the connections in one call and maps the reply", async () => {
  const { calls, gw } = gateway((c) => ({
    data: (c.args.p_invites as { user: string }[]).map(({ user }) => ({ user, kind: user === "u-lucas" ? "already" : "app" })),
    error: null,
  }));
  assert.deepEqual(await inviteConnections(gw, "plan", ["u-marta", "u-lucas"]), {
    results: [
      { user: "u-marta", kind: "app" },
      { user: "u-lucas", kind: "already" },
    ],
    refused: [],
  });
  assert.deepEqual(calls.map((c) => c.args), [{ p_plan: "plan", p_invites: [{ user: "u-marta" }, { user: "u-lucas" }] }]);
  assert.deepEqual(await inviteConnections(gw, "plan", []), { results: [], refused: [] });
  assert.equal(calls.length, 1, "nobody to invite makes no call");
});

test("inviteConnections sends a refused call again one by one, so the others are still invited", async () => {
  // The server refuses the whole call when any one of its connections may no longer be invited.
  const { calls, gw } = gateway((c) => {
    const users = (c.args.p_invites as { user: string }[]).map((x) => x.user);
    if (users.includes("u-gone")) return { data: null, error: { code: "42501", message: "Not a connection" } };
    return { data: users.map((user) => ({ user, kind: "app" })), error: null };
  });
  assert.deepEqual(await inviteConnections(gw, "plan", ["u-marta", "u-gone", "u-sofia"]), {
    results: [
      { user: "u-marta", kind: "app" },
      { user: "u-sofia", kind: "app" },
    ],
    refused: ["u-gone"],
  });
  assert.deepEqual(
    calls.map((c) => (c.args.p_invites as { user: string }[]).map((x) => x.user)),
    [["u-marta", "u-gone", "u-sofia"], ["u-marta"], ["u-gone"], ["u-sofia"]],
  );
});

test("inviteConnections sends 60 connections in calls of at most 50; a lost connection still fails the whole invite", async () => {
  const users = Array.from({ length: 60 }, (_, i) => `u-${i}`);
  const ok = gateway((c) => ({
    data: (c.args.p_invites as { user: string }[]).map(({ user }) => ({ user, kind: "app" })),
    error: null,
  }));
  const { results } = await inviteConnections(ok.gw, "plan", users);
  assert.deepEqual(ok.calls.map((c) => (c.args.p_invites as unknown[]).length), [50, 10]);
  assert.deepEqual(results.map((r) => r.user), users);
  const lost = gateway(() => ({ data: null, error: { message: "Failed to fetch" } }));
  await assert.rejects(inviteConnections(lost.gw, "plan", ["u-marta"]), { message: "Check your connection and try again." });
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
  await assert.rejects(gw.revoke("p", "1"), { message: "Only a host can invite people to a resbite that hasn’t ended." });
});

test("error mapping", () => {
  assert.equal(inviteErrorMessage({ code: "42501" }), "Only a host can invite people to a resbite that hasn’t ended.");
  assert.equal(inviteErrorMessage({ code: "22023", message: "Try again tomorrow." }), "Try again tomorrow.");
  assert.equal(inviteErrorMessage({ code: "22023" }), "Check your connection and try again.");
  assert.equal(inviteErrorMessage(new Error("network")), "Check your connection and try again.");
  assert.equal(inviteErrorMessage(null), "Check your connection and try again.");
});
