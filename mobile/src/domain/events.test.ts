import test from "node:test";
import assert from "node:assert/strict";
import {
  completeEventFields,
  eventPicture,
  fieldsFromActivity,
  legacyEventFields,
  validateEventFields,
} from "./events.ts";
import { reconcilePlan, type PlanGateway } from "./plans.ts";
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

test("legacyEventFields keeps the idea's title and categories with an empty description", () => {
  assert.deepEqual(legacyEventFields(idea), {
    title: "Painting",
    description: "",
    categories: ["creative", "mindful"],
  });
});

const legacyDetails = {
  starts_at: "2099-01-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Riverside park",
  note: "Bring paint",
};
const legacyGateway = (
  read: PlanGateway["read"],
  onCreate: (details: unknown) => void,
): PlanGateway => ({
  read,
  create: async (write) => onCreate(write.details),
  update: async () => {},
  cancel: async () => {},
});

test("a landed pre-custom-events pending create is acknowledged, not a conflict", async () => {
  let creates = 0;
  const details = { ...legacyDetails, ...completeEventFields({}, legacyEventFields(idea)) };
  await reconcilePlan(
    legacyGateway(
      async () => ({
        id: "p1",
        activity_id: "painting",
        title: "Painting",
        description: "",
        categories: ["creative", "mindful"],
        version: 1,
        status: "active",
        ...legacyDetails,
      }),
      () => creates++,
    ),
    { id: "p1", activityId: "painting", details },
  );
  assert.equal(creates, 0);
});

test("a pre-custom-events pending create that never landed is retried with an empty description", async () => {
  const sent: unknown[] = [];
  const details = { ...legacyDetails, ...completeEventFields({}, legacyEventFields(idea)) };
  await reconcilePlan(
    legacyGateway(async () => null, (d) => sent.push(d)),
    { id: "p1", activityId: "painting", details },
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { ...legacyDetails, title: "Painting", categories: ["creative", "mindful"], description: "" });
});
