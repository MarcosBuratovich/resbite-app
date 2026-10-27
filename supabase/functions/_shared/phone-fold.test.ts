import test from "node:test";
import assert from "node:assert/strict";
import { handleFold, type FoldDeps } from "./phone-fold.ts";

type U = { id: string; phone: string | null; phone_confirmed_at: string | null };
const web: U = { id: "web", phone: "447700900834", phone_confirmed_at: "2026-10-01T00:00:00Z" };
const caller: U = { id: "me", phone: null, phone_confirmed_at: null };

function setup(over: Partial<FoldDeps> = {}, users: Record<string, U> = { mine: caller, theirs: web }) {
  const calls: string[] = [];
  const deps: FoldDeps = {
    approved: true,
    userFor: async (t) => { calls.push(`user:${t}`); return users[t] ?? null; },
    fold: async (a, b) => { calls.push(`fold:${a}>${b}`); },
    deleteUser: async (id) => { calls.push(`delete:${id}`); },
    setPhone: async (id, d) => { calls.push(`phone:${id}:${d}`); },
    ...over,
  };
  return { deps, calls };
}
const req = (body: unknown, auth: string | null = "Bearer mine") =>
  new Request("https://x.invalid/fold-phone-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ok = { foreign_token: "theirs", phone: "+44 7700 900834" };

test("not approved: 503 and no calls", async () => {
  const { deps, calls } = setup({ approved: false });
  assert.equal((await handleFold(req(ok), deps)).status, 503);
  assert.deepEqual(calls, []);
});

test("bad or missing tokens: 401", async () => {
  for (const [body, auth] of [
    [ok, null], [ok, "Bearer nobody"], [{ ...ok, foreign_token: "nobody" }, "Bearer mine"], [{ phone: ok.phone }, "Bearer mine"], ["not json", "Bearer mine"],
  ] as const) {
    const { deps, calls } = setup();
    assert.equal((await handleFold(req(body, auth), deps)).status, 401);
    assert.ok(!calls.some((c) => c.startsWith("fold") || c.startsWith("delete") || c.startsWith("phone")));
  }
});

test("phone mismatch or unconfirmed: 403", async () => {
  for (const [users, phone] of [
    [{ mine: caller, theirs: web }, "+447700900999"],
    [{ mine: caller, theirs: { ...web, phone_confirmed_at: null } }, ok.phone],
    [{ mine: caller, theirs: { ...web, phone: null } }, ok.phone],
  ] as const) {
    const { deps, calls } = setup({}, { ...users });
    assert.equal((await handleFold(req({ foreign_token: "theirs", phone }), deps)).status, 403);
    assert.ok(!calls.some((c) => c.startsWith("fold")));
  }
});

test("same user on both sides: 409", async () => {
  const { deps, calls } = setup({}, { mine: web, theirs: web });
  assert.equal((await handleFold(req(ok), deps)).status, 409);
  assert.ok(!calls.some((c) => c.startsWith("fold")));
});

test("caller already has a confirmed phone: 409", async () => {
  const { deps, calls } = setup({}, { mine: { ...caller, phone: "441", phone_confirmed_at: "2026-01-01T00:00:00Z" }, theirs: web });
  assert.equal((await handleFold(req(ok), deps)).status, 409);
  assert.ok(!calls.some((c) => c.startsWith("fold")));
});

test("happy path folds, deletes, then sets the phone", async () => {
  const { deps, calls } = setup();
  const res = await handleFold(req(ok), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(calls.filter((c) => !c.startsWith("user:")), ["fold:web>me", "delete:web", "phone:me:447700900834"]);
});

test("deleteUser throwing gives 500 and a retry completes", async () => {
  let fail = true;
  const { deps, calls } = setup({ deleteUser: async (id) => { calls.push(`delete:${id}`); if (fail) throw Error("boom"); } });
  const first = await handleFold(req(ok), deps);
  assert.equal(first.status, 500);
  assert.ok(!calls.some((c) => c.startsWith("phone")));
  assert.ok(!(await first.text()).includes("boom"));
  fail = false;
  assert.equal((await handleFold(req(ok), deps)).status, 200);
  assert.ok(calls.some((c) => c.startsWith("phone:me")));
});
