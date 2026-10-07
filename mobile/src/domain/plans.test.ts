import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelPlan,
  PlanSaveError,
  reconcilePlan,
  samePlanDetails,
  type Plan,
  type PlanGateway,
  type PlanWrite,
} from "./plans.ts";

const plan: Plan = {
  id: "plan-1",
  activity_id: null,
  title: "Garden picnic",
  description: "Bring a blanket",
  categories: ["natural", "community"],
  owner_id: "owner",
  status: "active",
  version: 3,
  starts_at: "2099-01-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Riverside park",
  note: "",
};
const details = {
  title: plan.title,
  description: plan.description,
  categories: plan.categories,
  starts_at: plan.starts_at,
  time_zone: "UTC",
  place_label: plan.place_label,
  note: plan.note,
};
const gateway = (overrides: Partial<PlanGateway>): PlanGateway => ({
  read: async () => plan,
  create: async () => {},
  update: async () => {},
  cancel: async () => {},
  ...overrides,
});

test("event text and category order are part of the saved details", () => {
  assert.equal(samePlanDetails(plan, details), true);
  assert.equal(samePlanDetails(plan, { ...details, title: "  Garden picnic " }), true);
  assert.equal(samePlanDetails(plan, { ...details, title: "Park picnic" }), false);
  assert.equal(samePlanDetails(plan, { ...details, description: "" }), false);
  assert.equal(samePlanDetails(plan, { ...details, categories: ["community", "natural"] }), false);
});

test("a lost create from scratch is confirmed by reading it, not created twice", async () => {
  let creates = 0;
  const write: PlanWrite = { id: plan.id, activityId: null, details };
  await reconcilePlan(
    gateway({
      read: async () => ({ ...plan, version: 1 }),
      create: async () => {
        creates++;
      },
    }),
    write,
  );
  assert.equal(creates, 0);
});

test("cancelling confirms a lost or repeated reply by reading the cancelled plan", async () => {
  for (const failure of [new Error("Network lost"), { code: "22023" }]) {
    await cancelPlan(
      gateway({
        cancel: async () => {
          throw failure;
        },
        read: async () => ({ ...plan, status: "cancelled", version: 4 }),
      }),
      plan,
    );
  }
});

test("cancel conflicts and denials are definite; an unreadable outcome is uncertain", async () => {
  await assert.rejects(
    cancelPlan(
      gateway({
        cancel: async () => {
          throw { code: "40001" };
        },
        read: async () => ({ ...plan, version: 4 }),
      }),
      plan,
    ),
    (e: unknown) => e instanceof PlanSaveError && !e.uncertain && e.latest?.version === 4,
  );
  await assert.rejects(
    cancelPlan(
      gateway({
        cancel: async () => {
          throw { code: "42501" };
        },
        read: async () => null,
      }),
      plan,
    ),
    (e: unknown) => e instanceof PlanSaveError && !e.uncertain,
  );
  await assert.rejects(
    cancelPlan(
      gateway({
        cancel: async () => {
          throw new Error("Network lost");
        },
        read: async () => {
          throw new Error("Still offline");
        },
      }),
      plan,
    ),
    (e: unknown) => e instanceof PlanSaveError && e.uncertain,
  );
});
