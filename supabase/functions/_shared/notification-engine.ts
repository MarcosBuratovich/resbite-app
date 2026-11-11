import { notificationCopy } from "./notification-copy.ts";

/** Tokens and provider responses must never be logged. A receipt is not proof of reading. */
export type Delivery = {
  id: string;
  lease_id: string;
  outbox_id: string;
  plan_id: string;
  recipient_id: string;
  token: string;
  attempts: number;
  ticket_id: string | null;
  ticket_created_at: string | null;
  /** UX2 wording inputs from claim_notification_deliveries; never the place, note or descriptions. */
  kind?: string | null;
  detail?: string | null;
  title?: string | null;
  starts_at?: string | null;
  time_zone?: string | null;
  actor_name?: string | null;
  /** For an rsvp only: the first name of whoever brought the person who answered (circles of trust); else null. */
  brought_by_name?: string | null;
  /** Chat (chat core): the series whose chat the notice opens, as a uuid. A chat push without a valid one is never sent. */
  series_id?: string | null;
  /** Chat: the message the notice is about. It stays on the server: the push never carries it. */
  message_id?: string | null;
  /** Chat: the message's words, for chat_message and announcement only. The copy cuts them at 120 characters. */
  message_body?: string | null;
  /** Chat: an announcement's audience ('going' or 'everyone'); else null. It stays on the server. */
  audience?: string | null;
};
export type Outcome =
  | "ticket"
  | "received"
  | "retry"
  | "failed"
  | "invalid"
  | "unknown"
  | "suppressed"
  /** Not started before the run's budget ran out: pending again at once, with the claim's attempt given back (H21). */
  | "deferred";
export type Result = {
  outcome: Outcome;
  ticket?: string;
  delaySeconds?: number;
};
export interface DeliveryStore {
  claim(limit: number): Promise<Delivery[]>;
  finish(delivery: Delivery, result: Result): Promise<void>;
  validate(delivery: Delivery): Promise<boolean>;
}
export type ProviderResult =
  | { status: "ok"; id?: string }
  | { status: "error"; details?: { error?: string } };
