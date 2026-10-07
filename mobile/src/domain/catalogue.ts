import type { Activity } from "./rules";
import { validCategories } from "./categories";

export const artworkKeys = [
  "coffee-together",
  "painting",
  "get-out-with-bikes",
  "building-a-snowman",
  "bbq",
  "wine-tasting",
  "spa-day",
  "book-club",
  "picnic-in-the-park",
  "walk-and-talk",
  "board-game-night",
] as const;

/** Live copy must be complete and explicitly published; drafts never fill gaps. */
export function decodePublishedActivities(value: unknown): Activity[] {
  if (!Array.isArray(value))
    throw Error("The activity catalogue could not be read.");
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw Error("An activity could not be read.");
    const row = item as Record<string, unknown>;
    const text = (key: string, max: number) => {
      const entry = row[key];
      if (typeof entry !== "string" || !entry.trim() || entry.length > max)
        throw Error("An activity could not be read.");
      return entry;
    };
    const id = text("id", 120);
    if (row.published !== true || ids.has(id))
      throw Error("An activity is unavailable.");
    ids.add(id);
    const artworkKey = text("artwork_key", 120);
    if (!(artworkKeys as readonly string[]).includes(artworkKey))
      throw Error("This activity needs an app update.");
    if (
      !Array.isArray(row.tips) ||
      row.tips.length > 12 ||
      row.tips.some(
        (tip) => typeof tip !== "string" || !tip.trim() || tip.length > 1000,
      ) ||
      !Array.isArray(row.source_ids) ||
      row.source_ids.some((source) => typeof source !== "string") ||
      (row.duration_minutes !== null &&
        (!Number.isInteger(row.duration_minutes) ||
          Number(row.duration_minutes) < 1 ||
          Number(row.duration_minutes) > 1440))
    )
      throw Error("An activity could not be read.");
    const categories = row.categories;
    if (!validCategories(categories))
      throw Error("An activity could not be read.");
    return {
      id,
      title: text("title", 200),
      categories: [...categories],
      description: text("description", 6000),
      artwork: `${artworkKey}.png`,
      tips: row.tips as string[],
      sourceIds: row.source_ids as string[],
      durationMinutes: row.duration_minutes as number | null,
    };
  });
}
