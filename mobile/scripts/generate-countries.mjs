// Generates src/domain/countries.json: every region libphonenumber-js knows, with its English name and calling code.
// Regenerate (from mobile/) after upgrading libphonenumber-js:  node scripts/generate-countries.mjs
import { writeFileSync } from "node:fs";
import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";

const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries()
  .map((region) => ({ region, name: names.of(region), code: getCountryCallingCode(region) }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(new URL("../src/domain/countries.json", import.meta.url), `${JSON.stringify(countries, null, 2)}\n`);
console.log(`wrote ${countries.length} countries`);
