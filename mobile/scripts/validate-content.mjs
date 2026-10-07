import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const manifestBytes = await readFile(
  new URL("../content/activities.json", import.meta.url),
);
const provenanceBytes = await readFile(
  new URL("../content/asset-provenance.json", import.meta.url),
);
const items = JSON.parse(manifestBytes.toString("utf8"));
const provenance = JSON.parse(provenanceBytes.toString("utf8"));
const approval = JSON.parse(
  await readFile(
    new URL("../content/catalogue-approval.json", import.meta.url),
    "utf8",
  ),
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
assert.ok(items.length >= 8 && items.length <= 12);
assert.equal(new Set(items.map((x) => x.id)).size, items.length);
const artwork = [];
for (const item of items) {
  assert.ok(
    item.title &&
      item.description &&
      item.tips.length &&
      item.category &&
      item.sourceIds.length,
  );
  // These files are the archived review input; approval is recorded separately.
  assert.equal(item.contentStatus, "editorial-draft");
  assert.equal(item.categoryStatus, "editorial-assignment-for-review");
  assert.ok(item.durationMinutes === null || item.durationMinutes > 0);
  assert.match(item.artwork, /^[a-z0-9-]+\.png$/);
  const imageBytes = await readFile(
    new URL("../assets/activities/" + item.artwork, import.meta.url),
  );
  artwork.push({
    activityId: item.id,
    path: "mobile/assets/activities/" + item.artwork,
    sha256: sha256(imageBytes),
  });
  assert.ok(
    provenance.activities.some(
      (p) => p.activityId === item.id && p.sourceSha256,
    ),
  );
}
const scope = {
  manifestSha256: sha256(manifestBytes),
  provenanceSha256: sha256(provenanceBytes),
  artwork,
};
assert.equal(approval.schemaVersion, 1);
assert.equal(approval.status, "approved-for-owner-only-beta");
assert.equal(approval.approvedOn, "2026-09-24");
assert.equal(approval.approvedBy, "owner");
assert.equal(
  approval.manifestSha256,
  scope.manifestSha256,
  "Activity snapshot changed; approval needs review.",
);
assert.equal(
  approval.provenanceSha256,
  scope.provenanceSha256,
  "Provenance snapshot changed; approval needs review.",
);
assert.deepEqual(
  approval.artwork,
  artwork,
  "Artwork changed; approval needs review.",
);
assert.equal(
  approval.scopeSha256,
  sha256(JSON.stringify(canonical(scope))),
  "Approval does not match the complete review scope.",
);
assert.deepEqual(
  approval.approvedActivityIds,
  items.map((item) => item.id),
);
assert.deepEqual(approval.approvedFields, [
  "title",
  "description",
  "tips",
  "artwork",
  "category",
  "durationMinutes",
]);
assert.equal(approval.categoryTreatment.status, "temporary-discovery-filters");
assert.deepEqual(approval.categoryTreatment.labels, [
  ...new Set(items.map((item) => item.category)),
]);
assert.equal(approval.categoryTreatment.canonicalTaxonomyApproved, false);
assert.equal(
  approval.categoryTreatment.wellnessAssignmentsOrScoringApproved,
  false,
);
assert.equal(
  approval.durationTreatment.paintingSuggestedMinutes,
  items.find((item) => item.id === "painting").durationMinutes,
);
assert.equal(approval.durationTreatment.otherActivitiesSuggestedMinutes, null);
assert.ok(
  items
    .filter((item) => item.id !== "painting")
    .every((item) => item.durationMinutes === null),
);
assert.equal(approval.wineTasting.approvedFor, "adult-owner-only-beta");
assert.equal(approval.wineTasting.broaderBetaAgePolicyApproved, false);
assert.equal(approval.wineTasting.childAccountsApproved, false);
assert.equal(approval.policyExtensionApproved, false);
assert.equal(approval.additionalTesterAccessApproved, false);

// Additions have their own approval. They never rewrite or widen the eight-entry scope.
const additionsBytes = await readFile(
  new URL("../content/activity-additions.json", import.meta.url),
);
const additions = JSON.parse(additionsBytes.toString("utf8"));
const additionsApproval = JSON.parse(
  await readFile(
    new URL("../content/activity-additions-approval.json", import.meta.url),
    "utf8",
  ),
);
const reviewManifest = "qa/activity-concepts-2026-09-24/activities.json";
const reviewProvenance = "qa/activity-concepts-2026-09-24/provenance.json";
assert.equal(additionsApproval.reviewManifest, reviewManifest);
assert.equal(additionsApproval.reviewProvenance, reviewProvenance);
const reviewedBytes = await readFile(
  new URL("../../" + reviewManifest, import.meta.url),
);
const reviewedProvenanceBytes = await readFile(
  new URL("../../" + reviewProvenance, import.meta.url),
);
const reviewed = JSON.parse(reviewedBytes.toString("utf8"));
const reviewedProvenance = JSON.parse(reviewedProvenanceBytes.toString("utf8"));
assert.equal(additions.length, 3);
assert.equal(reviewed.length, additions.length);
assert.equal(
  new Set([...items, ...additions].map((item) => item.id)).size,
  items.length + additions.length,
);
const additionsArtwork = [];
for (const [index, item] of additions.entries()) {
  const original = reviewed[index];
  assert.equal(item.id, original.id);
  for (const field of [
    "title",
    "description",
    "tips",
    "category",
    "durationMinutes",
  ])
    assert.deepEqual(
      item[field],
      original[field],
      `${item.id} ${field} differs from owner review.`,
    );
  assert.equal(item.durationMinutes, null);
  assert.equal(item.artwork, `${item.id}.png`);
  assert.equal(original.artwork, `${item.id}-v2.png`);
  assert.deepEqual(item.sourceIds, [`R20260924-${item.id}`]);
  assert.equal(item.contentStatus, "owner-approved");
  assert.equal(item.categoryStatus, "approved-temporary-discovery-filter");
  assert.ok(approval.categoryTreatment.labels.includes(item.category));
  assert.equal(original.generationProvider, "OpenAI built-in image generation");
  const sourcePath = "qa/activity-concepts-2026-09-24/" + original.artwork;
  const path = "mobile/assets/activities/" + item.artwork;
  const sourceBytes = await readFile(
    new URL("../../" + sourcePath, import.meta.url),
  );
  const imageBytes = await readFile(new URL("../../" + path, import.meta.url));
  const imageHash = sha256(imageBytes);
  assert.equal(
    imageHash,
    sha256(sourceBytes),
    `${item.id} mobile artwork differs from the reviewed PNG.`,
  );
  assert.equal(imageHash, original.artworkSha256);
  const provenanceEntry = reviewedProvenance.outputs.find(
    (output) => output.activityId === item.id,
  );
  assert.equal(provenanceEntry?.file, original.artwork);
  assert.equal(provenanceEntry?.sha256, imageHash);
  additionsArtwork.push({
    activityId: item.id,
    sourcePath,
    path,
    sha256: imageHash,
  });
}
const additionsScope = {
  manifestSha256: sha256(additionsBytes),
  reviewManifestSha256: sha256(reviewedBytes),
  reviewProvenanceSha256: sha256(reviewedProvenanceBytes),
  artwork: additionsArtwork,
};
assert.equal(additionsApproval.schemaVersion, 1);
assert.equal(additionsApproval.status, "approved-for-owner-only-beta");
assert.equal(additionsApproval.approvedOn, "2026-09-24");
assert.equal(additionsApproval.approvedBy, "owner");
assert.equal(additionsApproval.approvalQuote, "love it, keep them");
assert.equal(
  additionsApproval.originalCatalogueScopeSha256,
  approval.scopeSha256,
);
for (const key of [
  "manifestSha256",
  "reviewManifestSha256",
  "reviewProvenanceSha256",
])
  assert.equal(
    additionsApproval[key],
    additionsScope[key],
    `Additions ${key} changed; approval needs review.`,
  );
assert.deepEqual(additionsApproval.artwork, additionsArtwork);
assert.equal(
  additionsApproval.scopeSha256,
  sha256(JSON.stringify(canonical(additionsScope))),
);
assert.deepEqual(
  additionsApproval.approvedActivityIds,
  additions.map((item) => item.id),
);
assert.deepEqual(additionsApproval.approvedFields, approval.approvedFields);
assert.equal(
  additionsApproval.categoryTreatment,
  "existing-temporary-discovery-filters",
);
assert.equal(
  additionsApproval.generationProvider,
  "OpenAI built-in image generation",
);
assert.equal(additionsApproval.policyExtensionApproved, false);
assert.equal(additionsApproval.additionalTesterAccessApproved, false);
// Categories (CE-D5/D7) live in their own approved overlay; the snapshots above stay untouched.
const taxonomy = ["creative", "intellectual", "mindful", "natural", "physical", "community", "uplifting"];
const overlayBytes = await readFile(new URL("../content/activity-categories.json", import.meta.url));
const overlay = JSON.parse(overlayBytes.toString("utf8"));
const overlayApproval = JSON.parse(
  await readFile(new URL("../content/activity-categories-approval.json", import.meta.url), "utf8"),
);
assert.equal(overlay.schemaVersion, 1);
assert.deepEqual(
  overlay.activities.map((entry) => entry.id),
  [...items, ...additions].map((item) => item.id),
  "Every bundled idea needs exactly one approved category entry.",
);
for (const entry of overlay.activities) {
  assert.ok(
    Array.isArray(entry.categories) && entry.categories.length >= 1 && entry.categories.length <= 2,
    `${entry.id} needs one or two categories.`,
  );
  assert.equal(new Set(entry.categories).size, entry.categories.length, `${entry.id} repeats a category.`);
  assert.ok(entry.categories.every((key) => taxonomy.includes(key)), `${entry.id} uses an unapproved category.`);
}
assert.equal(overlayApproval.schemaVersion, 1);
assert.equal(overlayApproval.status, "approved-for-owner-only-beta");
assert.equal(overlayApproval.approvedBy, "owner");
assert.equal(overlayApproval.decision, "CE-D7");
assert.deepEqual(overlayApproval.taxonomy, taxonomy);
assert.deepEqual(overlayApproval.approvedActivityIds, overlay.activities.map((entry) => entry.id));
assert.equal(overlayApproval.mappingSha256, sha256(overlayBytes), "Category mapping changed; approval needs review.");
assert.equal(overlayApproval.wellnessFormulaApproved, false);
assert.equal(overlayApproval.additionalTesterAccessApproved, false);
console.log(
  `${items.length} original and ${additions.length} separately approved owner-only beta activity/artwork pairs validated against their complete review scopes; ${overlay.activities.length} approved category assignments validated. Original snapshots preserved; live publication is tracked separately.`,
);
