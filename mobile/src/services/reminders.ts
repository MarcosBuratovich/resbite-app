import type { NotificationPermission } from "../domain/notifications";
import {
  plannedReminders,
  REMINDER_PREFIX,
  reminderChanges,
  type Reminder,
  type ReminderSource,
  type ScheduledReminder,
} from "../domain/reminders";
import { permissionFrom, type NotificationPermissionResponse } from "./notifications";
import { deviceMirror, type DeviceMirror } from "./deviceMirror";
import type { ReminderPrefs } from "./reminderPrefsStore";

// UX3 reminders (spec "Calendar and reminders", the plan's "Device fakes" rule): local notifications scheduled on this
// phone, 1 day and 1 hour before the start. Only identifiers starting with REMINDER_PREFIX are ever touched.

export type ReminderAdapter = {
  platform: string;
  getPermission(): Promise<NotificationPermissionResponse>;
  /** Shows iPhone's prompt when it hasn't been answered; never called without the person asking. */
  requestPermission(): Promise<NotificationPermissionResponse>;
  scheduled(): Promise<ScheduledReminder[]>;
  schedule(reminder: Reminder): Promise<void>;
  cancel(id: string): Promise<void>;
  /** Identifiers of notifications already delivered and still in Notification Center. */
  delivered(): Promise<string[]>;
  dismiss(id: string): Promise<void>;
};

/** Reminders are scheduled only with full or quiet permission. */
export const remindersAllowed = (permission: NotificationPermission) =>
  permission === "granted" || permission === "provisional";

export function createReminderService(adapter: ReminderAdapter) {
  return {
    permission: async (): Promise<NotificationPermission> =>
      permissionFrom(adapter.platform, await adapter.getPermission()),
    request: async (): Promise<NotificationPermission> =>
      permissionFrom(adapter.platform, await adapter.requestPermission()),
    /** Makes the phone hold exactly `wanted`: cancels stale or changed reminders, then schedules missing ones. */
    async sync(wanted: readonly Reminder[]): Promise<void> {
      const { cancel, schedule } = reminderChanges(await adapter.scheduled(), wanted);
      let failed = false;
      // One failure doesn't stop the rest; the next sync retries whatever is still different.
      for (const id of cancel) await adapter.cancel(id).catch(() => (failed = true));
      for (const reminder of schedule) await adapter.schedule(reminder).catch(() => (failed = true));
      if (failed) throw Error("Some reminders couldn’t be updated on this phone.");
    },
    /** Sign-out: removes every Resbite reminder, scheduled or already shown. Failures are reported. */
    async clearAll(): Promise<void> {
      for (const { id } of await adapter.scheduled())
        if (id.startsWith(REMINDER_PREFIX)) await adapter.cancel(id);
      for (const id of await adapter.delivered())
        if (id.startsWith(REMINDER_PREFIX)) await adapter.dismiss(id);
    },
  };
}
export type ReminderService = ReturnType<typeof createReminderService>;

/** When a scheduled reminder fires. iOS turns a date trigger into a time interval, so the time is kept in its data. */
export function scheduledAt(request: { content: { data?: Record<string, unknown> | null }; trigger: unknown }): number | null {
  const at = request.content.data?.at;
  if (typeof at === "number" && Number.isFinite(at)) return at;
  // Android reports a date trigger as { type: "date", value }.
  const trigger = request.trigger as { type?: unknown; value?: unknown } | null;
  return trigger?.type === "date" && typeof trigger.value === "number" ? trigger.value : null;
}

/** The plan a tapped notification opens: only Resbite reminders, and only with a plan id. */
export function reminderTapPlan(
  response: { notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } } } | null,
): string | null {
  const request = response?.notification.request;
  if (!request?.identifier.startsWith(REMINDER_PREFIX)) return null;
  const planId = request.content.data?.planId;
  return typeof planId === "string" && planId !== "" ? planId : null;
}

/** The real phone, through expo-notifications (already installed; local notifications need no push setup). */
export function nativeReminderAdapter(): ReminderAdapter {
  // Avoid evaluating unrelated legacy native modules through a namespace import.
  const { Platform } = require("react-native") as typeof import("react-native");
  const notifications = () => require("expo-notifications") as typeof import("expo-notifications");
  return {
    platform: Platform.OS,
    getPermission: () => notifications().getPermissionsAsync(),
    requestPermission: () =>
      notifications().requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
    async scheduled() {
      return (await notifications().getAllScheduledNotificationsAsync()).map((request) => ({
        id: request.identifier,
        at: scheduledAt(request),
        body: request.content.body ?? "",
      }));
    },
    async schedule(reminder) {
      const native = notifications();
      await native.scheduleNotificationAsync({
        identifier: reminder.id,
        // The default sound when it arrives in the background (plan decision P9); the foreground handler
        // keeps it silent while Resbite is open (listenForReminders).
        content: {
          body: reminder.body,
          sound: "default",
          data: { planId: reminder.planId, at: reminder.at.getTime() },
        },
        trigger: { type: native.SchedulableTriggerInputTypes.DATE, date: reminder.at },
      });
    },
    cancel: (id) => notifications().cancelScheduledNotificationAsync(id),
    async delivered() {
      return (await notifications().getPresentedNotificationsAsync()).map((n) => n.request.identifier);
    },
    dismiss: (id) => notifications().dismissNotificationAsync(id),
  };
}

