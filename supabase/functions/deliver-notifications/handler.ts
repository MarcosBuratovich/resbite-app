import {
  runNotifications,
  type DeliveryStore,
  type PushGateway,
} from "../_shared/notification-engine.ts";
export function notificationHandler(config: {
  secret?: string;
  enabled?: boolean;
  store: DeliveryStore;
  gateway: PushGateway;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const supplied = request.headers.get("authorization");
    if (
      !config.secret ||
      config.secret.length < 32 ||
      supplied !== `Bearer ${config.secret}`
    )
      return new Response(null, { status: 401 });
    try {
      return Response.json(
        await runNotifications(
          config.store,
          config.gateway,
          config.enabled === true,
        ),
      );
    } catch {
      return Response.json(
        { error: "Notification processing incomplete" },
        { status: 503 },
      );
    }
  };
}
