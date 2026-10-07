import entries from "../../content/activities.json";
import additions from "../../content/activity-additions.json";
import overlay from "../../content/activity-categories.json";
import type { Activity } from "../domain/rules";
import { validCategories } from "../domain/categories";
// Bundled approved snapshots serve Preview and historical plan labels only.
// Signed-in discovery and new plans still require current server publication.
// Categories come from their own approved overlay (CE-D7); the snapshots stay unchanged.
const approvedCategories = new Map<string, unknown>(
  overlay.activities.map((entry) => [entry.id, entry.categories]),
);
export const activities: Activity[] = [...entries, ...additions].map(
  ({ id, title, description, tips, durationMinutes, artwork, sourceIds }) => {
    const categories = approvedCategories.get(id);
    if (!validCategories(categories))
      throw Error(`Approved categories missing for ${id}.`);
    return { id, title, description, tips, durationMinutes, artwork, sourceIds, categories };
  },
);
export const artwork: Record<string, number> = {
  "coffee-together": require("../../assets/activities/coffee-together.png"),
  painting: require("../../assets/activities/painting.png"),
  "get-out-with-bikes": require("../../assets/activities/get-out-with-bikes.png"),
  "building-a-snowman": require("../../assets/activities/building-a-snowman.png"),
  bbq: require("../../assets/activities/bbq.png"),
  "wine-tasting": require("../../assets/activities/wine-tasting.png"),
  "spa-day": require("../../assets/activities/spa-day.png"),
  "book-club": require("../../assets/activities/book-club.png"),
  "picnic-in-the-park": require("../../assets/activities/picnic-in-the-park.png"),
  "walk-and-talk": require("../../assets/activities/walk-and-talk.png"),
  "board-game-night": require("../../assets/activities/board-game-night.png"),
};
export function activityArtwork(activity: Activity) {
  return artwork[activity.artwork.replace(/\.png$/, "")];
}
