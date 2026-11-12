import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REMINDER_LIMIT, REMINDER_PREFIX, plannedReminders, reminderChanges, showsInForeground, type ReminderSource } from "./reminders.ts";

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

// K-S9: what shows while Resbite is open. Reminders and plan updates as before; a chat push unless its chat is on screen.
test("a chat push shows while Resbite is open, unless its own chat is the focused screen", () => {
  const series = "30000000-0000-4000-8000-000000000001";
  const other = "30000000-0000-4000-8000-000000000002";
  const chat = { type: "chat", seriesId: series, planId: "20000000-0000-4000-8000-000000000001", notificationId: "9" };
  assert.equal(showsInForeground("remote-1", chat, null), true, "no chat focused");
  assert.equal(showsInForeground("remote-1", chat, other), true, "another chat focused");
  assert.equal(showsInForeground("remote-1", chat, series), false, "its own chat focused");
});

test("reminders and plan updates show as before, whichever chat is focused; other notifications don't", () => {
  const series = "30000000-0000-4000-8000-000000000001";
  for (const focused of [null, series]) {
    assert.equal(showsInForeground(`${REMINDER_PREFIX}p1:1h`, { planId: "p1" }, focused), true);
    assert.equal(showsInForeground(`${REMINDER_PREFIX}p1:1d`, null, focused), true);
    assert.equal(showsInForeground("remote-1", { type: "plan_update", planId: "p1", notificationId: "1" }, focused), true);
    // Unchanged: connection pushes and anything else stay out of the banner while Resbite is open.
    assert.equal(showsInForeground("remote-1", { type: "connection", planId: "p1", notificationId: "1" }, focused), false);
    assert.equal(showsInForeground("remote-1", { type: "other" }, focused), false);
    assert.equal(showsInForeground("remote-1", null, focused), false);
    assert.equal(showsInForeground("remote-1", undefined, focused), false);
  }
});

test("the foreground handler and the chat screen use the rule: the handler reads the focused chat, the chat sets and clears it (K-S9)", () => {
  // deviceReminders.ts and chat.tsx import React Native, so their wiring is read from the source.
  const device = readFileSync(new URL("../services/deviceReminders.ts", import.meta.url), "utf8");
  assert.match(device, /const ours = showsInForeground\(notification\.request\.identifier, notification\.request\.content\.data, focused\);/);
  assert.match(device, /return \{ shouldShowBanner: ours, shouldShowList: ours, shouldPlaySound: false, shouldSetBadge: false \};/);
  const chat = readFileSync(new URL("../../app/chat.tsx", import.meta.url), "utf8");
  // Set on focus, cleared on blur only while it is still this chat's.
  assert.match(chat, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(!focusedSeries\) return;\s*setFocusedChat\(focusedSeries\);\s*return \(\) => \{\s*if \(focusedChat\(\) === focusedSeries\) setFocusedChat\(null\);/);
  // CH-P17, K-N15: the chat is the moment for the ask, while the reader is in an open chat.
  assert.match(chat, /useNotificationAsk\(summary\?\.open && !out \? \{ chat: true \} : null\)/);
  assert.match(chat, /<NotificationAsk ask=\{ask\} \/>/);
});
