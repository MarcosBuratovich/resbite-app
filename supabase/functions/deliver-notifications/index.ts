import {
  deliveryStore,
  expoGateway,
} from "../_shared/notification-adapters.ts";
import { notificationHandler } from "./handler.ts";
// Explicit release gate: released by the owner on 28 October 2026, after the push migration went live.
// A deployment or environment variable alone cannot start delivering notifications; set this back to
// false and redeploy to stop delivery.
const DELIVERY_RELEASE_APPROVED = true;
Deno.serve(
  notificationHandler({
    secret: Deno.env.get("NOTIFICATION_WORKER_SECRET"),
    enabled:
      DELIVERY_RELEASE_APPROVED &&
      Deno.env.get("NOTIFICATION_DELIVERY_ENABLED") === "true",
    store: deliveryStore(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ),
    gateway: expoGateway(Deno.env.get("EXPO_ACCESS_TOKEN") ?? ""),
  }),
);
