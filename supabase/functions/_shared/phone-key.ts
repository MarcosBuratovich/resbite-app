/** The phone key: the digits of a number, with an Argentine mobile's 549 + ten digits folded to 54 + those ten
 * digits. Everything else stays as its digits; empty input gives "". Same rule as private.phone_key in SQL. */
export function phoneKey(input: string | null | undefined): string {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.replace(/^549(\d{10})$/, "54$1");
}
