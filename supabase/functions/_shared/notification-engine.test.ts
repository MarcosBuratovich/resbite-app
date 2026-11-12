import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runNotifications,
  GatewayFailure,
  payloadFor,
  type Delivery,
  type Result,
} from "./notification-engine.ts";
import { deliveryStore, expoGateway } from "./notification-adapters.ts";
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

/**
 * A store whose claims return these batch sizes in turn (then none), or a full batch for ever. `sendMs` is how far
 * each send moves the fake clock that `clock` reads.
 */
function batches(sizes: number[] | "endless", sendMs = 0) {
  const limits: number[] = [];
  const outcomes: Result[] = [];
  const validated: string[] = [];
  const sent: string[] = [];
  let next = 0;
  let time = 0;
  const store = {
    async claim(limit: number) {
      limits.push(limit);
      const size = sizes === "endless" ? limit : (sizes[limits.length - 1] ?? 0);
      return Array.from({ length: size }, () => ({ ...job, id: `delivery-${next}`, outbox_id: String(++next) }));
    },
    validate: async (delivery: Delivery) => {
      validated.push(delivery.id);
      return true;
    },
    finish: async (_: Delivery, value: Result) => {
      outcomes.push(value);
    },
  };
  const gateway = {
    send: async (payload: { data: { notificationId: string } }) => {
      sent.push(payload.data.notificationId);
      time += sendMs;
      return { status: "ok" as const, id: "ticket" };
    },
    receipt: async (): Promise<any> => ({ status: "ok" }),
  };
  return { store, gateway, limits, outcomes, validated, sent, clock: () => time };
}
const TICKET = { outcome: "ticket", ticket: "ticket", delaySeconds: 900 };
/** The outcome a job not started at the budget is finished with (H21): pending again, its attempt given back. */
const HANDED_BACK = { outcome: "deferred" };
test("the sender claims 25 first, then 10 at a time, until a claim comes back empty (K-B3.3, H3)", async () => {
  const f = batches([25, 10, 10, 3]);
  assert.deepEqual(await runNotifications(f.store, f.gateway, true, f.clock), { disabled: false, processed: 48, deferred: 0 });
  assert.deepEqual(f.limits, [25, 10, 10, 10, 10]);
  assert.equal(f.outcomes.length, 48);
  // An empty first claim ends the run at once.
  const empty = batches([]);
  assert.deepEqual(await runNotifications(empty.store, empty.gateway, true, empty.clock), { disabled: false, processed: 0, deferred: 0 });
  assert.deepEqual(empty.limits, [25]);
});
test("no new claim starts once 5 seconds have passed (K-B3.4, H3)", async () => {
  // 25 sends of 0.2 s: the last starts at 4.8 s and ends at 5 s, so the batch is sent whole and nothing more is claimed.
  const f = batches("endless", 200);
  assert.deepEqual(await runNotifications(f.store, f.gateway, true, f.clock), { disabled: false, processed: 25, deferred: 0 });
  assert.deepEqual(f.limits, [25]);
  assert.equal(f.sent.length, 25);
  // At 4.9 s a second claim still starts. Its sends stop at 5 s as below.
  const g = batches("endless", 196);
  const result = await runNotifications(g.store, g.gateway, true, g.clock);
  assert.deepEqual(g.limits, [25, 10]);
  assert.deepEqual(result, { disabled: false, processed: 26, deferred: 9 });
  // A run with a smaller budget stops sooner.
  const h = batches("endless", 1000);
  assert.deepEqual(await runNotifications(h.store, h.gateway, true, h.clock, 2000), { disabled: false, processed: 2, deferred: 23 });
});
test("no new send starts after 5 seconds: the rest of the batch is finished as deferred for the next run (H18, H21)", async () => {
  // 25 claimed, each send takes 2 s: sends start at 0, 2 and 4 s; at 6 s the other 22 are handed back unsent.
  const f = batches("endless", 2000);
  assert.deepEqual(await runNotifications(f.store, f.gateway, true, f.clock), { disabled: false, processed: 3, deferred: 22 });
  assert.deepEqual(f.limits, [25]);
  assert.equal(f.sent.length, 3);
  assert.equal(f.validated.length, 3);
  assert.deepEqual(f.outcomes, [TICKET, TICKET, TICKET, ...Array(22).fill(HANDED_BACK)]);
  // A job waiting for its receipt is handed back too, keeping its ticket: the provider is not asked again.
  let time = 0;
  const receipts: string[] = [];
  const outcomes: Result[] = [];
  const store = {
    claim: async (limit: number) =>
      limit === 25
        ? [
            { ...job, id: "slow" },
            { ...job, id: "waiting", ticket_id: "ticket-2", ticket_created_at: new Date(0).toISOString() },
          ]
        : [],
    validate: async () => true,
    finish: async (_: Delivery, value: Result) => {
      outcomes.push(value);
    },
  };
  const gateway = {
    send: async () => {
      time += 6000;
      return { status: "ok" as const, id: "ticket" };
    },
    receipt: async (id: string): Promise<any> => {
      receipts.push(id);
      return { status: "ok" };
    },
  };
  assert.deepEqual(await runNotifications(store, gateway, true, () => time), { disabled: false, processed: 1, deferred: 1 });
  assert.deepEqual(receipts, []);
  assert.deepEqual(outcomes, [TICKET, HANDED_BACK]);
});
test("a claim that fails after the first batch ends the run with what it did and says so; only a failed first claim is a 503 (H18, H21)", async () => {
  const f = batches([3]);
  const claim = f.store.claim;
  f.store.claim = async (limit: number) => {
    if (f.limits.length === 1) {
      f.limits.push(limit);
      throw Error("db down at ExponentPushToken[secret]");
    }
    return claim(limit);
  };
  const ended = await runNotifications(f.store, f.gateway, true, f.clock);
  assert.deepEqual(ended, { disabled: false, processed: 3, deferred: 0, error: "Notification claim failed" });
  // A short fixed reason: nothing the failure carried reaches the reply.
  assert.ok(!JSON.stringify(ended).includes("secret"));
  assert.deepEqual(f.limits, [25, 10]);
  assert.equal(f.outcomes.length, 3);
  const g = batches([3]);
  g.store.claim = async () => {
    throw Error("db down");
  };
  await assert.rejects(runNotifications(g.store, g.gateway, true, g.clock), /db down/);
  // Through the worker: a failed first claim is a 503; a failed later claim is the run's result.
  const post = () => new Request("https://example.test", { method: "POST", headers: { authorization: "Bearer " + "s".repeat(32) } });
  const failing = notificationHandler({ ...g, secret: "s".repeat(32), enabled: true });
  assert.equal((await failing(post())).status, 503);
  const h = batches([3]);
  const first = h.store.claim;
  let claims = 0;
  h.store.claim = async (limit: number) => {
    if (claims++ === 1) throw Error("db down");
    return first(limit);
  };
  const partial = await notificationHandler({ ...h, secret: "s".repeat(32), enabled: true })(post());
  assert.equal(partial.status, 200);
  assert.deepEqual(await partial.json(), { disabled: false, processed: 3, deferred: 0, error: "Notification claim failed" });
  // A malformed later claim ends the run the same way; a run that ends cleanly has no error.
  const m = batches([2]);
  const good = m.store.claim;
  m.store.claim = async (limit: number) => (m.limits.length === 0 ? good(limit) : ({ rows: [] } as unknown as Delivery[]));
  assert.deepEqual(await runNotifications(m.store, m.gateway, true, m.clock), { disabled: false, processed: 2, deferred: 0, error: "Notification claim failed" });
  const clean = batches([2]);
  assert.ok(!("error" in (await runNotifications(clean.store, clean.gateway, true, clean.clock))));
});
test("a claim that returns null reads as empty (H18)", async () => {
  const f = batches([]);
  f.store.claim = async (limit: number) => {
    f.limits.push(limit);
    return null as unknown as Delivery[];
  };
  assert.deepEqual(await runNotifications(f.store, f.gateway, true, f.clock), { disabled: false, processed: 0, deferred: 0 });
  assert.deepEqual(f.limits, [25]);
  const g = batches([2]);
  const claim = g.store.claim;
  g.store.claim = async (limit: number) => (g.limits.length === 0 ? claim(limit) : (g.limits.push(limit), null as unknown as Delivery[]));
  assert.deepEqual(await runNotifications(g.store, g.gateway, true, g.clock), { disabled: false, processed: 2, deferred: 0 });
  assert.deepEqual(g.limits, [25, 10]);
});
test("a receipt's age is read from the clock (H18)", async () => {
  const created = Date.parse("2026-11-11T09:00:00Z");
  for (const [hours, outcome] of [
    [1, { outcome: "retry", delaySeconds: 900 }],
    [22.9, { outcome: "retry", delaySeconds: 900 }],
    [23, { outcome: "unknown" }],
  ] as const) {
    const f = fixture({ ticket_id: "ticket", ticket_created_at: new Date(created).toISOString() });
    f.gateway.receipt = async () => null;
    await runNotifications(f.store, f.gateway, true, () => created + hours * 3600_000);
    assert.deepEqual(f.outcomes, [outcome], `${hours} h`);
  }
});
test("a clock that reads NaN or goes back behind the start ends the run, so it can never run on (H18)", async () => {
  for (const reads of [[1000, NaN, 0], [1000, 999], [1000, 1000, 0]]) {
    const f = batches("endless");
    let i = 0;
    const clock = () => reads[Math.min(i++, reads.length - 1)];
    const result = await runNotifications(f.store, f.gateway, true, clock);
    assert.ok(f.limits.length <= 2, JSON.stringify(reads));
    assert.equal(result.processed + (result.deferred ?? 0), f.outcomes.length, JSON.stringify(reads));
  }
});
test("a disabled sender never reads the clock or claims", async () => {
  const f = batches("endless");
  const result = await runNotifications(f.store, f.gateway, false, () => {
    throw Error("Must not read the clock");
  });
  assert.deepEqual(result, { disabled: true, processed: 0 });
  assert.deepEqual(f.limits, []);
});
test("the journal hears a deferred job as the outcome deferred, with no ticket and no delay (H21)", async () => {
  const bodies: unknown[] = [];
  const store = deliveryStore("https://journal.test", "service-key", async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  });
  await store.finish({ ...job, id: "d1", lease_id: "l1" }, { outcome: "deferred" });
  assert.deepEqual(bodies, [{ p_id: "d1", p_lease: "l1", p_outcome: "deferred", p_ticket: null, p_delay_seconds: 0 }]);
});

test("a report notice carries only its type and notification id, and the same ttl", () => {
  const payload = payloadFor({
    ...job,
    kind: "report_filed",
    title: "Board game night",
    actor_name: "Clara",
    series_id: SERIES,
    message_body: "something said in a chat",
  });
  assert.deepEqual(payload.data, { type: "report", notificationId: "1" });
  assert.deepEqual(Object.keys(payload.data).sort(), ["notificationId", "type"]);
  assert.equal(payload.ttl, 3600);
  assert.deepEqual({ title: payload.title, body: payload.body }, { title: "Resbite", body: "A new report is waiting." });
  assert.equal(JSON.stringify(payload).includes("Clara"), false);
  assert.equal(JSON.stringify(payload).includes("something said"), false);
  // payloadFor's checks still apply.
  assert.throws(() => payloadFor({ ...job, kind: "report_filed", plan_id: "bad" }));
  assert.throws(() => payloadFor({ ...job, kind: "report_filed", outbox_id: "x" }));
});
