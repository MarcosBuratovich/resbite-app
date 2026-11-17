export type AccountGate = "add-phone" | "accept-terms" | "about-you" | null;

/**
 * Where /account sends a signed-in account before its usual checks: a number first, then the current Terms of Use
 * (an approved account only: a suspended one sees its own screen), then a name.
 */
export function accountGate(i: {
  status: string;
  phoneVerified: boolean;
  termsNeeded: boolean;
  name: string | null;
  profileReady: boolean;
}): AccountGate {
  if (i.status !== "approved" && i.status !== "access_pending") return null;
  if (!i.phoneVerified) return "add-phone";
  if (i.status === "approved" && i.termsNeeded) return "accept-terms";
  if (!i.profileReady && !i.name) return "about-you";
  return null;
}

export const gateHref: Record<
  Exclude<AccountGate, null>,
  "/add-phone" | "/accept-terms" | "/about-you"
> = {
  "add-phone": "/add-phone",
  "accept-terms": "/accept-terms",
  "about-you": "/about-you",
};
