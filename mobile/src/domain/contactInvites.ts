import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { formatPhone, parsePhone, phoneKey, phoneSendForm, regionOf } from "./phone";

export type ContactNumber = {
  /** The phone key: what two spellings of one number share. */
  key: string;
  name: string;
  /** The send form: the number to dial, with an Argentine mobile's 9. */
  e164: string;
  /** The contact this number belongs to: the first kept number of its address-book row. */
  contact: string;
  /** Calling code, e.g. "44". */
  country: string;
  label: string;
};

export type ContactRow = { fullName?: string | null; phones: { number: string }[] };

/** One entry per distinct phone key (first contact wins); numbers that don't parse count as skipped. */
export function contactNumbers(rows: ContactRow[], region: string): { numbers: ContactNumber[]; skipped: number } {
  const seen = new Map<string, ContactNumber>();
  let skipped = 0;
  for (const row of rows) {
    const fullName = row.fullName?.trim() ?? "";
    let contact = "";
    for (const phone of row.phones) {
      const parsed = parsePhone(phone.number, region);
      if (!parsed.ok) {
        skipped += 1;
        continue;
      }
      const e164 = phoneSendForm(parsed.e164);
      const key = phoneKey(e164);
      if (seen.has(key)) continue;
      const label = formatPhone(e164);
      contact = contact || e164;
      seen.set(key, {
        key,
        name: fullName || label,
        e164,
        contact,
        country: parsePhoneNumberFromString(e164)?.countryCallingCode ?? "",
        label,
      });
    }
  }
  const numbers = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.e164.localeCompare(b.e164));
  return { numbers, skipped };
}

/** One entry per contact, in the order its first number appears; a contact may hold several numbers. */
export function groupContacts(numbers: ContactNumber[]): { contact: string; name: string; numbers: ContactNumber[] }[] {
  const groups = new Map<string, { contact: string; name: string; numbers: ContactNumber[] }>();
  for (const n of numbers) {
    const g = groups.get(n.contact);
    if (g) g.numbers.push(n);
    else groups.set(n.contact, { contact: n.contact, name: n.name, numbers: [n] });
  }
  return [...groups.values()];
}

/** The connections to invite: those picked, less anyone already on the resbite (who would only come back "already"). */
export function usersToInvite(chosenUsers: ReadonlySet<string>, invitedUsers: ReadonlySet<string>): { user: string }[] {
  return [...chosenUsers].filter((user) => !invitedUsers.has(user)).map((user) => ({ user }));
}

/**
 * What Invite people sends: one phone item per number key (the first pick wins: a typed number equal to a contact's
 * other number has a pick of its own, and two items with one key would land on one invitation, leaving the first
 * link shown dead), each with the code `codeFor` gives it; and the connections, apart, as they go in calls of their
 * own after the numbers. `numbers` are the picks the phone items were made from, in the same order.
 */
export function inviteItems(
  selected: ContactNumber[],
  chosenUsers: ReadonlySet<string>,
  invitedUsers: ReadonlySet<string>,
  codeFor: (n: ContactNumber) => string,
): { numbers: ContactNumber[]; phones: { phone: string; country: string; code: string }[]; users: { user: string }[] } {
  const seen = new Set<string>();
  const numbers = selected.filter((n) => !seen.has(n.key) && !!seen.add(n.key));
  return {
    numbers,
    phones: numbers.map((n) => ({ phone: n.e164.replace(/\D/g, ""), country: n.country, code: codeFor(n) })),
    users: usersToInvite(chosenUsers, invitedUsers),
  };
}

/** The region of the host's own verified phone (digits only), else the fallback. */
export function hostRegion(userPhone: string | null | undefined, fallback: string): string {
  return (userPhone ? regionOf(userPhone) : null) ?? fallback;
}

/**
 * The stored entry for a number and the key it is saved under: the exact send form, else one saved under another
 * spelling of the same key (so forgetting it removes that key).
 */
export function storedEntry<T>(stored: Record<string, T>, e164: string): { key: string; value: T } | undefined {
  if (stored[e164] !== undefined) return { key: e164, value: stored[e164] };
  const key = phoneKey(e164);
  const found = Object.entries(stored).find(([k]) => phoneKey(k) === key);
  return found ? { key: found[0], value: found[1] } : undefined;
}

/** The stored entry for a number: the exact send form, else one saved under another spelling of the same key. */
export function storedFor<T>(stored: Record<string, T>, e164: string): T | undefined {
  return storedEntry(stored, e164)?.value;
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

/** Opens the WhatsApp app itself (wa.me is a web page that opens in the browser when the app is missing). */
export function whatsappAppUrl(e164: string, text: string): string {
  return `whatsapp://send?phone=${e164.replace(/\D/g, "")}&text=${encodeURIComponent(text)}`;
}

export function smsUrl(e164: string, text: string, platform: string = "ios"): string {
  return `sms:${e164}${platform === "ios" ? "&" : "?"}body=${encodeURIComponent(text)}`;
}

/** The two ways to send a personal link, the one used last first (WhatsApp when neither has been used). */
export function sendOrder(last: "whatsapp" | "messages" | null | undefined): ["whatsapp", "messages"] | ["messages", "whatsapp"] {
  return last === "messages" ? ["messages", "whatsapp"] : ["whatsapp", "messages"];
}
