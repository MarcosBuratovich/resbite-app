import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runNotifications,
  GatewayFailure,
  payloadFor,
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
  // A store with one job, then none: the sender claims until a claim comes back empty.
  let claimed = false;
  const store = {
    claim: async (_limit: number) => {
      if (claimed) return [];
      claimed = true;
      return [{ ...job, ...overrides }];
    },
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

test("payload uses the event title and what happened when the claim carries them", async () => {
  const f = fixture({
    kind: "rsvp",
    detail: "maybe",
    title: "Picnic in the park",
    starts_at: "2026-10-17T09:00:00Z",
    time_zone: "Europe/London",
    actor_name: "Sam",
  });
  await runNotifications(f.store, f.gateway, true);
  assert.deepEqual(f.payloads, [
    {
      to: job.token,
      title: "Picnic in the park",
      body: "Sam might come.",
      data: { type: "plan_update", planId: job.plan_id, notificationId: "1" },
      ttl: 3600,
    },
  ]);
});
test("a host's push says who brought the person who answered when the claim names them", () => {
  const answer = { ...job, kind: "rsvp", detail: "accepted", title: "Board game night", actor_name: "Clara" };
  assert.equal(payloadFor({ ...answer, brought_by_name: "Pedro" }).body, "Clara is going · brought by Pedro.");
  assert.equal(payloadFor({ ...answer, brought_by_name: null }).body, "Clara is going.");
});
test("a connection notice carries the connection type, a plan notice the plan_update type", () => {
  for (const kind of ["connection_request", "connection_accepted"])
    assert.equal(payloadFor({ ...job, kind }).data.type, "connection");
  assert.equal(payloadFor({ ...job, kind: "rsvp" }).data.type, "plan_update");
});

const SERIES = "30000000-0000-4000-8000-000000000003";
test("a chat push names the chat it opens: type chat with the series, the plan and the notice", () => {
  for (const kind of ["chat_message", "announcement"]) {
    const payload = payloadFor({
      ...job,
      kind,
      series_id: SERIES,
      message_id: "77",
      message_body: "See you at 8",
      audience: kind === "announcement" ? "everyone" : null,
      title: "Board game night",
      actor_name: "Leo Martínez",
    });
    assert.deepEqual(payload.data, { type: "chat", seriesId: SERIES, planId: job.plan_id, notificationId: "1" }, kind);
    assert.equal(payload.data.type, "chat");
    assert.equal(payload.data.seriesId, SERIES);
    assert.equal(payload.title, "Board game night");
    assert.equal(payload.body, kind === "announcement" ? "Announcement from Leo: See you at 8" : "Leo: See you at 8");
    // The message id and the audience stay on the server.
    assert.ok(!JSON.stringify(payload).includes('"77"') && !JSON.stringify(payload).includes("everyone"), kind);
  }
});
test("a chat push with a missing or malformed series is never sent", async () => {
  for (const kind of ["chat_message", "announcement"])
    for (const series_id of [null, undefined, "", "not-a-uuid", `${SERIES}x`, " " + SERIES, "30000000-0000-4000-8000-00000000000g"])
      assert.throws(
        () => payloadFor({ ...job, kind, series_id }),
        (e: unknown) => e instanceof GatewayFailure && e.disposition === "failed",
        `${kind}/${JSON.stringify(series_id)}`,
      );
  // Through the runner it is a failed delivery and nothing reaches the gateway.
  const f = fixture({ kind: "chat_message", series_id: "bad", title: "Board game night", actor_name: "Leo", message_body: "Hi" });
  await runNotifications(f.store, f.gateway, true);
  assert.equal(f.payloads.length, 0);
  assert.deepEqual(f.outcomes, [{ outcome: "failed" }]);
});
test("other kinds keep their payload, with no series, even when the claim carries one", () => {
  for (const series_id of [SERIES, "not-a-uuid", null]) {
    assert.deepEqual(payloadFor({ ...job, kind: "rsvp", series_id }).data, { type: "plan_update", planId: job.plan_id, notificationId: "1" });
    assert.deepEqual(payloadFor({ ...job, kind: "connection_request", series_id }).data, {
      type: "connection",
      planId: job.plan_id,
      notificationId: "1",
    });
  }
});

/** A store whose claims return these batch sizes in turn (then none), or a full batch for ever. */
function batches(sizes: number[] | "endless") {
  const limits: number[] = [];
  const outcomes: Result[] = [];
  let next = 0;
  const store = {
    async claim(limit: number) {
      limits.push(limit);
      const size = sizes === "endless" ? 25 : (sizes[limits.length - 1] ?? 0);
      return Array.from({ length: size }, () => ({ ...job, id: `delivery-${next}`, outbox_id: String(++next) }));
    },
    validate: async () => true,
    finish: async (_: Delivery, value: Result) => {
      outcomes.push(value);
    },
  };
  const gateway = {
    send: async () => ({ status: "ok" as const, id: "ticket" }),
    receipt: async (): Promise<any> => ({ status: "ok" }),
  };
  return { store, gateway, limits, outcomes };
}
test("the sender claims 25 at a time until a claim comes back empty (K-B3.3)", async () => {
  const f = batches([25, 25, 3]);
  assert.deepEqual(await runNotifications(f.store, f.gateway, true), { disabled: false, processed: 53 });
  assert.deepEqual(f.limits, [25, 25, 25, 25]);
  assert.equal(f.outcomes.length, 53);
  // An empty first claim ends the run at once.
  const empty = batches([]);
  assert.deepEqual(await runNotifications(empty.store, empty.gateway, true), { disabled: false, processed: 0 });
  assert.deepEqual(empty.limits, [25]);
});
test("the sender stops claiming once its 40-second budget is spent (K-B3.4)", async () => {
  const f = batches("endless");
  let calls = 0;
  const start = 1_000_000;
  // The first call reads the start; each later call is 15 seconds on.
  const clock = () => start + 15_000 * calls++;
  const result = await runNotifications(f.store, f.gateway, true, Date.now(), clock);
  assert.deepEqual(f.limits, [25, 25, 25]);
  assert.deepEqual(result, { disabled: false, processed: 75 });
  // A smaller budget is honoured too: the first batch always runs, the clock is checked after each.
  const g = batches("endless");
  let ticks = 0;
  await runNotifications(g.store, g.gateway, true, Date.now(), () => 15_000 * ticks++, 10_000);
  assert.deepEqual(g.limits, [25]);
});
test("a disabled sender never reads the clock or claims", async () => {
  const f = batches("endless");
  const result = await runNotifications(f.store, f.gateway, false, Date.now(), () => {
    throw Error("Must not read the clock");
  });
  assert.deepEqual(result, { disabled: true, processed: 0 });
  assert.deepEqual(f.limits, []);
});
