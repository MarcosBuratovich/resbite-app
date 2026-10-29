import assert from "node:assert/strict";
import test from "node:test";
import { COUNTRIES, countryByRegion, countryLabel, searchCountries } from "./countries";

test("the list is large, sorted by name and has no repeated region", () => {
  assert.ok(COUNTRIES.length >= 240);
  for (let i = 1; i < COUNTRIES.length; i++) {
    assert.ok(COUNTRIES[i - 1].name.localeCompare(COUNTRIES[i].name) <= 0, COUNTRIES[i].name);
  }
  assert.equal(new Set(COUNTRIES.map((c) => c.region)).size, COUNTRIES.length);
});

test("a country by region and its label", () => {
  const ar = countryByRegion("AR");
  assert.deepEqual(ar, { region: "AR", name: "Argentina", code: "54" });
  assert.equal(countryLabel(ar!), "Argentina +54");
  assert.equal(countryByRegion("ZZ"), undefined);
});

test("search matches name or code, trimmed and case-insensitive", () => {
  assert.equal(searchCountries("arg")[0].name, "Argentina");
  assert.equal(searchCountries("  ARG ")[0].name, "Argentina");
  assert.ok(searchCountries("+54").some((c) => c.region === "AR"));
  assert.ok(searchCountries("54").some((c) => c.region === "AR"));
  assert.equal(searchCountries("").length, COUNTRIES.length);
});

test("search ignores accents on both sides", () => {
  const rows: [string, string, string][] = [
    ["turkiye", "TR", "Türkiye"], ["cote", "CI", "Côte d’Ivoire"], ["curacao", "CW", "Curaçao"],
    ["sao tome", "ST", "São Tomé & Príncipe"], ["reunion", "RE", "Réunion"], ["aland", "AX", "Åland Islands"],
    ["Türkiye", "TR", "Türkiye"], ["CÔTE", "CI", "Côte d’Ivoire"],
  ];
  for (const [query, region, name] of rows) {
    const found = searchCountries(query).find((c) => c.region === region);
    assert.equal(found?.name, name, query);
  }
});
