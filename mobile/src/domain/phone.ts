import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export type PhoneResult = { ok: true; e164: string } | { ok: false; message: string };

export const INVALID_PHONE = "Enter a valid mobile number.";

// isPossible(), not isValid(): the UK fiction range (+44 7700 900xxx) is possible but not valid.
export function parsePhone(input: string, region: string): PhoneResult {
  const parsed = parsePhoneNumberFromString(input, region as never);
  if (!parsed || !parsed.isPossible()) return { ok: false, message: INVALID_PHONE };
  return { ok: true, e164: parsed.number };
}

export function deviceRegion(locale: string = Intl.DateTimeFormat().resolvedOptions().locale): string {
  const region = locale.split("-").slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
  return region ? region.toUpperCase() : "GB";
}

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164.startsWith("+") ? e164 : `+${e164}`)?.formatInternational() ?? e164;
}

export function phoneEnding(e164: string): string {
  return e164.replace(/\D/g, "").slice(-2);
}

export function phoneVerified(user: { phone?: string | null; phone_confirmed_at?: string | null } | null): boolean {
  return !!user && !!user.phone && !!user.phone_confirmed_at;
}

/** The same number, by its digits: `auth.users.phone` holds digits only, the app works in E.164. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");
  return digits(a) !== "" && digits(a) === digits(b);
}
