export type AccountGate = "add-phone" | "about-you" | null;

/** Where /account sends a signed-in account before its usual checks: a number first, then a name. */
export function accountGate(i: {
  status: string;
  phoneVerified: boolean;
  name: string | null;
  profileReady: boolean;
}): AccountGate {
  if (i.status !== "approved" && i.status !== "access_pending") return null;
  if (!i.phoneVerified) return "add-phone";
  if (!i.profileReady && !i.name) return "about-you";
  return null;
}
