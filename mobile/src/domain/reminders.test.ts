import test from "node:test";
import assert from "node:assert/strict";
import { REMINDER_LIMIT, REMINDER_PREFIX, plannedReminders, reminderChanges, type ReminderSource } from "./reminders.ts";

const now = new Date(2099, 9, 14, 12, 0);
const event = (over: Partial<ReminderSource> = {}): ReminderSource => ({
  id: "p1",
  title: "Picnic in the park",
  starts_at: new Date(2099, 9, 16, 10, 0).toISOString(),
  status: "active",
  owner: false,
  response: "accepted",
  ...over,
});
const options = { now, enabled: true, muted: new Set<string>() };

test("two reminders, 1 day and 1 hour before, with the name and time only", () => {
  assert.deepEqual(plannedReminders([event()], options), [
    { id: `${REMINDER_PREFIX}p1:1d`, planId: "p1", at: new Date(2099, 9, 15, 10, 0), body: "Tomorrow at 10:00 · Picnic in the park" },
    { id: `${REMINDER_PREFIX}p1:1h`, planId: "p1", at: new Date(2099, 9, 16, 9, 0), body: "In 1 hour · Picnic in the park" },
  ]);
});

test("who gets them: the organizer, Going and Maybe; not Can't go, unanswered, cancelled, muted or switched off", () => {
  assert.equal(plannedReminders([event({ owner: true, response: null })], options).length, 2);
  assert.equal(plannedReminders([event({ response: "maybe" })], options).length, 2);
  for (const response of ["pending", "declined", "withdrawn", null])
    assert.equal(plannedReminders([event({ response })], options).length, 0, String(response));
  assert.equal(plannedReminders([event({ status: "cancelled" })], options).length, 0);
  assert.equal(plannedReminders([event()], { ...options, muted: new Set(["p1"]) }).length, 0);
  assert.equal(plannedReminders([event()], { ...options, enabled: false }).length, 0);
});

test("reminders whose time has passed are skipped; started events have none", () => {
  const soon = event({ starts_at: new Date(2099, 9, 14, 20, 0).toISOString() });
  assert.deepEqual(plannedReminders([soon], options).map((r) => r.id), [`${REMINDER_PREFIX}p1:1h`]);
  const imminent = event({ starts_at: new Date(2099, 9, 14, 12, 30).toISOString() });
  assert.deepEqual(plannedReminders([imminent], options), []);
  const started = event({ starts_at: new Date(2099, 9, 14, 11, 0).toISOString() });
  assert.deepEqual(plannedReminders([started], options), []);
});

test("a blank name still reads well, and the phone's limit keeps the soonest", () => {
  assert.equal(plannedReminders([event({ title: "  " })], options)[1].body, "In 1 hour · your resbite");
  const many = Array.from({ length: 40 }, (_, i) =>
    event({ id: `p${i}`, starts_at: new Date(2099, 9, 20 + i, 10, 0).toISOString() }),
  );
  const planned = plannedReminders(many, options);
  assert.equal(planned.length, REMINDER_LIMIT);
  assert.equal(planned[0].id, `${REMINDER_PREFIX}p0:1d`);
  assert.ok(planned.every((r, i) => i === 0 || planned[i - 1].at <= r.at));
});

test("syncing moves changed reminders, removes stale ones and never touches other notifications", () => {
  const wanted = plannedReminders([event()], options);
  const [day, hour] = wanted;
  const scheduled = [
    { id: day.id, at: day.at.getTime(), body: day.body },
    { id: hour.id, at: hour.at.getTime() - 60_000, body: hour.body },
    { id: `${REMINDER_PREFIX}gone:1h`, at: 1, body: "In 1 hour · Old" },
    { id: "someone-else", at: 1, body: "Not ours" },
  ];
  const changes = reminderChanges(scheduled, wanted);
  assert.deepEqual(changes.cancel, [hour.id, `${REMINDER_PREFIX}gone:1h`]);
  assert.deepEqual(changes.schedule, [hour]);
  assert.deepEqual(reminderChanges([], []), { cancel: [], schedule: [] });
  // Signing out wants nothing: every Resbite reminder goes.
  assert.deepEqual(reminderChanges(scheduled, []).cancel, [day.id, hour.id, `${REMINDER_PREFIX}gone:1h`]);
});
