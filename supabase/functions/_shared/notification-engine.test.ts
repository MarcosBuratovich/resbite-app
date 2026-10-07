import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runNotifications,
  GatewayFailure,
  type Delivery,
  type Result,
} from "./notification-engine.ts";
import { expoGateway } from "./notification-adapters.ts";
import { notificationHandler } from "../deliver-notifications/handler.ts";
const job: Delivery = {
  id: "delivery",
  lease_id: "lease",
  outbox_id: "1",
  plan_id: "20000000-0000-4000-8000-000000000001",
  recipient_id: "user",
  token: "ExpoPushToken[synthetic]",
  attempts: 1,
  ticket_id: null,
  ticket_created_at: null,
};
function fixture(overrides: Partial<Delivery> = {}) {
  const outcomes: Result[] = [];
  const payloads: unknown[] = [];
  const store = {
    claim: async () => [{ ...job, ...overrides }],
    validate: async () => true,
    finish: async (_: Delivery, value: Result) => {
      outcomes.push(value);
    },
  };
  const gateway = {
    send: async (payload: unknown) => {
      payloads.push(payload);
      return { status: "ok" as const, id: "ticket" };
    },
    receipt: async (_id: string): Promise<any> => ({ status: "ok" }),
  };
  return { store, gateway, outcomes, payloads };
}
test("default disabled never claims or sends", async () => {
  const f = fixture();
  f.store.claim = async () => {
    throw Error("Must not claim");
  };
  assert.deepEqual(await runNotifications(f.store, f.gateway), {
    disabled: true,
    processed: 0,
  });
});
test("generic payload stable logical ID, then receipt without resend", async () => {
  const f = fixture();
  await runNotifications(f.store, f.gateway, true);
  assert.deepEqual(f.outcomes, [
    { outcome: "ticket", ticket: "ticket", delaySeconds: 900 },
  ]);
  assert.deepEqual(f.payloads, [
    {
      to: job.token,
      title: "Resbite",
      body: "You have an update. Open Resbite to see it.",
      data: { type: "plan_update", planId: job.plan_id, notificationId: "1" },
      ttl: 3600,
    },
  ]);
  const receipt = fixture({
    ticket_id: "ticket",
    ticket_created_at: new Date().toISOString(),
  });
  await runNotifications(receipt.store, receipt.gateway, true);
  assert.equal(receipt.payloads.length, 0);
  assert.equal(receipt.outcomes[0].outcome, "received");
});
test("rebound or removed endpoint is fenced immediately before gateway", async () => {
  const f = fixture();
  f.store.validate = async () => false;
  await runNotifications(f.store, f.gateway, true);
  assert.equal(f.payloads.length, 0);
  assert.equal(f.outcomes[0].outcome, "suppressed");
});
test("lost send reply is unknown and definite transient bounded retry", async () => {
  for (const [error, outcome] of [
    [Error("lost"), "unknown"],
    [new GatewayFailure("retry"), "retry"],
  ] as const) {
    const f = fixture();
    f.gateway.send = async () => {
      throw error;
    };
    await runNotifications(f.store, f.gateway, true);
    assert.equal(f.outcomes[0].outcome, outcome);
  }
  const f = fixture({ attempts: 8 });
  f.gateway.send = async () => {
    throw new GatewayFailure("retry");
  };
  await runNotifications(f.store, f.gateway, true);
  assert.equal(f.outcomes[0].outcome, "failed");
});
test("invalid endpoint receipt and missing receipt expiry", async () => {
  const f = fixture({ ticket_id: "ticket" });
  f.gateway.receipt = async () => ({
    status: "error",
    details: { error: "DeviceNotRegistered" },
  });
  await runNotifications(f.store, f.gateway, true);
  assert.equal(f.outcomes[0].outcome, "invalid");
  const expired = fixture({
    ticket_id: "ticket",
    ticket_created_at: new Date(0).toISOString(),
  });
  expired.gateway.receipt = async () => null;
  await runNotifications(expired.store, expired.gateway, true);
  assert.equal(expired.outcomes[0].outcome, "unknown");
});
test("failed ticket persistence is not mistaken for failed sending", async () => {
  const f = fixture();
  f.store.finish = async () => {
    throw Error("journal down");
  };
  await assert.rejects(
    runNotifications(f.store, f.gateway, true),
    /journal down/,
  );
  assert.equal(f.payloads.length, 1);
});
test("worker rejects caller before accessing database and disabled authorized request is inert", async () => {
  const f = fixture();
  f.store.claim = async () => {
    throw Error("Must not claim");
  };
  const handler = notificationHandler({ ...f, secret: "s".repeat(32) });
  assert.equal(
    (await handler(new Request("https://example.test", { method: "POST" })))
      .status,
    401,
  );
  assert.equal(
    (
      await handler(
        new Request("https://example.test", {
          method: "POST",
          headers: { authorization: "Bearer " + "s".repeat(32) },
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await handler(new Request("https://example.test"))).status,
    405,
  );
});
test("Expo gateway validates malformed reply and classifies HTTP failures without leaking responses", async () => {
  for (const [status, disposition] of [
    [429, "retry"],
    [503, "retry"],
    [400, "failed"],
  ] as const) {
    const gateway = expoGateway(
      "secret",
      async () => new Response("private data", { status }),
    );
    await assert.rejects(
      gateway.receipt("x"),
      (e: any) =>
        e.disposition === disposition && !e.message.includes("private"),
    );
  }
  const gateway = expoGateway("secret", async () =>
    Response.json({ data: {} }),
  );
  await assert.rejects(
    gateway.send({} as any),
    (e: any) => e.disposition === "unknown",
  );
});