export interface PushGateway {
  send(payload: ReturnType<typeof payloadFor>): Promise<ProviderResult>;
  receipt(id: string): Promise<ProviderResult | null>;
}
export class GatewayFailure extends Error {
  constructor(public readonly disposition: "retry" | "failed" | "unknown") {
    super(disposition);
  }
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isChat = (kind: string | null | undefined) =>
  kind === "chat_message" || kind === "announcement";
function dataFor(job: Delivery) {
  // A chat notice opens the chat of its series; the app reads the chat through the server before showing it.
  if (isChat(job.kind))
    return {
      type: "chat" as const,
      seriesId: job.series_id as string,
      planId: job.plan_id,
      notificationId: job.outbox_id,
    };
  return {
    type:
      job.kind === "connection_request" || job.kind === "connection_accepted"
        ? ("connection" as const)
        : ("plan_update" as const),
    planId: job.plan_id,
    notificationId: job.outbox_id,
  };
}
export function payloadFor(job: Delivery) {
  if (
    !UUID.test(job.plan_id) ||
    !/^\d+$/.test(job.outbox_id) ||
    !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(job.token) ||
    (isChat(job.kind) &&
      (typeof job.series_id !== "string" || !UUID.test(job.series_id)))
  ) {
    throw new GatewayFailure("failed");
  }
  return {
    to: job.token,
    ...notificationCopy(job),
    data: dataFor(job),
    ttl: 3600,
  };
}
const backoff = (attempt: number) =>
  Math.min(3600, 30 * 2 ** Math.min(attempt, 7));
function providerOutcome(value: ProviderResult, receipt: boolean): Result {
  if (value.status === "ok")
    return receipt
      ? { outcome: "received" }
      : typeof value.id === "string" && value.id.length > 0
        ? { outcome: "ticket", ticket: value.id, delaySeconds: 900 }
        : { outcome: "unknown" };
  const error = value.details?.error;
  if (error === "DeviceNotRegistered") return { outcome: "invalid" };
  if (error === "MessageRateExceeded") return { outcome: "retry" };
  return { outcome: "failed" };
}
/** A claim's answer: null reads as empty; anything else that is not a list is an error. */
function claimed(value: Delivery[] | null | undefined): Delivery[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Notification claim malformed");
  return value;
}
/**
 * One run of the sender, sized to fit under its caller's 10 s timeout (K-B3.3, H3, H18, H21). The first claim takes
 * 25; later claims take 10, and none starts once `budgetMs` (5 s) has passed since the start. No send or receipt check
 * starts after that either: each claimed job not yet started is finished as `deferred`, which the journal returns to
 * pending at once with its attempt given back, so the next run claims it again and none is lost. `deferred` counts
 * them. A claim that fails after the first batch ends the run with what it did and a short `error`; only a failed
 * first claim is thrown (the worker's 503).
 */
export async function runNotifications(
  store: DeliveryStore,
  gateway: PushGateway,
  enabled = false,
  clock: () => number = Date.now,
  budgetMs = 5_000,
) {
  if (!enabled) return { disabled: true, processed: 0 };
  const start = clock();
  // Spent unless the time since the start is known and under budget: a clock that reads NaN, or steps back behind
  // the start (a wall-clock correction), ends the run instead of stretching it.
  const spent = () => {
    const elapsed = clock() - start;
    return !(elapsed >= 0 && elapsed < budgetMs);
  };
  let processed = 0;
  let deferred = 0;
  let error: string | undefined;
  for (let first = true; first || !spent(); first = false) {
    let jobs: Delivery[];
    try {
      jobs = claimed(await store.claim(first ? 25 : 10));
    } catch (failure) {
      if (first) throw failure;
      // A fixed reason: what the failure carried (a provider or journal reply) is never echoed.
      error = "Notification claim failed";
      break;
    }
    if (jobs.length === 0) break;
    for (const job of jobs) {
      if (spent()) {
        // Never started: back to the queue as it was (a ticket job keeps its ticket), for the next run.
        await store.finish(job, { outcome: "deferred" });
        deferred++;
        continue;
      }
      await deliver(store, gateway, job, clock);
      processed++;
    }
  }
  return error === undefined
    ? { disabled: false, processed, deferred }
    : { disabled: false, processed, deferred, error };
}
async function deliver(
  store: DeliveryStore,
  gateway: PushGateway,
  job: Delivery,
  clock: () => number,
) {
  if (!(await store.validate(job))) {
    await store.finish(job, { outcome: "suppressed" });
    return;
  }
  let result: Result;
  // Checking an existing ticket never sends a second notification.
  try {
    if (job.ticket_id) {
      const receipt = await gateway.receipt(job.ticket_id);
      const age = clock() - Date.parse(job.ticket_created_at ?? "");
      result = receipt
        ? providerOutcome(receipt, true)
        : !Number.isFinite(age) || age >= 23 * 3600_000
          ? { outcome: "unknown" }
          : { outcome: "retry", delaySeconds: 900 };
    } else {
      result = providerOutcome(await gateway.send(payloadFor(job)), false);
    }
  } catch (error) {
    // A lost HTTP reply may already have sent the push. Do not blindly duplicate it.
    result = {
      outcome: job.ticket_id
        ? "retry"
        : error instanceof GatewayFailure
          ? error.disposition
          : "unknown",
    };
  }
  if (result.outcome === "retry") {
    if (job.attempts >= 8)
      result = { outcome: job.ticket_id ? "unknown" : "failed" };
    else result.delaySeconds ??= backoff(job.attempts);
  }
  // Never catch a failed journal write and treat it as provider failure.
  await store.finish(job, result);
}
