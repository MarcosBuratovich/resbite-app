import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as domain from "../domain/reminders.ts";
import * as notificationsService from "./notifications.ts";
import * as mirrorModule from "./deviceMirror.ts";
import { REMINDER_PREFIX, type Reminder, type ReminderSource } from "../domain/reminders.ts";
import type { DeviceMirror } from "./deviceMirror.ts";
import type { ReminderPrefs } from "./reminderPrefsStore.ts";
import {
  createFakeReminderAdapter,
  createReminderService,
  createReminderSync,
  reminderSources,
  reminderTapPlan,
  scheduledAt,
  type ReminderAdapter,
  type ReminderService,
} from "./reminders.ts";

const reminder = (id: string, at: number, body = "In 1 hour · Picnic"): Reminder => ({
  id: `${REMINDER_PREFIX}${id}`,
  planId: id.split(":")[0],
  at: new Date(at),
  body,
});
const mirror = (): DeviceMirror => ({ reminders: [], calendar: [], permission: "undetermined" });

function recordingAdapter(base = createFakeReminderAdapter(null)) {
  const calls: string[] = [];
  const adapter: ReminderAdapter = {
    ...base,
    cancel: async (id) => {
      calls.push(`cancel:${id}`);
      await base.cancel(id);
    },
    schedule: async (r) => {
      calls.push(`schedule:${r.id}`);
      await base.schedule(r);
    },
  };
  return { adapter, calls };
}

test("sync schedules what is missing, moves what changed and removes the rest; other notifications stay", async () => {
  const { adapter, calls } = recordingAdapter();
  const others = { id: "someone-else", at: 5, body: "Not ours" };
  const scheduled = adapter.scheduled;
  adapter.scheduled = async () => [...(await scheduled()), others];
  const service = createReminderService(adapter);
  await service.sync([reminder("a:1d", 1000), reminder("b:1h", 2000)]);
  calls.length = 0;
  await service.sync([reminder("a:1d", 1000), reminder("b:1h", 3000), reminder("c:1h", 4000)]);
  assert.deepEqual(calls, [
    `cancel:${REMINDER_PREFIX}b:1h`,
    `schedule:${REMINDER_PREFIX}b:1h`,
    `schedule:${REMINDER_PREFIX}c:1h`,
  ]);
  calls.length = 0;
  await service.sync([]);
  assert.deepEqual(calls.sort(), [
    `cancel:${REMINDER_PREFIX}a:1d`,
    `cancel:${REMINDER_PREFIX}b:1h`,
    `cancel:${REMINDER_PREFIX}c:1h`,
  ]);
});

test("one failed change doesn't stop the others, and the sync reports it", async () => {
  const { adapter, calls } = recordingAdapter();
  adapter.schedule = async (r) => {
    calls.push(`schedule:${r.id}`);
    if (r.id.endsWith("a:1d")) throw Error("time interval must be greater than 0");
  };
  await assert.rejects(
    createReminderService(adapter).sync([reminder("a:1d", 1000), reminder("b:1h", 2000)]),
    /Some reminders couldn’t be updated/,
  );
  assert.equal(calls.length, 2);
});

test("clearAll removes every Resbite reminder, scheduled or already shown, and nothing else", async () => {
  const removed: string[] = [];
  const service = createReminderService({
    ...createFakeReminderAdapter(null),
    scheduled: async () => [
      { id: `${REMINDER_PREFIX}a:1d`, at: 1, body: "" },
      { id: "other", at: 1, body: "" },
    ],
    cancel: async (id) => {
      removed.push(`cancel:${id}`);
    },
    delivered: async () => [`${REMINDER_PREFIX}b:1h`, "push-1"],
    dismiss: async (id) => {
      removed.push(`dismiss:${id}`);
    },
  });
  await service.clearAll();
  assert.deepEqual(removed, [`cancel:${REMINDER_PREFIX}a:1d`, `dismiss:${REMINDER_PREFIX}b:1h`]);
});

test("permission reads iOS's richer status; the fake starts unanswered and the first request allows it", async () => {
  const ios = createReminderService({
    ...createFakeReminderAdapter(null),
    platform: "ios",
    getPermission: async () => ({ status: "denied", ios: { status: 3 } }),
  });
  assert.equal(await ios.permission(), "provisional");
  const device = mirror();
  const fake = createReminderService(createFakeReminderAdapter(device));
  assert.equal(await fake.permission(), "undetermined");
  assert.equal(await fake.request(), "granted");
  assert.equal(device.permission, "granted");
  // A QA script can turn it off; a request then leaves it off, as iPhone would.
  device.permission = "denied";
  assert.equal(await fake.permission(), "denied");
  assert.equal(await fake.request(), "denied");
});

