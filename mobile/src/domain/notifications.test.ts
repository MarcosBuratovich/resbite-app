import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFICATION_ASK,
  NOTIFICATION_EVENTS,
  NOTIFICATIONS_TURN_ON_FAILED,
  notificationDelivery,
  notificationEventsLead,
  permissionDetail,
  shouldAsk,
  updatesChip,
  UPDATES_ACTIONS,
  type NotificationPermission,
} from "./notifications.ts";

// Plan 4 Task 5: the one notification ask, and the Updates chip on Notification settings.

const never = { permission: "undetermined", asked: false } as const;

test("the ask comes for the organizer, after creating, and after answering Going or Maybe", () => {
  assert.equal(shouldAsk({ ...never, owner: true }), true, "the organizer on an event page");
  assert.equal(shouldAsk({ ...never, created: true }), true, "My resbites after creating");
  assert.equal(shouldAsk({ ...never, response: "accepted" }), true, "Going");
  assert.equal(shouldAsk({ ...never, response: "maybe" }), true, "Maybe");
});

test("Can’t go, no answer yet or no moment at all never brings the ask", () => {
  for (const response of ["declined", "withdrawn", "pending", "", null, undefined])
    assert.equal(shouldAsk({ ...never, response }), false, String(response));
  assert.equal(shouldAsk({ ...never }), false);
  assert.equal(shouldAsk({ ...never, owner: false, created: false }), false);
});

test("the ask shows once: never again once it was shown on this phone", () => {
  for (const moment of [{ owner: true }, { created: true }, { response: "accepted" }, { response: "maybe" }])
    assert.equal(shouldAsk({ ...never, ...moment, asked: true }), false, JSON.stringify(moment));
});

test("the ask comes only while the permission was never asked for", () => {
  const decided: NotificationPermission[] = [
    "granted",
    "denied",
    "provisional",
    "ephemeral",
    "unknown",
    "preview",
    "unsupported",
  ];
  for (const permission of decided)
    for (const moment of [{ owner: true }, { created: true }, { response: "accepted" }, { response: "maybe" }])
      assert.equal(shouldAsk({ permission, asked: false, ...moment }), false, `${permission} ${JSON.stringify(moment)}`);
});

test("the ask's wording", () => {
  assert.deepEqual(NOTIFICATION_ASK, {
    title: "Get notified?",
    body: "Resbite can tell you when people answer or ask to join, when a resbite changes or gets a note, and before it starts.",
    turnOn: "Turn on notifications",
    notNow: "Not now",
  });
  assert.equal(
    NOTIFICATIONS_TURN_ON_FAILED,
    "Couldn’t turn on notifications on this phone. Try again.",
  );
});

const chip = (
  permission: NotificationPermission | null,
  push: Parameters<typeof updatesChip>[0]["push"],
  enabled = true,
) => updatesChip({ enabled, permission, push });

test("Updates: Not active yet while this build sends nothing, whatever the phone says", () => {
  for (const permission of ["granted", "denied", "undetermined", null] as const)
    for (const push of ["registered", "failed", "permission-off", "disabled", null] as const)
      assert.deepEqual(chip(permission, push, false), { text: "Not active yet", on: false, action: null });
});

test("Updates: Not active yet where nothing can be registered (preview, web, signed out)", () => {
  for (const permission of ["preview", "unsupported", "granted", "denied", "undetermined"] as const)
    assert.deepEqual(chip(permission, "disabled"), { text: "Not active yet", on: false, action: null });
});

test("Updates: On with the permission and this phone registered", () => {
  for (const permission of ["granted", "provisional", "ephemeral"] as const)
    assert.deepEqual(chip(permission, "registered"), { text: "On", on: true, action: null }, permission);
});

test("Updates: Off in Settings when the permission is off, with the Settings button", () => {
  for (const push of ["permission-off", "registered", "failed", null] as const)
    assert.deepEqual(chip("denied", push), { text: "Off in Settings", on: false, action: "settings" }, String(push));
});

