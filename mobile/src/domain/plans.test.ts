import test from "node:test";
import assert from "node:assert/strict";
import {
  canEditPlan,
  preparePlanEdit,
  latestRequest,
  type PlanRecord,
} from "./plans.ts";
const now = Date.parse("2026-09-17T12:00:00Z");
const plan: PlanRecord = {
  id: "p1",
  owner_id: "owner",
  activity_id: "painting",
  starts_at: "2026-09-18T12:00:00Z",
  time_zone: "Europe/London",
  place_label: "Studio",
  note: "Bring a brush",
  status: "active",
  version: 3,
};
const draft = {
  starts_at: "2026-09-19T14:00:00Z",
  time_zone: "Europe/London",
  place_label: "  New studio  ",
  note: "Bring paper",
};
test("only the owner can edit a future active plan", () => {
  assert.equal(canEditPlan(plan, "owner", now), true);
  assert.equal(canEditPlan(plan, "invitee", now), false);
  assert.equal(
    canEditPlan({ ...plan, status: "cancelled" }, "owner", now),
    false,
  );
  assert.equal(
    canEditPlan({ ...plan, starts_at: "2026-09-17T12:00:00Z" }, "owner", now),
    false,
  );
});
test("edit preserves original optimistic version and sends normalized place", () => {
  assert.deepEqual(preparePlanEdit(plan, draft, "owner", now), {
    p_plan: "p1",
    p_version: 3,
    p_start: "2026-09-19T14:00:00Z",
    p_zone: "Europe/London",
    p_place: "New studio",
    p_note: "Bring paper",
    p_cancel: false,
  });
  assert.equal(plan.place_label, "Studio");
});
test("invalid edits fail before a server mutation", () => {
  assert.throws(() =>
    preparePlanEdit(plan, { ...draft, starts_at: "invalid" }, "owner", now),
  );
  assert.throws(() =>
    preparePlanEdit(plan, { ...draft, place_label: " " }, "owner", now),
  );
  assert.throws(() =>
    preparePlanEdit(plan, { ...draft, note: "x".repeat(2001) }, "owner", now),
  );
  assert.throws(() => preparePlanEdit(plan, draft, "invitee", now));
});
test("late refresh cannot overwrite a newer request", () => {
  const gate = latestRequest();
  const first = gate.start(),
    second = gate.start();
  assert.equal(first(), false);
  assert.equal(second(), true);
});
test("leaving the screen invalidates every in-flight refresh", () => {
  const gate = latestRequest();
  const active = gate.start();
  gate.invalidate();
  assert.equal(active(), false);
  assert.equal(gate.start()(), true);
});
