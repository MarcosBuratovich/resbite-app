import test from "node:test";
import assert from "node:assert/strict";
import {
  canEditPlan,
  parseLocalDateTime,
  PlanSaveError,
  writePlan,
  type PlanGateway,
  type PlanWrite,
} from "./plans.ts";
import {
  filterActivities,
  validateRegistration,
  validatePlan,
  safeAuthCode,
  motionPolicy,
} from "./rules.ts";
const entries = [
  {
    id: "paint",
    title: "Painting together",
    category: "Creative",
    description: "",
    tips: [],
    durationMinutes: null,
    artwork: "",
    sourceIds: [],
  },
  {
    id: "cycle",
    title: "Cycling together",
    category: "Physical",
    description: "",
    tips: [],
    durationMinutes: null,
    artwork: "",
    sourceIds: [],
  },
];
test("search is case-insensitive and intersects category", () => {
  assert.deepEqual(
    filterActivities(entries, " PAINT ", "All").map((x) => x.id),
    ["paint"],
  );
  assert.equal(filterActivities(entries, "paint", "Physical").length, 0);
  assert.equal(filterActivities(entries, "", "All").length, 2);
});
test("registration rejects invalid email and short password without changing valid input", () => {
  assert.ok(validateRegistration("bad", "longpassword"));
  assert.ok(validateRegistration("a@example.com", "123"));
  assert.equal(validateRegistration("a@example.com", "longpassword"), null);
});
test("planning rejects invalid or past date and empty place", () => {
  assert.ok(validatePlan("no date", "Park", 0));
  assert.ok(
    validatePlan("2026-01-01T12:00:00Z", "Park", Date.parse("2026-01-02")),
  );
  assert.ok(validatePlan("2027-01-01T12:00:00Z", " ", 0));
  assert.equal(validatePlan("2027-01-01T12:00:00Z", "Park", 0), null);
});
test("auth router accepts only the app auth callback, never foreign or invitation codes", () => {
  assert.equal(safeAuthCode("resbite://auth/callback?code=abc"), "abc");
  assert.equal(
    safeAuthCode("https://evil.example/auth/callback?code=abc"),
    null,
  );
  assert.equal(safeAuthCode("resbite://invite?code=abc"), null);
});
test("reduce motion removes displacement and scaling but retains feedback", () => {
  assert.equal(motionPolicy(true).enterOffset, 0);
  assert.equal(motionPolicy(true).pressScale, 1);
  assert.ok(motionPolicy(true).duration <= 150);
});

const plan = {
  id: "plan-1",
  activity_id: "coffee-together",
  owner_id: "owner",
  status: "active",
  version: 3,
  starts_at: "2099-01-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "The café",
  note: "Bring a book",
};
const change: PlanWrite = {
  id: plan.id,
  activityId: plan.activity_id,
  version: plan.version,
  details: {
    starts_at: plan.starts_at,
    time_zone: "UTC",
    place_label: "The park",
    note: "Bring a picnic",
  },
};
test("editing is limited to the owner of a future active plan", () => {
  assert.equal(canEditPlan(plan, "owner", false, 0), true);
  assert.equal(canEditPlan(plan, "guest", false, 0), false);
  assert.equal(canEditPlan(plan, undefined, false, 0), false);
  assert.equal(
    canEditPlan({ ...plan, status: "cancelled" }, "owner", true, 0),
    false,
  );
  assert.equal(
    canEditPlan(plan, "owner", false, Date.parse(plan.starts_at)),
    false,
  );
  assert.equal(canEditPlan(plan, undefined, true, 0), true);
});
test("local date entry rejects partial input and calendar rollover", () => {
  assert.equal(parseLocalDateTime("2027-02-30 12:00"), null);
  assert.equal(parseLocalDateTime("2027-01-01 25:00"), null);
  assert.equal(parseLocalDateTime("2027-01-01 1"), null);
  assert.ok(parseLocalDateTime("2028-02-29 12:30"));
});
test("a lost edit response is confirmed by matching saved details and version", async () => {
  let updates = 0;
  const gateway: PlanGateway = {
    create: async () => {
      throw new Error("must not create");
    },
    update: async () => {
      updates++;
      throw { code: "40001" };
    },
    read: async () => ({ ...plan, ...change.details, version: 4 }),
  };
  await writePlan(gateway, change);
  assert.equal(updates, 1);
});
test("conflicting or cancelled plans cannot be silently overwritten or acknowledged", async () => {
  for (const latest of [
    { ...plan, version: 4 },
    { ...plan, ...change.details, version: 4, status: "cancelled" },
  ]) {
    const gateway: PlanGateway = {
      create: async () => {},
      update: async () => {
        throw { code: "40001" };
      },
      read: async () => latest,
    };
    const before = structuredClone(change);
    await assert.rejects(
      writePlan(gateway, change),
      (e: unknown) =>
        e instanceof PlanSaveError && e.latest === latest && !e.uncertain,
    );
    assert.deepEqual(change, before);
  }
});
test("unknown save failures remain uncertain; denied access is a definite failure", async () => {
  for (const [error, uncertain] of [
    [new Error("Network failed"), true],
    [{ code: "42501" }, false],
  ] as const) {
    await assert.rejects(
      writePlan(
        {
          create: async () => {
            throw error;
          },
          update: async () => {},
          read: async () => null,
        },
        { ...change, version: undefined },
      ),
      (e: unknown) => e instanceof PlanSaveError && e.uncertain === uncertain,
    );
  }
});