test("the fake mirrors its reminders for browser QA, soonest first, and nothing without a mirror", async () => {
  const device = mirror();
  const service = createReminderService(createFakeReminderAdapter(device));
  await service.sync([reminder("b:1h", Date.UTC(2099, 0, 2)), reminder("a:1d", Date.UTC(2099, 0, 1))]);
  assert.deepEqual(device.reminders, [
    { id: `${REMINDER_PREFIX}a:1d`, at: "2099-01-01T00:00:00.000Z", body: "In 1 hour · Picnic" },
    { id: `${REMINDER_PREFIX}b:1h`, at: "2099-01-02T00:00:00.000Z", body: "In 1 hour · Picnic" },
  ]);
  await service.clearAll();
  assert.deepEqual(device.reminders, []);
  // Node has no __DEV__, as in a release build: there is no mirror at all.
  assert.equal(mirrorModule.deviceMirror(), null);
  assert.equal(globalThis.__resbiteDevice, undefined);
});

test("a scheduled reminder's time comes from its data, or Android's date trigger", () => {
  const at = Date.UTC(2099, 0, 1, 9);
  // iOS reports a date trigger as a time interval from when it was scheduled.
  const ios = { content: { data: { planId: "a", at } }, trigger: { type: "timeInterval", seconds: 3600, repeats: false } };
  assert.equal(scheduledAt(ios), at);
  assert.equal(scheduledAt({ content: { data: {} }, trigger: { type: "date", value: at, repeats: false } }), at);
  assert.equal(scheduledAt({ content: {}, trigger: { type: "timeInterval", seconds: 3600 } }), null);
  assert.equal(scheduledAt({ content: { data: null }, trigger: null }), null);
});

test("only a tapped Resbite reminder with a plan id opens an event", () => {
  const response = (identifier: string, data: Record<string, unknown> | undefined) => ({
    notification: { request: { identifier, content: { data } } },
  });
  assert.equal(reminderTapPlan(response(`${REMINDER_PREFIX}p1:1h`, { planId: "p1", at: 1 })), "p1");
  assert.equal(reminderTapPlan(response("push-1", { planId: "p1" })), null);
  assert.equal(reminderTapPlan(response(`${REMINDER_PREFIX}p1:1h`, { planId: 7 })), null);
  assert.equal(reminderTapPlan(response(`${REMINDER_PREFIX}p1:1h`, undefined)), null);
  assert.equal(reminderTapPlan(null), null);
});

