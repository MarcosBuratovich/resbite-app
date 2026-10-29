import data from "./countries.json";

export type Country = { region: string; name: string; code: string };

/** Every country with a calling code, sorted by English name. Generated: see scripts/generate-countries.mjs. */
export const COUNTRIES: readonly Country[] = data;

export function countryByRegion(region: string): Country | undefined {
  return COUNTRIES.find((c) => c.region === region);
}

export function countryLabel(c: Country): string {
  return `${c.name} +${c.code}`;
}

/** Lower case without accents (combining marks dropped): "cote" finds "Côte d’Ivoire", "turkiye" "Türkiye". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Countries whose name or calling code contains the query (case- and accent-insensitive, trimmed, a leading +
 * ignored).
 */
export function searchCountries(query: string): Country[] {
  const q = fold(query.trim());
  if (!q) return [...COUNTRIES];
  const digits = q.replace(/^\+/, "");
  return COUNTRIES.filter((c) => fold(c.name).includes(q) || (digits !== "" && c.code.includes(digits)));
}
