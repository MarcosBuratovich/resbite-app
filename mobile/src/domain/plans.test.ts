import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelPlan,
  PlanSaveError,
  planFromRow,
  reconcilePlan,
  samePlanDetails,
  writePlan,
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
  ends_at: null,
  area: "",
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

test("the area (GI1) is part of the saved details, trimmed; a save kept before GI1 matches any area", () => {
  const near = { ...plan, area: "Near Old Street" };
  assert.equal(samePlanDetails(near, { ...details, area: " Near Old Street " }), true);
  assert.equal(samePlanDetails(near, { ...details, area: "" }), false);
  assert.equal(samePlanDetails(plan, { ...details, area: "Near Old Street" }), false);
  // A plan read before GI1 has no area: the same as none.
  assert.equal(samePlanDetails(plan, { ...details, area: "" }), true);
  const { area: _none, ...older } = details;
  assert.equal(samePlanDetails(near, older as typeof details), true);
});

test("the end time is part of the saved details: the same instant, or none on both", () => {
  const ending = { ...plan, ends_at: "2099-01-01T17:00:00Z" };
  assert.equal(samePlanDetails(ending, { ...details, ends_at: "2099-01-01T17:00:00.000Z" }), true);
  assert.equal(samePlanDetails(ending, { ...details, ends_at: "2099-01-01T18:00:00Z" }), false);
  assert.equal(samePlanDetails(ending, details), false);
  assert.equal(samePlanDetails({ ...plan, ends_at: null }, details), true);
  // A plan read before UX3 has no ends_at at all; a save kept on the device before UX3 has none either.
  assert.equal(samePlanDetails(plan, details), true);
  const { ends_at: _none, ...older } = details;
  assert.equal(samePlanDetails(plan, older as typeof details), true);
  assert.equal(samePlanDetails(ending, older as typeof details), false);
});

test("Meeting details come from their embedded table, and the embed never reaches the Plan", () => {
  const row = {
    ...plan,
    note: "",
    ends_at: null,
    has_meeting_details: true,
    guest_note: "Running late",
    guest_note_at: "2099-01-01T14:00:00Z",
  };
  const shown = planFromRow({ ...row, plan_meeting_details: { note: "Door code 4521" } });
  assert.equal(shown.note, "Door code 4521");
  assert.equal("plan_meeting_details" in shown, false);
  assert.deepEqual(shown, { ...row, note: "Door code 4521" });
  // Not readable (pending, Can’t go) or none at all: the database embeds null.
  assert.equal(planFromRow({ ...row, plan_meeting_details: null }).note, "");
  assert.equal(planFromRow({ ...row, plan_meeting_details: undefined }).note, "");
  assert.equal(planFromRow({ ...row, plan_meeting_details: [] }).note, "");
  assert.equal(planFromRow({ ...row, plan_meeting_details: [{ note: "Gate B" }] }).note, "Gate B");
  // A read without the embed (select *) shows no Meeting details, whatever the old column holds.
  assert.equal(planFromRow({ ...row, note: "stale" }).note, "");
  assert.equal(planFromRow({ ...row, plan_meeting_details: { note: null } }).note, "");
});

test("a lost create with an end time is confirmed by reading the same end", async () => {
  const write: PlanWrite = {
    id: plan.id,
    activityId: null,
    details: { ...details, ends_at: "2099-01-01T17:00:00Z" },
  };
  await writePlan(
    gateway({
      create: async () => {
        throw { code: "40001" };
      },
      read: async () => ({ ...plan, version: 1, ends_at: "2099-01-01T17:00:00.000Z" }),
    }),
    write,
  );
  await assert.rejects(
    writePlan(
      gateway({
        create: async () => {
          throw { code: "40001" };
        },
        read: async () => ({ ...plan, version: 1, ends_at: null }),
      }),
      write,
    ),
    (e: unknown) => e instanceof PlanSaveError && !e.uncertain,
  );
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
