import test from "node:test";
import assert from "node:assert/strict";
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
