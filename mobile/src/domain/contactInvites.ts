import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { formatPhone, parsePhone } from "./phone";

export type ContactNumber = {
  key: string;
  name: string;
  e164: string;
  /** Calling code, e.g. "44". */
  country: string;
  label: string;
};

export type ContactRow = { fullName?: string | null; phones: { number: string }[] };

/** One entry per distinct E.164 number (first contact wins); numbers that don't parse count as skipped. */
export function contactNumbers(rows: ContactRow[], region: string): { numbers: ContactNumber[]; skipped: number } {
  const seen = new Map<string, ContactNumber>();
  let skipped = 0;
  for (const row of rows) {
    const fullName = row.fullName?.trim() ?? "";
    for (const phone of row.phones) {
      const parsed = parsePhone(phone.number, region);
      if (!parsed.ok) {
        skipped += 1;
        continue;
      }
      if (seen.has(parsed.e164)) continue;
      const label = formatPhone(parsed.e164);
      seen.set(parsed.e164, {
        key: parsed.e164,
        name: fullName || label,
        e164: parsed.e164,
        country: parsePhoneNumberFromString(parsed.e164)?.countryCallingCode ?? "",
        label,
      });
    }
  }
  const numbers = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.e164.localeCompare(b.e164));
  return { numbers, skipped };
}

/** The region of the host's own verified phone (digits only), else the fallback. */
export function hostRegion(userPhone: string | null | undefined, fallback: string): string {
  const digits = (userPhone ?? "").replace(/\D/g, "");
  if (!digits) return fallback;
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  if (!parsed) return fallback;
  // Fiction-range numbers (07700 900xxx) are possible but have no country: use the code's main country.
  if (parsed.country) return parsed.country;
  const code = parsed.countryCallingCode;
  return getCountries().find((c) => getCountryCallingCode(c) === code) ?? fallback;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url without padding (16 bytes give 22 characters). No Buffer: this runs in React Native. */
export function newInviteCode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(bytes.length - i, 3) + 1;
    for (let c = 0; c < chars; c++) out += ALPHABET[(chunk >> (18 - 6 * c)) & 63];
  }
  return out;
}

export function personalLink(origin: string, code: string): string {
  return `${origin}/i/${code}`;
}

export function inviteMessage(a: { host: string; title: string; when: string; link: string }): string {
  return `${a.host} invited you to ${a.title}, ${a.when}. Reply here: ${a.link}`;
}

export function whatsappUrl(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function smsUrl(e164: string, text: string, platform: string = "ios"): string {
  return `sms:${e164}${platform === "ios" ? "&" : "?"}body=${encodeURIComponent(text)}`;
}
