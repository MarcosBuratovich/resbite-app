import { SAFETY_COPY, supportAddress } from "./safetyCopy";

/** Data & privacy's Contact topic (G-N10): the line, the address as written, and the address as a `mailto:` link. */
export type SupportContact = { address: string; line: string; mailto: string };

/**
 * The Contact topic for the build's `EXPO_PUBLIC_SUPPORT_ADDRESS`, or null while it is unset or not an address
 * (`supportAddress`), so the topic is never shown empty or with a broken link (challenge N9). In the `mailto:` link a
 * `%`, `?` or `#` in the address is escaped, so it can't start an escape, a query or a fragment.
 */
export function supportContact(env: string | undefined): SupportContact | null {
  const address = supportAddress(env);
  if (!address) return null;
  return {
    address,
    line: SAFETY_COPY.contact(address),
    mailto: `mailto:${address.replace(/[%?#]/g, encodeURIComponent)}`,
  };
}
