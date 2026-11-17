import { createPhotoCleanupHandler } from "../_shared/profile-photo-cleanup.ts";
import { PLAN_COVERS, PROFILE_PHOTOS, profilePhotoCleanupGateway } from "../_shared/profile-photo-cleanup-gateway.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
// Retention review AND isolated Auth/Storage race acceptance are required before
// changing this source gate. Deployment/environment variables cannot enable it.
// The retention review is done: D-8 is adopted by AS-D8. The hosted race acceptance
// is rollout step R6, behind PROFILE_PHOTO_CLEANUP_ENABLED. This gate flips only in
// an owner-approved commit at rollout step R5.
const PHOTO_CLEANUP_RELEASE_APPROVED = false;
const serviceUrl = Deno.env.get("SUPABASE_URL") || "https://unconfigured.invalid";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Profile photos first, then plan covers: one deploy, one secret, one schedule.
Deno.serve(createPhotoCleanupHandler(
  [
    profilePhotoCleanupGateway(serviceUrl, serviceKey, fetch, PROFILE_PHOTOS),
    profilePhotoCleanupGateway(serviceUrl, serviceKey, fetch, PLAN_COVERS),
  ],
  PHOTO_CLEANUP_RELEASE_APPROVED && Deno.env.get("PROFILE_PHOTO_CLEANUP_ENABLED") === "true",
  Deno.env.get("PROFILE_PHOTO_CLEANUP_SECRET") || "",
));