test("sources mark the person's own events and their own answers", () => {
  const plans = [
    { id: "own", title: "Picnic", starts_at: "2099-01-01T10:00:00Z", status: "active", owner_id: "me" },
    { id: "invited", title: "Walk", starts_at: "2099-01-02T10:00:00Z", status: "active", owner_id: "host" },
    { id: "unanswered", title: "Talk", starts_at: "2099-01-03T10:00:00Z", status: "active", owner_id: "host" },
  ];
  const answers = [{ plan_id: "invited", response: "maybe" }];
  assert.deepEqual(
    reminderSources(plans, answers, { userId: "me", preview: false }).map((s) => [s.id, s.owner, s.response]),
    [
      ["own", true, null],
      ["invited", false, "maybe"],
      ["unanswered", false, null],
    ],
  );
  // Preview's plans on the device carry no owner; they are all the person's own.
  const local = plans.map(({ owner_id: _owner, ...plan }) => plan);
  assert.deepEqual(
    reminderSources(local, [], { userId: null, preview: true }).map((s) => s.owner),
    [true, true, true],
  );
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const NOW = new Date(Date.UTC(2099, 0, 1, 8));
const source = (id: string, hoursAhead: number, extra: Partial<ReminderSource> = {}): ReminderSource => ({
  id,
  title: id,
  starts_at: new Date(NOW.getTime() + hoursAhead * 3600_000).toISOString(),
  status: "active",
  owner: true,
  response: null,
  ...extra,
});

function syncHarness(options: { permission?: string; prefs?: Partial<ReminderPrefs> } = {}) {
  const phone = mirror();
  phone.permission = (options.permission ?? "granted") as DeviceMirror["permission"];
  const previewPhone = mirror();
  previewPhone.permission = "granted";
  const recorded = recordingAdapter(createFakeReminderAdapter(phone));
  const services: Record<string, ReminderService> = {
    phone: createReminderService(recorded.adapter),
    preview: createReminderService(createFakeReminderAdapter(previewPhone)),
  };
  let sources: () => Promise<ReminderSource[]> = async () => [source("p1", 48)];
  const reads: string[] = [];
  const prefs: ReminderPrefs = { enabled: true, muted: [], asked: true, notificationsAsked: true, ...options.prefs };
  const sync = createReminderSync({
    service: (preview) => services[preview ? "preview" : "phone"],
    prefs: async (scope) => {
      reads.push(`prefs:${scope}`);
      return prefs;
    },
    readSources: async (userId) => {
      reads.push(`plans:${userId}`);
      return sources();
    },
    now: () => NOW,
  });
  return {
    sync,
    phone,
    previewPhone,
    reads,
    prefs,
    /** Every cancel and schedule that reached the phone. */
    changes: recorded.calls,
    setSources: (fn: () => Promise<ReminderSource[]>) => {
      sources = fn;
    },
    ids: (device = phone) => device.reminders.map((r) => r.id.slice(REMINDER_PREFIX.length)),
  };
}

test("a sync sets the two reminders for the person's events, honouring the switches", async () => {
  const h = syncHarness();
  h.setSources(async () => [
    source("own", 48),
    source("going", 30, { owner: false, response: "accepted" }),
    source("cant", 30, { owner: false, response: "declined" }),
    source("muted", 30),
  ]);
  h.prefs.muted = ["muted"];
  await h.sync.sync({ userId: "me", preview: false });
  assert.deepEqual(h.ids(), ["going:1d", "own:1d", "going:1h", "own:1h"]);
  assert.deepEqual(h.reads, ["prefs:me", "plans:me"]);
  h.prefs.enabled = false;
  await h.sync.sync({ userId: "me", preview: false });
  assert.deepEqual(h.ids(), []);
});

test("without permission nothing is scheduled, nothing is read and nothing is asked", async () => {
  for (const permission of ["undetermined", "denied"]) {
    const h = syncHarness({ permission });
    await h.sync.sync({ userId: "me", preview: false });
    assert.deepEqual(h.ids(), []);
    assert.deepEqual(h.reads, []);
    assert.equal(h.phone.permission, permission);
  }
});

test("a failed read leaves the phone's reminders as they were", async () => {
  const h = syncHarness();
  await h.sync.sync({ userId: "me", preview: false });
  assert.deepEqual(h.ids(), ["p1:1d", "p1:1h"]);
  h.setSources(async () => {
    throw Error("offline");
  });
  await assert.rejects(h.sync.sync({ userId: "me", preview: false }), /offline/);
  assert.deepEqual(h.ids(), ["p1:1d", "p1:1h"]);
});

test("signed out, the phone keeps no reminders", async () => {
  const h = syncHarness();
  await h.sync.sync({ userId: "me", preview: false });
  await h.sync.sync({ userId: null, preview: false });
  assert.deepEqual(h.ids(), []);
  assert.deepEqual(h.reads, ["prefs:me", "plans:me"]);
});

test("preview syncs its own plans on its fake, and reuses them when a call passes none", async () => {
  const h = syncHarness();
  const localPlans = [{ id: "local", title: "Picnic", starts_at: source("x", 48).starts_at, status: "active" }];
  await h.sync.sync({ userId: "me", preview: true, localPlans });
  assert.deepEqual(h.ids(h.previewPhone), ["local:1d", "local:1h"]);
  assert.deepEqual(h.ids(), []);
  assert.deepEqual(h.reads, ["prefs:preview"]);
  h.prefs.muted = ["local"];
  await h.sync.sync({ userId: "me", preview: true });
  assert.deepEqual(h.ids(h.previewPhone), []);
  h.prefs.muted = [];
  await h.sync.sync({ userId: "me", preview: true });
  assert.deepEqual(h.ids(h.previewPhone), ["local:1d", "local:1h"]);
  await h.sync.clear("preview");
  await h.sync.sync({ userId: "me", preview: true });
  assert.deepEqual(h.ids(h.previewPhone), []);
});

test("a newer sync supersedes an older one that hasn't reached the phone", async () => {
  const h = syncHarness();
  const slow = deferred<ReminderSource[]>();
  h.setSources(() => slow.promise);
  const older = h.sync.sync({ userId: "me", preview: false });
  await new Promise((r) => setImmediate(r));
  h.setSources(async () => [source("newer", 48)]);
  const newer = h.sync.sync({ userId: "me", preview: false });
  slow.resolve([source("older", 48)]);
  await Promise.all([older, newer]);
  assert.deepEqual(h.ids(), ["newer:1d", "newer:1h"]);
  assert.equal(h.changes.some((change) => change.includes("older")), false);
});

test("sign-out clears after a sync in flight, and that sync can't add reminders back", async () => {
  const h = syncHarness();
  const slow = deferred<ReminderSource[]>();
  h.setSources(() => slow.promise);
  const inFlight = h.sync.sync({ userId: "me", preview: false });
  await new Promise((r) => setImmediate(r));
  const cleared = h.sync.clear("me");
  slow.resolve([source("p1", 48)]);
  await Promise.all([inFlight, cleared]);
  assert.deepEqual(h.ids(), []);
  assert.deepEqual(h.changes, []);
});

// The real phone's boundary, run against a recording stand-in for expo-notifications (as nativeImports.test.ts).
function loadNative() {
  const calls: unknown[][] = [];
  const at = Date.UTC(2099, 0, 1, 9);
  const notifications = {
    SchedulableTriggerInputTypes: { DATE: "date" },
    getPermissionsAsync: async () => ({ status: "granted", ios: { status: 2 } }),
    requestPermissionsAsync: async (request: unknown) => {
      calls.push(["request", request]);
      return { status: "granted", ios: { status: 3 } };
    },
    getAllScheduledNotificationsAsync: async () => [
      {
        identifier: `${REMINDER_PREFIX}p1:1h`,
        content: { body: "In 1 hour · Picnic", data: { planId: "p1", at } },
        trigger: { type: "timeInterval", seconds: 3600, repeats: false },
      },
    ],
    scheduleNotificationAsync: async (request: unknown) => {
      calls.push(["schedule", request]);
      return "id";
    },
    cancelScheduledNotificationAsync: async (id: string) => {
      calls.push(["cancel", id]);
    },
    getPresentedNotificationsAsync: async () => [{ request: { identifier: `${REMINDER_PREFIX}p0:1h` } }],
    dismissNotificationAsync: async (id: string) => {
      calls.push(["dismiss", id]);
    },
  };
  const source = readFileSync(new URL("./reminders.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === "../domain/reminders") return domain;
      if (name === "./notifications") return notificationsService;
      if (name === "./deviceMirror") return mirrorModule;
      if (name === "react-native") return { Platform: { OS: "ios" } };
      if (name === "expo-notifications") return notifications;
      throw Error(`Unexpected import: ${name}`);
    },
  });
  return { adapter: exports.nativeReminderAdapter() as ReminderAdapter, calls, at };
}

test("the phone gets a dated reminder with the default sound and no badge, carrying its plan and time, and reads it back", async () => {
  const { adapter, calls, at } = loadNative();
  const service = createReminderService(adapter);
  assert.equal(await service.request(), "provisional");
  await service.sync([
    { id: `${REMINDER_PREFIX}p1:1h`, planId: "p1", at: new Date(at), body: "In 1 hour · Picnic" },
    { id: `${REMINDER_PREFIX}p2:1d`, planId: "p2", at: new Date(at + 1000), body: "Tomorrow at 10:00 · Walk" },
  ]);
  await service.clearAll();
  // Objects made in the module's own context: compare them as plain data.
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["request", { ios: { allowAlert: true, allowSound: true, allowBadge: false } }],
    // p1:1h is already on the phone with the same time and text, so only p2 is scheduled.
    [
      "schedule",
      {
        identifier: `${REMINDER_PREFIX}p2:1d`,
        content: { body: "Tomorrow at 10:00 · Walk", sound: "default", data: { planId: "p2", at: at + 1000 } },
        trigger: { type: "date", date: new Date(at + 1000).toISOString() },
      },
    ],
    ["cancel", `${REMINDER_PREFIX}p1:1h`],
    ["dismiss", `${REMINDER_PREFIX}p0:1h`],
  ]);
});

