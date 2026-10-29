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

/** Countries whose name or calling code contains the query (case-insensitive, trimmed, a leading + ignored). */
export function searchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...COUNTRIES];
  const digits = q.replace(/^\+/, "");
  return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || (digits !== "" && c.code.includes(digits)));
}
