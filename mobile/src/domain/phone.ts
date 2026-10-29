import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import metadata from "libphonenumber-js/min/metadata";

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
  return parsePhoneNumberFromString(phoneSendForm(e164))?.formatInternational() ?? e164;
}

/** The phone key: the digits, with an Argentine mobile's `549` + ten digits folded to `54` + those ten. */
export function phoneKey(input: string | null | undefined): string {
  const digits = (input ?? "").replace(/\D/g, "");
  return /^549\d{10}$/.test(digits) ? `54${digits.slice(3)}` : digits;
}

/** The E.164 form to send to: the key, with the Argentine mobile 9 put back. Takes a key or any number. */
export function phoneSendForm(input: string): string {
  const key = phoneKey(input);
  return /^54\d{10}$/.test(key) ? `+549${key.slice(2)}` : `+${key}`;
}

/** The main country of a calling code ("1" gives US), or null for an unknown code. */
export function regionForCallingCode(code: string): string | null {
  return (metadata as { country_calling_codes: Record<string, string[]> }).country_calling_codes[code]?.[0] ?? null;
}

/** The number's own country, else (fiction ranges have none) its calling code's main country. */
export function regionOf(e164: string): string | null {
  const parsed = parsePhoneNumberFromString(phoneSendForm(e164));
  if (!parsed) return null;
  return parsed.country ?? regionForCallingCode(parsed.countryCallingCode);
}

export function phoneEnding(e164: string): string {
  return e164.replace(/\D/g, "").slice(-2);
}

export function phoneVerified(user: { phone?: string | null; phone_confirmed_at?: string | null } | null): boolean {
  return !!user && !!user.phone && !!user.phone_confirmed_at;
}

/** The same number, by its phone key: `auth.users.phone` holds digits only, the app works in E.164. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  return phoneKey(a) !== "" && phoneKey(a) === phoneKey(b);
}
