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
    readChat: async () => ({}),
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
test("a moderator's report push is not a plan-update tap and routes nowhere", async () => {
  const report = push({ type: "report", notificationId: "7" });
  const t = setup();
  assert.equal(isPlanUpdateTap(report), false);
  assert.equal(t.router.receive(report), false);
  await settle();
  assert.deepEqual(t.opened, []);
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
    readChat: async () => ({}),
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
    readChat: async () => ({}),
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

test("a read that failed opens the event, whose page retries; an empty read is gone", async () => {
  const opened: TapDestination[] = [];
  let read: () => Promise<{ id: string } | null> = async () => Promise.reject(Error("Network request failed"));
  const router = createPushTapRouter({
    context: () => ({ ready: true, account: "u1", approved: true, preview: false }),
    readAuthorizedPlan: () => read(),
    refreshAccount: async () => null,
    readChat: async () => ({}),
    open: (d) => void opened.push(d),
  });
  // Offline or timed out: not "gone".
  router.receive(push());
  await settle();
  assert.deepEqual(opened, [{ pathname: "/event", params: { plan: PLAN } }]);
  // An empty read (removed, declined, gone): My resbites with the note, as before.
  read = async () => null;
  router.receive(push());
  await settle();
  assert.equal(opened.length, 2);
  assert.equal(opened[1].pathname, "/plans");
  assert.match(JSON.stringify(opened[1].params), /^\{"notice":"gone","n":"[0-9a-z]+"\}$/);
});
test("a failed read for a tap superseded or an account changed meanwhile goes nowhere", async () => {
  const OTHER = "223e4567-e89b-42d3-a456-426614174000";
  const context: TapContext = { ready: true, account: "u1", approved: true, preview: false };
  const opened: TapDestination[] = [];
  const fail: Array<() => void> = [];
  const router = createPushTapRouter({
    context: () => context,
    readAuthorizedPlan: (_a, plan) =>
      plan === PLAN ? new Promise((_, reject) => fail.push(() => reject(Error("timeout")))) : Promise.resolve({ id: plan }),
    refreshAccount: async () => null,
    readChat: async () => ({}),
    open: (d) => void opened.push(d),
  });
  // A newer tap supersedes it before its read fails.
  router.receive(push());
  await settle();
  router.receive(push({ type: "plan_update", planId: OTHER, notificationId: "8" }));
  await settle();
  fail.shift()!();
  await settle();
  assert.deepEqual(opened, [{ pathname: "/event", params: { plan: OTHER } }]);
  // The account changes before its read fails.
  router.receive(push());
  await settle();
  context.account = "u2";
  fail.shift()!();
  await settle();
  assert.deepEqual(opened, [{ pathname: "/event", params: { plan: OTHER } }]);
});
test("a connection tap opens Connections without reading a plan", async () => {
  const t = setup();
  assert.equal(t.router.receive(push({ type: "connection", planId: PLAN, notificationId: "7" })), true);
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/connections" }]);
  assert.deepEqual(t.reads, []);
});
test("a connection tap waits for readiness and is dropped when signed out", async () => {
  const t = setup({ ready: false });
  t.router.receive(push({ type: "connection", planId: PLAN, notificationId: "7" }));
  await settle();
  assert.deepEqual(t.opened, []);
  t.context.ready = true;
  await t.router.flush();
  assert.deepEqual(t.opened, [{ pathname: "/connections" }]);
  const out = setup({ account: null });
  out.router.receive(push({ type: "connection", planId: PLAN, notificationId: "7" }));
  await settle();
  assert.deepEqual(out.opened, []);
});

// Task 8: a chat push (`{type:"chat", seriesId, planId, notificationId}`, Task 4) opens its chat once the chat reads; a
// refused read falls back to the event (K-B4); a failed one opens the chat, which has its own offline state.
const SERIES = "30000000-0000-4000-8000-000000000001";
const chatPush = (over: Record<string, unknown> = {}) => push({ type: "chat", seriesId: SERIES, planId: PLAN, notificationId: "9", ...over });
const notInChat = Object.assign(Error("Not in this chat"), { code: "42501", message: "Not in this chat" });
function chatSetup(
  chat: () => Promise<unknown>,
  plan: (id: string) => Promise<{ id: string } | null> = async (id) => ({ id }),
  context: TapContext = { ready: true, account: "u1", approved: true, preview: false },
) {
  const opened: TapDestination[] = [];
  const reads: string[] = [];
  const router = createPushTapRouter({
    context: () => context,
    readChat: (account, series) => {
      reads.push(`chat ${account} ${series}`);
      return chat();
    },
    readAuthorizedPlan: (account, id) => {
      reads.push(`plan ${account} ${id}`);
      return plan(id);
    },
    refreshAccount: async () => null,
    open: (d) => void opened.push(d),
  });
  return { router, opened, reads, context };
}

test("a chat tap is a Resbite push, and opens /chat?series= after the chat reads", async () => {
  assert.equal(isPlanUpdateTap(chatPush()), true);
  const t = chatSetup(async () => ({ seriesId: SERIES }));
  assert.equal(t.router.receive(chatPush()), true);
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/chat", params: { series: SERIES } }]);
  assert.deepEqual(t.reads, [`chat u1 ${SERIES}`], "the chat is read as this account, and no plan read is needed");
});

test("a pending invitee's announcement tap (the chat refused, the plan readable) opens the event, never the gone note (K-B4)", async () => {
  const t = chatSetup(async () => Promise.reject(notInChat));
  t.router.receive(chatPush());
  await settle();
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/event", params: { plan: PLAN } }]);
  assert.deepEqual(t.reads, [`chat u1 ${SERIES}`, `plan u1 ${PLAN}`]);
});

test("a removed guest's tap (the chat refused, the plan unreadable) gets the gone note (K-B4)", async () => {
  const t = chatSetup(async () => Promise.reject(notInChat), async () => null);
  t.router.receive(chatPush());
  await settle();
  await settle();
  assert.equal(t.opened.length, 1);
  assert.equal(t.opened[0].pathname, "/plans");
  assert.match(JSON.stringify(t.opened[0].params), /^\{"notice":"gone","n":"[0-9a-z]+"\}$/);
  // A plan read that answers with another plan is no answer at all.
  const other = chatSetup(async () => Promise.reject(notInChat), async () => ({ id: "223e4567-e89b-42d3-a456-426614174000" }));
  other.router.receive(chatPush());
  await settle();
  await settle();
  assert.equal(other.opened[0].pathname, "/plans");
});

test("a refused chat whose plan read then fails opens the event, as a plan tap does (K-B4)", async () => {
  const t = chatSetup(async () => Promise.reject(notInChat), async () => Promise.reject(Error("Network request failed")));
  t.router.receive(chatPush());
  await settle();
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/event", params: { plan: PLAN } }]);
});

test("an offline or timed-out chat read opens /chat?series=, whose screen has its own offline state (K-B4)", async () => {
  for (const failure of [Error("Network request failed"), Object.assign(Error("timeout"), { name: "AbortError" }), { code: "22023", message: "Chat closed" }, { code: "42501", message: "Hosts only" }]) {
    const t = chatSetup(async () => Promise.reject(failure));
    t.router.receive(chatPush());
    await settle();
    await settle();
    assert.deepEqual(t.opened, [{ pathname: "/chat", params: { series: SERIES } }], JSON.stringify(failure));
    assert.deepEqual(t.reads, [`chat u1 ${SERIES}`], "no plan read");
  }
});

test("a malformed chat push goes to My resbites without reading anything", async () => {
  for (const data of [chatPush({ seriesId: "../x" }), chatPush({ seriesId: undefined }), chatPush({ url: "https://evil.invalid" })]) {
    const t = chatSetup(async () => ({}));
    t.router.receive(data);
    await settle();
    assert.equal(t.opened.length, 1);
    assert.equal(t.opened[0].pathname, "/plans");
    assert.deepEqual(t.reads, []);
  }
});

test("a chat tap waits for readiness, is dropped when signed out, and is dropped when superseded or the account changes", async () => {
  const waiting = chatSetup(async () => ({}), undefined, { ready: false, account: "u1", approved: true, preview: false });
  waiting.router.receive(chatPush());
  await settle();
  assert.deepEqual(waiting.opened, []);
  waiting.context.ready = true;
  await waiting.router.flush();
  await settle();
  assert.deepEqual(waiting.opened, [{ pathname: "/chat", params: { series: SERIES } }]);

  const out = chatSetup(async () => ({}), undefined, { ready: true, account: null, approved: false, preview: false });
  out.router.receive(chatPush());
  await settle();
  assert.deepEqual(out.opened, []);
  assert.deepEqual(out.reads, []);

  // The account changes while the chat is read: nothing opens, whether the read then succeeds, is refused or fails.
  for (const answer of ["ok", "refused", "failed"] as const) {
    const context: TapContext = { ready: true, account: "u1", approved: true, preview: false };
    let release: () => void = () => {};
    const t = chatSetup(
      () =>
        new Promise((resolve, reject) => {
          release = () => (answer === "ok" ? resolve({}) : reject(answer === "refused" ? notInChat : Error("offline")));
        }),
      async () => ({ id: PLAN }),
      context,
    );
    t.router.receive(chatPush());
    await settle();
    context.account = "u2";
    release();
    await settle();
    await settle();
    assert.deepEqual(t.opened, [], answer);
  }

  // The plan read of a refused chat, superseded by a newer tap before it answers: only the newer tap opens.
  const OTHER = "223e4567-e89b-42d3-a456-426614174000";
  let releasePlans: () => void = () => {};
  const held = new Promise<void>((resolve) => (releasePlans = resolve));
  const t = chatSetup(
    async () => Promise.reject(notInChat),
    async (id) => {
      await held;
      return { id };
    },
  );
  t.router.receive(chatPush());
  await settle();
  await settle();
  assert.deepEqual(t.reads, [`chat u1 ${SERIES}`, `plan u1 ${PLAN}`]);
  t.router.receive(push({ type: "plan_update", planId: OTHER, notificationId: "8" }));
  await settle();
  releasePlans();
  await settle();
  await settle();
  assert.deepEqual(t.opened, [{ pathname: "/event", params: { plan: OTHER } }]);
});

// Fix round 1 (H36 Q2, the tester's 3.13): a tap for the chat already on screen opens nothing, so it never runs twice.
test("a chat tap for the chat in focus reads and opens nothing; another chat, or a plan tap, still opens", async () => {
  const OTHER_SERIES = "30000000-0000-4000-8000-000000000002";
  let focused: string | null = SERIES;
  const opened: TapDestination[] = [];
  const reads: string[] = [];
  let answer: () => Promise<unknown> = async () => ({});
  const router = createPushTapRouter({
    context: () => ({ ready: true, account: "u1", approved: true, preview: false }),
    readChat: (_a, series) => {
      reads.push(`chat ${series}`);
      return answer();
    },
    readAuthorizedPlan: async (_a, id) => {
      reads.push(`plan ${id}`);
      return { id };
    },
    refreshAccount: async () => null,
    focusedChat: () => focused,
    open: (d) => void opened.push(d),
  });
  // That chat is on screen: the tap is taken (true) but nothing is read or opened.
  assert.equal(router.receive(chatPush()), true);
  await settle();
  assert.deepEqual(opened, []);
  assert.deepEqual(reads, []);
  // Another chat's tap opens it; a plan tap opens its event.
  router.receive(chatPush({ seriesId: OTHER_SERIES }));
  await settle();
  router.receive(push());
  await settle();
  assert.deepEqual(opened, [
    { pathname: "/chat", params: { series: OTHER_SERIES } },
    { pathname: "/event", params: { plan: PLAN } },
  ]);
  // The chat comes into focus while its read is in flight (the person opened it from the Chat row): nothing more opens.
  focused = null;
  opened.length = 0;
  let release: () => void = () => {};
  answer = () => new Promise((resolve) => (release = () => resolve({})));
  router.receive(chatPush());
  await settle();
  focused = SERIES;
  release();
  await settle();
  await settle();
  assert.deepEqual(opened, []);
  // With no chat in focus it opens as before.
  focused = null;
  answer = async () => ({});
  router.receive(chatPush());
  await settle();
  assert.deepEqual(opened, [{ pathname: "/chat", params: { series: SERIES } }]);
});