// The root layout's foreground handler (deviceReminders.ts), run with recording stand-ins for its imports.
test("while Resbite is open, a reminder shows as a banner without sound or badge; other notifications stay hidden", async () => {
  const calls: unknown[][] = [];
  let handler: { handleNotification: (n: unknown) => Promise<Record<string, boolean>> } | null = null;
  const notifications = {
    setNotificationHandler: (next: typeof handler) => {
      handler = next;
    },
    getLastNotificationResponse: () => null,
    clearLastNotificationResponse: () => calls.push(["clear"]),
    addNotificationResponseReceivedListener: () => ({ remove: () => calls.push(["remove"]) }),
  };
  const source = readFileSync(new URL("./deviceReminders.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === "react-native") return { Platform: { OS: "ios" } };
      if (name === "expo-notifications") return notifications;
      if (name === "../domain/reminders") return domain;
      if (name === "./supabase") return { storage: {}, supabase: {} };
      if (name === "./plans") return { withDeadline: () => undefined };
      if (name === "./reminderPrefsStore") return { createReminderPrefsStore: () => ({}) };
      if (name === "./reminders")
        return {
          createFakeReminderAdapter: () => ({}),
          createReminderService: () => ({}),
          createReminderSync: () => ({}),
          reminderTapPlan,
        };
      throw Error(`Unexpected import: ${name}`);
    },
  });
  const stop = exports.listenForReminders(() => {});
  const show = (identifier: string) => handler!.handleNotification({ request: { identifier, content: {} } });
  assert.deepEqual(JSON.parse(JSON.stringify(await show(`${REMINDER_PREFIX}p1:1h`))), {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await show("someone-else"))), {
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
  stop();
  assert.equal(handler, null);
  assert.deepEqual(calls, [["remove"]]);
});
