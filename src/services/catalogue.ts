import entries from "../../content/activities.json";
import type { Activity } from "../domain/rules";
export const activities: Activity[] = entries;
export const artwork: Record<string, number> = {
  "coffee-together": require("../../assets/activities/coffee-together.png"),
  painting: require("../../assets/activities/painting.png"),
  "get-out-with-bikes": require("../../assets/activities/get-out-with-bikes.png"),
  "building-a-snowman": require("../../assets/activities/building-a-snowman.png"),
  bbq: require("../../assets/activities/bbq.png"),
  "wine-tasting": require("../../assets/activities/wine-tasting.png"),
  "spa-day": require("../../assets/activities/spa-day.png"),
  "book-club": require("../../assets/activities/book-club.png"),
};
export const categories = [
  "All",
  ...new Set(activities.map((a) => a.category)),
];