test("Updates: Not asked yet before iPhone’s prompt, with Turn on notifications", () => {
  for (const push of ["permission-off", "failed", null] as const)
    assert.deepEqual(chip("undetermined", push), { text: "Not asked yet", on: false, action: "turn-on" }, String(push));
});

test("Updates: Checking… while the permission or this account’s registration is being read", () => {
  for (const push of ["registered", "failed", "permission-off", null] as const)
    assert.deepEqual(chip(null, push), { text: "Checking…", on: false, action: null }, String(push));
  assert.deepEqual(chip("granted", null), { text: "Checking…", on: false, action: null });
  // Allowed in Settings a moment ago: the registration catches up (foreground, or after the prompt).
  assert.deepEqual(chip("granted", "permission-off"), { text: "Checking…", on: false, action: null });
});

test("Updates: a failed registration is quiet, Not set up yet with Try again", () => {
  for (const permission of ["granted", "provisional", "ephemeral"] as const)
    assert.deepEqual(chip(permission, "failed"), { text: "Not set up yet", on: false, action: "retry" }, permission);
  assert.deepEqual(chip("unknown", "permission-off"), { text: "Not set up yet", on: false, action: "retry" });
  assert.deepEqual(chip("unknown", "failed"), { text: "Not set up yet", on: false, action: "retry" });
});

test("Updates: every action is a labelled button", () => {
  assert.deepEqual(UPDATES_ACTIONS, {
    settings: { text: "Settings", label: "Open device settings" },
    "turn-on": { text: "Turn on notifications", label: "Turn on notifications" },
    retry: { text: "Try again", label: "Try setting up notifications again" },
  });
});

test("the About sheet lists the six events in the spec’s words", () => {
  assert.deepEqual(NOTIFICATION_EVENTS, [
    "A new invitation, to the person invited.",
    "An answer, to the host: “Sam is going.”",
    "A new request to join, to the host.",
    "Approved, to the person who asked. Declined isn’t sent.",
    "A change of time or place, and a cancellation, to the people invited.",
    "A Note to guests.",
  ]);
  assert.equal(notificationEventsLead(true), "Resbite sends updates for:");
  assert.equal(notificationEventsLead(false), "Once updates are on, Resbite sends them for:");
  for (const line of NOTIFICATION_EVENTS) assert.ok(!line.includes("'"), "Curly apostrophes only");
});

test("delivery follows the build’s push switch", () => {
  const before = process.env.EXPO_PUBLIC_PUSH_ENABLED;
  try {
    delete process.env.EXPO_PUBLIC_PUSH_ENABLED;
    assert.equal(notificationDelivery.enabled, false);
    process.env.EXPO_PUBLIC_PUSH_ENABLED = "false";
    assert.equal(notificationDelivery.enabled, false);
    process.env.EXPO_PUBLIC_PUSH_ENABLED = "true";
    assert.equal(notificationDelivery.enabled, true);
  } finally {
    if (before === undefined) delete process.env.EXPO_PUBLIC_PUSH_ENABLED;
    else process.env.EXPO_PUBLIC_PUSH_ENABLED = before;
  }
});

test("the permission line says updates aren’t active only while they aren’t", () => {
  assert.equal(permissionDetail("granted", false), "Reminders can reach you. Updates aren’t active yet.");
  assert.equal(permissionDetail("granted", true), "Reminders can reach you.");
  assert.equal(permissionDetail("denied", true), "Turn notifications on in Settings to get reminders.");
  assert.equal(permissionDetail("provisional", true), "Reminders arrive quietly.");
  assert.equal(permissionDetail("ephemeral", true), "Reminders can reach you for now.");
  for (const permission of ["undetermined", "unknown", "preview", "unsupported"] as const)
    assert.equal(permissionDetail(permission, true), permissionDetail(permission, false), permission);
  for (const permission of ["undetermined", "denied", "granted", "provisional", "ephemeral", "unknown"] as const)
    assert.ok(!permissionDetail(permission, true).includes("aren’t active"), permission);
});