/**
 * Web and preview: reminders kept in memory, never shown. The permission starts unanswered and the first
 * request allows it, as a phone would. In development builds it all shows on `globalThis.__resbiteDevice`.
 */
export function createFakeReminderAdapter(mirror: DeviceMirror | null = deviceMirror()): ReminderAdapter {
  const reminders = new Map<string, Reminder>();
  // In development the mirror holds the permission, so a QA script can change it.
  let permission: DeviceMirror["permission"] = "undetermined";
  const current = () => mirror?.permission ?? permission;
  const publish = () => {
    if (!mirror) return;
    const list = [...reminders.values()]
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((r) => ({ id: r.id, at: r.at.toISOString(), body: r.body }));
    mirror.reminders.splice(0, mirror.reminders.length, ...list);
  };
  return {
    platform: "fake",
    getPermission: async () => ({ status: current() }),
    async requestPermission() {
      if (current() === "undetermined") {
        permission = "granted";
        if (mirror) mirror.permission = "granted";
      }
      return { status: current() };
    },
    scheduled: async () => [...reminders.values()].map((r) => ({ id: r.id, at: r.at.getTime(), body: r.body })),
    async schedule(reminder) {
      reminders.set(reminder.id, reminder);
      publish();
    },
    async cancel(id) {
      reminders.delete(id);
      publish();
    },
    delivered: async () => [],
    dismiss: async () => {},
  };
}

/** A plan as the reminder sync reads it: My resbites' rows, or preview's plans on the device. */
export type ReminderPlanRow = { id: string; title: string; starts_at: string; status: string; owner_id?: string };

/** What reminders are planned from: the person's plans, with their own answer on each. */
export function reminderSources(
  plans: readonly ReminderPlanRow[],
  answers: readonly { plan_id: string; response: string }[],
  who: { userId: string | null; preview: boolean },
): ReminderSource[] {
  const responses = new Map(answers.map((a) => [a.plan_id, a.response]));
  return plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    starts_at: plan.starts_at,
    status: plan.status,
    // Preview has no accounts: everything on the device is the person's own.
    owner: who.preview || (who.userId !== null && plan.owner_id === who.userId),
    response: responses.get(plan.id) ?? null,
  }));
}

/**
 * Who the reminders are for. Preview passes its plans (they live on the device); a call without them reuses
 * the last ones passed. `userId: null` outside preview means signed out: the phone keeps no reminders.
 */
export type ReminderScope = { userId: string | null; preview: boolean; localPlans?: readonly ReminderPlanRow[] };
/** The per-account key for the stores on this device: "preview", the account id, or null when signed out. */
export const deviceScope = (scope: { userId: string | null; preview: boolean }) =>
  scope.preview ? "preview" : scope.userId;

type SyncDependencies = {
  service: (preview: boolean) => ReminderService;
  prefs: (scope: string) => Promise<ReminderPrefs>;
  /** The signed-in person's upcoming plans and their own answers. A failure leaves the phone unchanged. */
  readSources: (userId: string, now: Date) => Promise<ReminderSource[]>;
  now?: () => Date;
};

/**
 * Reconciles the phone's reminders with the person's events. Calls run one at a time and a newer call
 * supersedes an older one that hasn't reached the phone yet. It never asks for permission: without it, or
 * with reminders switched off, the phone keeps none.
 */
export function createReminderSync(deps: SyncDependencies) {
  const now = deps.now ?? (() => new Date());
  let generation = 0;
  let previewPlans: readonly ReminderPlanRow[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  async function wanted(scope: ReminderScope, service: ReminderService, plans: readonly ReminderPlanRow[]) {
    const key = deviceScope(scope);
    if (!key || !remindersAllowed(await service.permission())) return [];
    const prefs = await deps.prefs(key);
    if (!prefs.enabled) return [];
    const at = now();
    const sources =
      scope.preview || !scope.userId
        ? reminderSources(plans, [], scope)
        : await deps.readSources(scope.userId, at);
    return plannedReminders(sources, { now: at, enabled: prefs.enabled, muted: new Set(prefs.muted) });
  }
  return {
    sync(scope: ReminderScope): Promise<void> {
      if (scope.preview && scope.localPlans) previewPlans = scope.localPlans;
      const plans = previewPlans;
      const mine = ++generation;
      return run(async () => {
        if (mine !== generation) return;
        const service = deps.service(scope.preview);
        const reminders = await wanted(scope, service, plans);
        if (mine !== generation) return;
        await service.sync(reminders);
      });
    },
    /** Sign-out: removes every reminder for that scope's phone (or preview's fake), after any sync in flight. */
    clear(scope: string): Promise<void> {
      ++generation;
      if (scope === "preview") previewPlans = [];
      return run(() => deps.service(scope === "preview").clearAll());
    },
  };
}
