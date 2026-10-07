import { createPhotoCleanupHandler } from "../_shared/profile-photo-cleanup.ts";
import { profilePhotoCleanupGateway } from "../_shared/profile-photo-cleanup-gateway.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
// Retention review AND isolated Auth/Storage race acceptance are required before
// changing this source gate. Deployment/environment variables cannot enable it.
const PHOTO_CLEANUP_RELEASE_APPROVED = false;
Deno.serve(createPhotoCleanupHandler(
  profilePhotoCleanupGateway(
    Deno.env.get("SUPABASE_URL") || "https://unconfigured.invalid",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ),
  PHOTO_CLEANUP_RELEASE_APPROVED && Deno.env.get("PROFILE_PHOTO_CLEANUP_ENABLED") === "true",
  Deno.env.get("PROFILE_PHOTO_CLEANUP_SECRET") || "",
));
