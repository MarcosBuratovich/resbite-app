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
};
export type Outcome =
  | "ticket"
  | "received"
  | "retry"
  | "failed"
  | "invalid"
  | "unknown"
  | "suppressed";
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
export function payloadFor(job: Delivery) {
  if (
    !UUID.test(job.plan_id) ||
    !/^\d+$/.test(job.outbox_id) ||
    !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(job.token)
  ) {
    throw new GatewayFailure("failed");
  }
  return {
    to: job.token,
    title: "Resbite",
    body: "You have an update. Open Resbite to see it.",
    data: {
      type: "plan_update",
      planId: job.plan_id,
      notificationId: job.outbox_id,
    },
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
export async function runNotifications(
  store: DeliveryStore,
  gateway: PushGateway,
  enabled = false,
  now = Date.now(),
) {
  if (!enabled) return { disabled: true, processed: 0 };
  const jobs = await store.claim(25);
  let processed = 0;
  for (const job of jobs) {
    if (!(await store.validate(job))) {
      await store.finish(job, { outcome: "suppressed" });
      processed++;
      continue;
    }
    let result: Result;
    // Checking an existing ticket never sends a second notification.
    try {
      if (job.ticket_id) {
        const receipt = await gateway.receipt(job.ticket_id);
        const age = now - Date.parse(job.ticket_created_at ?? "");
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
    processed++;
  }
  return { disabled: false, processed };
}
