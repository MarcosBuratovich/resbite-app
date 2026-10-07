import entries from "../../content/activities.json";
import additions from "../../content/activity-additions.json";
import type { Activity } from "../domain/rules";
// Bundled approved snapshots serve Preview and historical plan labels only.
// Signed-in discovery and new plans still require current server publication.
export const activities: Activity[] = [...entries, ...additions];
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
export const categories = [
  "All",
  ...new Set(activities.map((a) => a.category)),
];
export function activityArtwork(activity: Activity) {
  return artwork[activity.artwork.replace(/\.png$/, "")];
}
