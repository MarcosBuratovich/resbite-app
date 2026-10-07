import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryPalette } from "../design/tokens.ts";
import {
  categoryKeys,
  categoryLabels,
  isCategoryKey,
  toggleCategory,
  validCategories,
} from "./categories.ts";

test("the seven approved categories keep their order and labels", () => {
  assert.deepEqual(
    [...categoryKeys],
    ["creative", "intellectual", "mindful", "natural", "physical", "community", "uplifting"],
  );
  assert.deepEqual(
    categoryKeys.map((key) => categoryLabels[key]),
    ["Creative", "Intellectual", "Mindful", "Natural", "Physical", "Community", "Uplifting"],
  );
  assert.equal(isCategoryKey("community"), true);
  assert.equal(isCategoryKey("Community"), false);
  assert.equal(isCategoryKey("wellness"), false);
});

test("an event or idea has one or two distinct approved categories", () => {
  assert.equal(validCategories(["creative"]), true);
  assert.equal(validCategories(["creative", "mindful"]), true);
  for (const bad of [
    [],
    ["creative", "mindful", "natural"],
    ["creative", "creative"],
    ["wellness"],
    ["creative", null],
    "creative",
    null,
    undefined,
  ])
    assert.equal(validCategories(bad), false, JSON.stringify(bad));
});

test("tapping a third category is refused instead of replacing a choice", () => {
  assert.deepEqual(toggleCategory([], "natural"), ["natural"]);
  assert.deepEqual(toggleCategory(["natural"], "community"), ["natural", "community"]);
  assert.deepEqual(toggleCategory(["natural", "community"], "creative"), ["natural", "community"]);
  assert.deepEqual(toggleCategory(["natural", "community"], "natural"), ["community"]);
});

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("each category ink stays readable on its tint and on white", () => {
  for (const key of categoryKeys) {
    const { tint, ink } = categoryPalette[key];
    assert.ok(contrast(tint, ink) >= 4.5, `${key} on tint`);
    assert.ok(contrast("#FFFFFF", ink) >= 4.5, `${key} on white`);
  }
});

test("the bundled category overlay matches the migration that publishes it", async () => {
  const overlay = JSON.parse(
    await readFile(new URL("../../content/activity-categories.json", import.meta.url), "utf8"),
  );
  const sql = await readFile(
    new URL("../../../supabase/migrations/20261007150000_custom_events.sql", import.meta.url),
    "utf8",
  );
  const published = [...sql.matchAll(/\('([a-z-]+)', array\[([^\]]+)\]\)/g)].map(
    ([, id, keys]) => ({
      id,
      categories: [...keys.matchAll(/'([a-z]+)'/g)].map((m) => m[1]),
    }),
  );
  assert.equal(published.length, 11);
  assert.deepEqual(published, overlay.activities);
  for (const entry of overlay.activities) assert.ok(validCategories(entry.categories), entry.id);
});
