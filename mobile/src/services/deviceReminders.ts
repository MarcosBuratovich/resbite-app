import { Platform } from "react-native";
import { storage, supabase } from "./supabase";
import { withDeadline } from "./plans";
import type { NotificationPermission } from "../domain/notifications";
import { REMINDER_PREFIX } from "../domain/reminders";
import { createReminderPrefsStore, type ReminderPrefs } from "./reminderPrefsStore";
import {
  createFakeReminderAdapter,
  createReminderService,
  createReminderSync,
  deviceScope,
  nativeReminderAdapter,
  reminderSources,
  reminderTapPlan,
  type ReminderScope,
  type ReminderService,
} from "./reminders";

export type { ReminderScope } from "./reminders";
export type { ReminderPrefs } from "./reminderPrefsStore";

// UX3 reminders on this phone. Native uses expo-notifications; web and preview use the in-memory fake
// (the plan's "Device fakes" rule). Preview never reads the server.
const prefs = createReminderPrefsStore(storage);
const fake = createReminderService(createFakeReminderAdapter());
let native: ReminderService | undefined;
const serviceFor = (preview: boolean) =>
  preview || Platform.OS === "web" ? fake : (native ??= createReminderService(nativeReminderAdapter()));

/** The person's upcoming events: the ones they organize, and the ones they're invited to with their answer. */
async function readSources(userId: string, now: Date) {
  const [plans, answers] = await Promise.all([
    withDeadline((signal) =>
      supabase
        .from("plans")
        .select("id,title,starts_at,status,owner_id")
        .eq("status", "active")
        .gt("starts_at", now.toISOString())
        .abortSignal(signal),
    ),
    withDeadline((signal) =>
      supabase.from("attendees").select("plan_id,response").eq("user_id", userId).abortSignal(signal),
    ),
  ]);
  if (plans.error) throw plans.error;
  if (answers.error) throw answers.error;
  return reminderSources(plans.data ?? [], answers.data ?? [], { userId, preview: false });
}

const reminders = createReminderSync({ service: serviceFor, prefs: (scope) => prefs.read(scope), readSources });

/**
 * Reconciles this phone's reminders with the person's events: when Resbite opens or comes back, and after
 * any answer, edit, cancellation or event load. It never asks for permission. Callers may ignore failures
 * (`void syncReminders(scope).catch(() => {})`); the next sync retries.
 */
export const syncReminders = (scope: ReminderScope): Promise<void> => reminders.sync(scope);

/** The reminder permission on this phone (on web and in preview, the fake's). */
export const reminderPermission = (scope: Pick<ReminderScope, "preview">): Promise<NotificationPermission> =>
  serviceFor(scope.preview).permission();

/** "Turn on notifications" (and the reminders chip): shows iPhone's prompt when it hasn't been answered, then
 * schedules. Returns the result. Plan 4: callers then register for push (reconcilePush). */
export async function askForReminders(scope: ReminderScope): Promise<NotificationPermission> {
  const permission = await serviceFor(scope.preview).request();
  void syncReminders(scope).catch(() => {});
  return permission;
}

const prefsScope = (scope: ReminderScope) => {
  const key = deviceScope(scope);
  if (!key) throw Error("Sign in to change reminders.");
  return key;
};

/** The person's reminder switches on this phone; the defaults when signed out. */
export const remindersFor = (scope: ReminderScope): Promise<ReminderPrefs> => {
  const key = deviceScope(scope);
  return key ? prefs.read(key) : Promise.resolve({ enabled: true, muted: [], asked: false });
};

/** The "Event reminders" switch. Re-syncs, so turning it off removes them and on sets them again. */
export async function setRemindersEnabled(
  scope: ReminderScope,
  on: boolean,
  assertCurrent?: () => void,
): Promise<ReminderPrefs> {
  const next = await prefs.setEnabled(prefsScope(scope), on, assertCurrent);
  void syncReminders(scope).catch(() => {});
  return next;
}

/** One event's "Reminders on" / "Reminders off" chip. Re-syncs. */
export async function muteReminders(
  scope: ReminderScope,
  planId: string,
  muted: boolean,
  assertCurrent?: () => void,
): Promise<ReminderPrefs> {
  const next = await prefs.setMuted(prefsScope(scope), planId, muted, assertCurrent);
  void syncReminders(scope).catch(() => {});
  return next;
}

/** Records that the notification ask ("Get notified?", once "Get reminders?") was shown, so it's shown once. */
export const markRemindersAsked = (scope: ReminderScope, assertCurrent?: () => void): Promise<ReminderPrefs> =>
  prefs.markAsked(prefsScope(scope), assertCurrent);

/** Sign-out and account deletion: removes the scope's reminders (scheduled and shown) and its switches. */
export async function clearReminders(scope: string): Promise<void> {
  await reminders.clear(scope);
  await prefs.clear(scope);
}

/**
 * Root layout: shows a reminder that arrives while Resbite is open (banner and list, no sound or badge) and
 * reports taps on reminders, including the one that opened the app. Plan-update pushes are shown too (their taps go to usePushRouting); others are left alone.
 * Returns the cleanup. Web has no notifications.
 */
export function listenForReminders(open: (planId: string) => void): () => void {
  if (Platform.OS === "web") return () => {};
  const notifications = require("expo-notifications") as typeof import("expo-notifications");
  notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Reminders, and plan-update pushes from the sender (UX2-D4 wording); nothing else.
      const ours =
        notification.request.identifier.startsWith(REMINDER_PREFIX) ||
        notification.request.content.data?.type === "plan_update";
      return { shouldShowBanner: ours, shouldShowList: ours, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
  const tapped = (response: Parameters<typeof reminderTapPlan>[0]) => {
    const planId = reminderTapPlan(response);
    if (planId) open(planId);
  };
  // Cold start: the tap that launched the app. Cleared once handled, so a remount never repeats it.
  const launch = notifications.getLastNotificationResponse();
  // A push tap is left for usePushRouting.
  if (launch && reminderTapPlan(launch)) {
    notifications.clearLastNotificationResponse();
    tapped(launch);
  }
  const subscription = notifications.addNotificationResponseReceivedListener(tapped);
  return () => {
    subscription.remove();
    notifications.setNotificationHandler(null);
  };
}
