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
function setup(initial: Partial<TapContext> = {}, readable = true, onRefresh: (c: TapContext) => boolean | null = () => null, holdMs = 10_000) {
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
    refreshAccount: async () => {
      refreshes++;
      return onRefresh(context);
    },
    holdMs,
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
  assert.equal(t.opened.length, 1);
  assert.equal(t.opened[0].pathname, "/plans");
  assert.match(JSON.stringify(t.opened[0].params), /^\{"notice":"gone","n":"[0-9a-z]+"\}$/);
});
test("a malformed push payload goes to My resbites without reading", async () => {
  const t = setup();
  t.router.receive(push({ type: "plan_update", planId: "../x", notificationId: "7" }));
  await settle();
  assert.equal(t.opened.length, 1);
  assert.equal(t.opened[0].pathname, "/plans");
  assert.match(JSON.stringify(t.opened[0].params), /^\{"notice":"gone","n":"[0-9a-z]+"\}$/);
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
test("a tap whose account changes while it is being resolved is dropped", async () => {
  const t = setup();
  const router = createPushTapRouter({
    context: () => t.context,
    readAuthorizedPlan: async (_a, plan) => {
      t.context.account = "u2";
      return { id: plan };
    },
    refreshAccount: async () => null,
    open: (d) => void t.opened.push(d),
  });
  router.receive(push());
  await settle();
  assert.deepEqual(t.opened, []);
});

test("a pending account that refreshes to approved opens the event", async () => {
  const t = setup({ approved: false }, true, (c) => {
    c.approved = true;
    return true;
  });
  t.router.receive(push());
  await settle();
  assert.equal(t.refreshes(), 1);
  assert.deepEqual(t.opened, [{ pathname: "/event", params: { plan: PLAN } }]);
});
test("an account that refreshes to still pending goes to /account, refreshing once", async () => {
  const t = setup({ approved: false }, true, () => false);
  t.router.receive(push());
  await settle();
  await t.router.flush();
  assert.deepEqual(t.opened, [{ pathname: "/account" }]);
  assert.equal(t.refreshes(), 1);
  assert.deepEqual(t.reads, []);
});
test("a refresh that changes nothing still lands the tap on /account", async () => {
  const t = setup({ approved: false }, true, () => null);
  t.router.receive(push());
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/account" }]);
  assert.equal(t.refreshes(), 1);
});
test("a refresh superseded while the context settles later decides on the settled status", async () => {
  const t = setup({ approved: false }, true, (c) => {
    c.ready = false;
    return null;
  });
  t.router.receive(push());
  await settle();
  assert.deepEqual(t.opened, []);
  t.context.ready = true;
  t.context.approved = true;
  await t.router.flush();
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/event", params: { plan: PLAN } }]);
});
test("a tap held on an account that never settles goes to /account within the cap", async () => {
  const t = setup({ approved: false }, true, (c) => {
    c.ready = false;
    return null;
  }, 20);
  t.router.receive(push());
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(t.opened, [{ pathname: "/account" }]);
});
test("a newer tap supersedes one still being resolved, and nothing fires later", async () => {
  const OTHER = "223e4567-e89b-42d3-a456-426614174000";
  const opened: TapDestination[] = [];
  const release: Array<() => void> = [];
  const router = createPushTapRouter({
    context: () => ({ ready: true, account: "u1", approved: true, preview: false }),
    readAuthorizedPlan: (_a, plan) => new Promise((r) => release.push(() => r({ id: plan }))),
    refreshAccount: async () => null,
    open: (d) => void opened.push(d),
  });
  router.receive(push());
  router.receive(push({ type: "plan_update", planId: OTHER, notificationId: "8" }));
  await settle();
  release.forEach((r) => r());
  await settle();
  await settle();
  assert.deepEqual(opened, [{ pathname: "/event", params: { plan: OTHER } }]);
});
