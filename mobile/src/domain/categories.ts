// The seven approved categories (owner decision CE-D5). Keys are stored on the
// server; labels are display copy. Each event or idea has one or two (CE-D6).
export const categoryKeys = [
  "creative",
  "intellectual",
  "mindful",
  "natural",
  "physical",
  "community",
  "uplifting",
] as const;
export type CategoryKey = (typeof categoryKeys)[number];

export const categoryLabels: Record<CategoryKey, string> = {
  creative: "Creative",
  intellectual: "Intellectual",
  mindful: "Mindful",
  natural: "Natural",
  physical: "Physical",
  community: "Community",
  uplifting: "Uplifting",
};

export function isCategoryKey(value: unknown): value is CategoryKey {
  return (
    typeof value === "string" &&
    (categoryKeys as readonly string[]).includes(value)
  );
}

/** One or two distinct approved keys, matching `private.valid_categories`. */
export function validCategories(value: unknown): value is CategoryKey[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 2 &&
    value.every(isCategoryKey) &&
    new Set(value).size === value.length
  );
}

/** Tile toggle: removes a chosen key, adds a new one, refuses a third. */
export function toggleCategory(
  selected: CategoryKey[],
  key: CategoryKey,
): CategoryKey[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  return selected.length >= 2 ? selected : [...selected, key];
}
