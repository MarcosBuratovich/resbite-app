import test from "node:test";
import assert from "node:assert/strict";
import { createPushTapRouter, isPlanUpdateTap, type TapContext, type TapResponse } from "./pushTaps.ts";
import type { TapDestination } from "./pushTaps.ts";

const PLAN = "123e4567-e89b-42d3-a456-426614174000";
const push = (data: Record<string, unknown> = { type: "plan_update", planId: PLAN, notificationId: "7" }): TapResponse => ({
  notification: { request: { identifier: "remote-1", content: { data } } },
});
const reminder: TapResponse = {
  notification: { request: { identifier: "resbite-reminder:p1:1h", content: { data: { planId: PLAN } } } },
};
function setup(initial: Partial<TapContext> = {}, readable = true, onRefresh: (c: TapContext) => void = () => {}) {
  const context: TapContext = { ready: true, account: "u1", approved: true, preview: false, ...initial };
  const opened: TapDestination[] = [];
  let refreshes = 0;
  const reads: string[] = [];
  const router = createPushTapRouter({
    context: () => context,
    readAuthorizedPlan: async (_a, plan) => {
      reads.push(plan);
      return readable ? { id: plan } : null;
    },
    refreshAccount: () => {
      refreshes++;
      onRefresh(context);
    },
    open: (d) => void opened.push(d),
  });
  return { context, opened, reads, router, refreshes: () => refreshes };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test("a readable plan goes to the event", async () => {
  const t = setup();
  assert.equal(t.router.receive(push()), true);
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/event", params: { plan: PLAN } }]);
});
test("an unreadable plan goes to My resbites with the gone note", async () => {
  const t = setup({}, false);
  t.router.receive(push());
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/plans", params: { notice: "gone" } }]);
});
test("a malformed push payload goes to My resbites without reading", async () => {
  const t = setup();
  t.router.receive(push({ type: "plan_update", planId: "../x", notificationId: "7" }));
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/plans", params: { notice: "gone" } }]);
  assert.deepEqual(t.reads, []);
});
test("a reminder tap or an unrelated notification is not a push", async () => {
  const t = setup();
  assert.equal(isPlanUpdateTap(reminder), false);
  assert.equal(t.router.receive(reminder), false);
  assert.equal(t.router.receive(push({ other: 1 })), false);
  assert.equal(t.router.receive(null), false);
  await settle();
  assert.deepEqual(t.opened, []);
});
test("a tap waits for the session to settle, then routes once", async () => {
  const t = setup({ ready: false, account: null });
  t.router.receive(push());
  await settle();
  assert.deepEqual(t.opened, []);
  t.context.ready = true;
  t.context.account = "u1";
  await t.router.flush();
  await t.router.flush();
  assert.equal(t.opened.length, 1);
  assert.equal(t.reads.length, 1);
});
test("taps while signed out, in preview, or without approval are ignored", async () => {
  for (const ctx of [{ account: null }, { preview: true }]) {
    const t = setup(ctx);
    t.router.receive(push());
    await settle();
    assert.deepEqual(t.opened, []);
    assert.deepEqual(t.reads, []);
  }
});
test("the launch tap is handled once, and cleared", async () => {
  const t = setup();
  let cleared = 0;
  assert.equal(t.router.launch(() => push(), () => void cleared++), true);
  assert.equal(t.router.launch(() => push(), () => void cleared++), false);
  await settle();
  assert.equal(t.opened.length, 1);
  assert.equal(cleared, 1);
});
test("a launch reminder is left for the reminder path", () => {
  const t = setup();
  let cleared = 0;
  assert.equal(t.router.launch(() => reminder, () => void cleared++), false);
  assert.equal(cleared, 0);
});
test("an account change while checking drops the tap", async () => {
  const t = setup();
  const router = createPushTapRouter({
    context: () => t.context,
    readAuthorizedPlan: async (_a, plan) => {
      t.context.account = "u2";
      return { id: plan };
    },
    refreshAccount: () => {},
    open: (d) => void t.opened.push(d),
  });
  router.receive(push());
  await settle();
  assert.deepEqual(t.opened, []);
});

test("a pending account that turns approved after one refresh opens the event", async () => {
  let t!: ReturnType<typeof setup>;
  t = setup({ approved: false }, true, (c) => {
    c.ready = false;
  });
  t.router.receive(push());
  await settle();
  assert.equal(t.refreshes(), 1);
  assert.deepEqual(t.opened, []);
  t.context.ready = true;
  t.context.approved = true;
  await t.router.flush();
  assert.deepEqual(t.opened, [{ pathname: "/event", params: { plan: PLAN } }]);
  assert.equal(t.refreshes(), 1);
});
test("an account that stays pending goes to /account, refreshing only once", async () => {
  const t = setup({ approved: false }, true, (c) => {
    c.ready = false;
  });
  t.router.receive(push());
  await settle();
  t.context.ready = false;
  await t.router.flush();
  t.context.ready = true;
  await t.router.flush();
  await t.router.flush();
  assert.deepEqual(t.opened, [{ pathname: "/account" }]);
  assert.equal(t.refreshes(), 1);
  assert.deepEqual(t.reads, []);
});
