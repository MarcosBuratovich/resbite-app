// The page server's two database calls (GI1). The publishable key can only call invitation_page; the secret key
// is used for one thing, signing a short-lived URL for an event's cover photo, and lives only on Vercel.
import { isLinkCode } from "./render.mjs";

const need = (name) => {
  const value = process.env[name];
  if (!value) throw Error(`${name} is not set`);
  return value;
};

/** Calls public.invitation_page(code). Malformed codes never reach the database. */
export async function readInvitationPage(code, fetchImpl = fetch) {
  if (!isLinkCode(code)) return { state: "inactive" };
  const url = need("SUPABASE_URL"),
    key = need("SUPABASE_PUBLISHABLE_KEY");
  const response = await fetchImpl(`${url}/rest/v1/rpc/invitation_page`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code }),
  });
  if (!response.ok) throw Error(`invitation_page ${response.status}`);
  const data = await response.json();
  return data && typeof data === "object" && typeof data.state === "string" ? data : { state: "inactive" };
}

/** Calls public.personal_invitation_page(code): the invitee's page data. Never returns the place or the full number. */
export async function readPersonalInvitation(code, fetchImpl = fetch) {
  if (!isLinkCode(code)) return { state: "inactive" };
  const url = need("SUPABASE_URL"),
    key = need("SUPABASE_PUBLISHABLE_KEY");
  const response = await fetchImpl(`${url}/rest/v1/rpc/personal_invitation_page`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code }),
  });
  if (!response.ok) throw Error(`personal_invitation_page ${response.status}`);
  const data = await response.json();
  return data && typeof data === "object" && typeof data.state === "string" ? data : { state: "inactive" };
}

/** A signed URL for a cover photo, valid for `expiresIn` seconds; null when the storage call fails. */
export async function signCoverUrl(path, expiresIn = 300, fetchImpl = fetch) {
  if (typeof path !== "string" || !/^[A-Za-z0-9/_.-]{1,300}$/.test(path) || path.includes("..")) return null;
  const url = need("SUPABASE_URL"),
    key = need("SUPABASE_SECRET_KEY");
  const response = await fetchImpl(`${url}/storage/v1/object/sign/plan-covers/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data?.signedURL === "string" ? `${url}/storage/v1${data.signedURL}` : null;
}
