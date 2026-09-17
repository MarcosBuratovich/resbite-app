import { readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";
const items = JSON.parse(
  await readFile(
    new URL("../content/activities.json", import.meta.url),
    "utf8",
  ),
);
const provenance = JSON.parse(
  await readFile(
    new URL("../content/asset-provenance.json", import.meta.url),
    "utf8",
  ),
);
assert.ok(items.length >= 8 && items.length <= 12);
assert.equal(new Set(items.map((x) => x.id)).size, items.length);
for (const item of items) {
  assert.ok(
    item.title &&
      item.description &&
      item.tips.length &&
      item.category &&
      item.sourceIds.length,
  );
  assert.equal(item.contentStatus, "editorial-draft");
  assert.ok(item.durationMinutes === null || item.durationMinutes > 0);
  await access(
    new URL("../assets/activities/" + item.artwork, import.meta.url),
  );
  assert.ok(
    provenance.activities.some(
      (p) => p.activityId === item.id && p.sourceSha256,
    ),
  );
}
console.log(
  `${items.length} complete draft activity/artwork pairs validated. Copy/category approval is still pending.`,
);
