import {
  GatewayFailure,
  type Delivery,
  type DeliveryStore,
  type PushGateway,
  type ProviderResult,
  type Result,
} from "./notification-engine.ts";
export function expoGateway(
  accessToken: string,
  request: typeof fetch = fetch,
): PushGateway {
  async function post(path: string, payload: unknown) {
    let response: Response;
    try {
      response = await request(`https://exp.host/--/api/v2/push/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new GatewayFailure("unknown");
    }
    if (!response.ok)
      throw new GatewayFailure(
        response.status === 429 || response.status >= 500 ? "retry" : "failed",
      );
    try {
      return await response.json();
    } catch {
      throw new GatewayFailure("unknown");
    }
  }
  function validate(value: unknown): ProviderResult {
    if (
      !value ||
      typeof value !== "object" ||
      !("status" in value) ||
      !["ok", "error"].includes(String(value.status))
    )
      throw new GatewayFailure("unknown");
    return value as ProviderResult;
  }
  return {
    async send(payload) {
      return validate((await post("send", payload)).data);
    },
    async receipt(id) {
      const body = await post("getReceipts", { ids: [id] });
      if (
        !body.data ||
        typeof body.data !== "object" ||
        Array.isArray(body.data)
      )
        throw new GatewayFailure("unknown");
      return body.data[id] ? validate(body.data[id]) : null;
    },
  };
}
export function deliveryStore(
  url: string,
  serviceKey: string,
  request: typeof fetch = fetch,
): DeliveryStore {
  async function rpc(name: string, payload: unknown) {
    const response = await request(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Notification journal unavailable");
    return response.status === 204 ? null : response.json();
  }
  return {
    validate: (job: Delivery) =>
      rpc("validate_notification_delivery", {
        p_id: job.id,
        p_lease: job.lease_id,
      }) as Promise<boolean>,
    claim: (limit: number) =>
      rpc("claim_notification_deliveries", { p_limit: limit }) as Promise<
        Delivery[]
      >,
    async finish(job: Delivery, result: Result) {
      await rpc("finish_notification_delivery", {
        p_id: job.id,
        p_lease: job.lease_id,
        p_outcome: result.outcome,
        p_ticket: result.ticket ?? null,
        p_delay_seconds: result.delaySeconds ?? 0,
      });
    },
  };
}
