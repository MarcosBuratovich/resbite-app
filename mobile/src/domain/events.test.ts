import test from "node:test";
import assert from "node:assert/strict";
import {
  completeEventFields,
  eventPicture,
  fieldsFromActivity,
  validateEventFields,
} from "./events.ts";
import type { Activity } from "./rules.ts";

const fields = { title: "Garden picnic", description: "", categories: ["natural" as const] };

test("event fields follow the server's rules and the app trims first", () => {
  assert.equal(validateEventFields(fields), null);
  assert.equal(validateEventFields({ ...fields, title: "  Garden picnic  " }), null);
  assert.equal(validateEventFields({ ...fields, title: "   " }), "Give your resbite a name.");
  assert.equal(validateEventFields({ ...fields, title: "x".repeat(80) }), null);
  assert.ok(validateEventFields({ ...fields, title: "x".repeat(81) }));
  // Emoji count as two UTF-16 units: the app is stricter than the server, never looser.
  assert.ok(validateEventFields({ ...fields, title: "🎉".repeat(41) }));
  assert.equal(validateEventFields({ ...fields, description: "d".repeat(1000) }), null);
  assert.ok(validateEventFields({ ...fields, description: "d".repeat(1001) }));
  assert.equal(validateEventFields({ ...fields, categories: [] }), "Choose one or two categories.");
  assert.equal(
    validateEventFields({ ...fields, categories: ["natural", "community", "creative"] }),
    "Choose one or two categories.",
  );
});

const idea: Activity = {
  id: "painting",
  title: "Painting",
  categories: ["creative", "mindful"],
  description: "Paint together.",
  tips: [],
  durationMinutes: 30,
  artwork: "painting.png",
  sourceIds: [],
};

test("an idea prefills editable fields without sharing its arrays", () => {
  const prefilled = fieldsFromActivity(idea);
  assert.deepEqual(prefilled, {
    title: "Painting",
    description: "Paint together.",
    categories: ["creative", "mindful"],
  });
  prefilled.categories.pop();
  assert.deepEqual(idea.categories, ["creative", "mindful"]);
});

test("drafts saved before custom events take their missing fields from their idea", () => {
  const fallback = fieldsFromActivity(idea);
  assert.deepEqual(completeEventFields({}, fallback), fallback);
  assert.deepEqual(
    completeEventFields({ title: "Painting night", description: "" }, fallback),
    { title: "Painting night", description: "", categories: ["creative", "mindful"] },
  );
  assert.deepEqual(completeEventFields({}, null), { title: "", description: "", categories: [] });
});

test("pictures use bundled idea artwork, otherwise the primary category", () => {
  assert.deepEqual(eventPicture({ activity_id: "painting", categories: ["creative"] }), {
    kind: "artwork",
    key: "painting",
  });
  assert.deepEqual(eventPicture({ activity_id: "server-only-idea", categories: ["natural", "community"] }), {
    kind: "placeholder",
    category: "natural",
  });
  assert.deepEqual(eventPicture({ activity_id: null, categories: ["uplifting"] }), {
    kind: "placeholder",
    category: "uplifting",
  });
});
