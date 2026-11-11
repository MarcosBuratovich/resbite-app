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
  ends_at: "2099-01-01T17:00:00Z",
  time_zone: "UTC",
  place_label: "Riverside park",
  note: "",
  place_tbd: false,
  repeat_weeks: null,
  series_id: "series-1",
  repeats_from: null, admins: [],
};
const details = {
  title: plan.title,
  description: plan.description,
  categories: plan.categories,
  starts_at: plan.starts_at,
  ends_at: "2099-01-01T17:00:00Z",
  place_tbd: false,
  repeat_weeks: null as 1 | 2 | null,
  area: "",
  time_zone: "UTC",
  place_label: plan.place_label,
  note: plan.note,
};
const gateway = (overrides: Partial<PlanGateway>): PlanGateway => ({
  read: async () => plan,
  create: async () => {},
  update: async () => {},
  cancel: async () => 4,
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

test("the end time is part of the saved details: the same instant", () => {
  assert.equal(samePlanDetails(plan, { ...details, ends_at: "2099-01-01T17:00:00.000Z" }), true);
  assert.equal(samePlanDetails(plan, { ...details, ends_at: "2099-01-01T18:00:00Z" }), false);
  // A plan read before UX3 has no end; it never matches a save that has one.
  assert.equal(samePlanDetails({ ...plan, ends_at: null }, details), false);
});

test("Meeting details come from their embedded table, and the embed never reaches the Plan", () => {
  const row = {
    ...plan,
    note: "",
    has_meeting_details: true,
    guest_note: "Running late",
    guest_note_at: "2099-01-01T14:00:00Z",
  };
  const shown = planFromRow({ ...row, plan_meeting_details: { note: "Door code 4521" } });
  assert.equal(shown.note, "Door code 4521");
  assert.equal("plan_meeting_details" in shown, false);
  assert.deepEqual(shown, { ...row, note: "Door code 4521", admins: [] });
  // Not readable (pending, Can’t go) or none at all: the database embeds null.
  assert.equal(planFromRow({ ...row, plan_meeting_details: null }).note, "");
  assert.equal(planFromRow({ ...row, plan_meeting_details: undefined }).note, "");
  assert.equal(planFromRow({ ...row, plan_meeting_details: [] }).note, "");
  assert.equal(planFromRow({ ...row, plan_meeting_details: [{ note: "Gate B" }] }).note, "Gate B");
  // The admins come from the embed `plan_admins(user_id)`; none embedded is none.
  assert.deepEqual(planFromRow({ ...row, plan_admins: [{ user_id: "u1" }, { user_id: "u2" }] }).admins, ["u1", "u2"]);
  assert.deepEqual(planFromRow({ ...row, plan_admins: null }).admins, []);
  assert.equal("plan_admins" in planFromRow({ ...row, plan_admins: [] }), false);
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
  // 22023: the resbite has ended (or is no longer active), said with the end as the boundary.
  await assert.rejects(
    cancelPlan(
      gateway({
        cancel: async () => {
          throw { code: "22023", message: "Plan unavailable" };
        },
        read: async () => ({ ...plan, ends_at: "2020-01-01T17:00:00Z" }),
      }),
      plan,
    ),
    (e: unknown) =>
      e instanceof PlanSaveError &&
      !e.uncertain &&
      e.message === "This resbite has ended or is no longer available." &&
      e.latest?.ends_at === "2020-01-01T17:00:00Z",
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

const recorded = () => {
  const calls: { method: string; arg: unknown }[] = [];
  const g = gateway({
    create: async (w) => void calls.push({ method: "create", arg: w }),
    update: async (w) => void calls.push({ method: "update", arg: w }),
    cancel: async (c) => {
      calls.push({ method: "cancel", arg: c });
      return c.version + 1;
    },
  });
  return { calls, g };
};

test("a To be decided create reaches the gateway with its label, the flag and the repeat rule", async () => {
  const { calls, g } = recorded();
  const write: PlanWrite = {
    id: plan.id,
    activityId: null,
    details: { ...details, place_label: "To be decided", place_tbd: true, repeat_weeks: 2 },
  };
  await writePlan(g, write);
  assert.deepEqual(calls, [{ method: "create", arg: write }]);
  const sent = (calls[0]!.arg as PlanWrite).details;
  assert.equal(sent.place_label, "To be decided");
  assert.equal(sent.place_tbd, true);
  assert.equal(sent.repeat_weeks, 2);
  assert.equal(sent.ends_at, details.ends_at);
});

test("cancelling passes stopRepeating through to the gateway", async () => {
  const { calls, g } = recorded();
  assert.equal(await cancelPlan(g, { id: plan.id, version: 3, stopRepeating: true }), 4);
  assert.equal(await cancelPlan(g, { id: plan.id, version: 3 }), 4);
  assert.deepEqual(calls, [
    { method: "cancel", arg: { id: plan.id, version: 3, stopRepeating: true } },
    { method: "cancel", arg: { id: plan.id, version: 3 } },
  ]);
});

test("a missing end time maps to Add an end time; other 22023 errors keep their message", async () => {
  const write: PlanWrite = { id: plan.id, activityId: null, details };
  const failing = (message: string) =>
    gateway({
      create: async () => {
        throw { code: "22023", message };
      },
    });
  await assert.rejects(
    writePlan(failing("End time required"), write),
    (e: unknown) => e instanceof PlanSaveError && e.message === "Add an end time." && !e.uncertain,
  );
  await assert.rejects(
    writePlan(failing("Plan unavailable"), write),
    (e: unknown) => e instanceof PlanSaveError && /no longer available/.test(e.message),
  );
  await assert.rejects(
    writePlan(failing("Invalid end time"), write),
    (e: unknown) => e instanceof PlanSaveError && /no longer available/.test(e.message),
  );
});

test("a lost reply that the read shows cancelled returns the cancelled version", async () => {
  const version = await cancelPlan(
    gateway({
      cancel: async () => {
        throw new Error("Network lost");
      },
      read: async () => ({ ...plan, status: "cancelled", version: 9 }),
    }),
    plan,
  );
  assert.equal(version, 9);
});

test("the To be decided flag and the repeat rule are part of the saved details", () => {
  assert.equal(samePlanDetails(plan, { ...details, repeat_weeks: 1 }), false);
  assert.equal(samePlanDetails({ ...plan, repeat_weeks: 2 }, { ...details, repeat_weeks: 2 }), true);
  assert.equal(samePlanDetails(plan, { ...details, place_tbd: true }), false);
});

test("the plan read selects the flag, the repeat rule, the series columns, the circle and the admins embed", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../services/plans.ts", import.meta.url), "utf8");
  const columns = /const planColumns =\s*"([^"]+)"/.exec(source)?.[1].split(",") ?? [];
  for (const name of ["place_tbd", "repeat_weeks", "series_id", "repeats_from", "bring_invites", "bring_levels", "plan_admins(user_id)"])
    assert.ok(columns.includes(name), `planColumns lacks ${name}`);
  assert.equal(/const planListColumns =\s*"([^"]+)"/.exec(source)?.[1], "*,plan_admins(user_id)");
});

const refusing = (code: string, message = "") =>
  gateway({
    create: async () => {
      throw { code, message };
    },
    update: async () => {
      throw { code, message };
    },
  });
const refusal = async (code: string, message = "", version?: number) => {
  try {
    await writePlan(refusing(code, message), { id: plan.id, activityId: "coffee", details, version });
  } catch (e) {
    assert.ok(e instanceof PlanSaveError);
    return { message: e.message, uncertain: e.uncertain, reason: e.reason };
  }
  assert.fail("the write was refused");
};

test("a start in the past says so, with the same words as the When row", async () => {
  assert.deepEqual(await refusal("22023", "Invalid future schedule"), {
    message: "Choose a date and time in the future.",
    uncertain: false,
    reason: "past",
  });
  assert.equal((await refusal("22023", "Invalid future schedule", 3)).message, "Choose a date and time in the future.");
});

test("a withdrawn idea says to create the resbite on its own", async () => {
  assert.deepEqual(await refusal("22023", "Activity unavailable"), {
    message: "That idea is no longer available. Create the resbite on its own.",
    uncertain: false,
    reason: "idea",
  });
});

test("the save messages speak of the resbite and the host's changes, never a draft", async () => {
  assert.equal(
    (await refusal("22023", "Plan unavailable")).message,
    "This resbite is no longer available for these changes. Your changes are still here; check My resbites before trying again.",
  );
  assert.equal(
    (await refusal("42501")).message,
    "Your account can’t save this resbite. Private tester access may still be closed. Your changes are still here.",
  );
  assert.equal(
    (await refusal("23514")).message,
    "Check the name, categories, date, place and notes, then try again. Your changes are still here.",
  );
  assert.deepEqual(await refusal("", "Network lost"), {
    message: "We couldn’t confirm the save. Your changes are still here. Retry the same save when you’re connected; don’t create another resbite yet.",
    uncertain: true,
    reason: undefined,
  });
  await assert.rejects(
    writePlan(
      gateway({
        update: async () => {
          throw { code: "40001" };
        },
        read: async () => {
          throw new Error("Offline");
        },
      }),
      { id: plan.id, activityId: null, details, version: 3 },
    ),
    (e: unknown) =>
      e instanceof PlanSaveError &&
      e.uncertain &&
      e.message === "We couldn’t check the latest version of this resbite. Your changes are still here. Retry when you’re connected.",
  );
  await assert.rejects(
    writePlan(
      gateway({
        update: async () => {
          throw { code: "40001" };
        },
        read: async () => ({ ...plan, version: 5, title: "Moved on" }),
      }),
      { id: plan.id, activityId: null, details, version: 3 },
    ),
    (e: unknown) =>
      e instanceof PlanSaveError &&
      !e.uncertain &&
      e.latest?.title === "Moved on" &&
      e.message === "This resbite changed since you opened it. Review the saved details before trying again.",
  );
  await assert.rejects(
    reconcilePlan(
      gateway({
        read: async () => {
          throw new Error("Offline");
        },
      }),
      { id: plan.id, activityId: null, details },
    ),
    (e: unknown) =>
      e instanceof PlanSaveError &&
      e.uncertain &&
      e.message === "We couldn’t check the saved resbite. The save is kept on this phone. Try again when you’re connected.",
  );
});
