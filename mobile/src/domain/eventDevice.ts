import type { NotificationPermission } from "./notifications";

// UX3 event page: the reminders chip and the "Get reminders?" sheet (spec "Calendar and reminders", UX3-D4).
// The calendar chip's wording comes from `needsCalendarUpdate` (calendarEvent.ts).

/** What a tap on the reminders chip does. */
export type ReminderChipAction = "mute" | "unmute" | "ask" | "settings" | "notifications";
export type ReminderChip = { on: boolean; text: string; label: string; hint: string; action: ReminderChipAction };

const off = (action: ReminderChipAction, hint: string): ReminderChip => ({
  on: false,
  text: "Reminders off",
  label: "Reminders off",
  hint,
  action,
});

/**
 * The event's "Reminders on" / "Reminders off" chip. It is on only with the permission (`allowed`), the
 * Notifications switch on and this event not muted. A tap mutes or unmutes this event on this phone. When
 * reminders are switched off on Notifications it opens Notifications; when iPhone was never asked ("Not
 * now"), it asks; when the permission is off, it opens Settings.
 */
export function reminderChip(state: {
  permission: NotificationPermission;
  /** Full or quiet permission (`remindersAllowed`). */
  allowed: boolean;
  /** The Notifications screen's "Event reminders" switch. */
  enabled: boolean;
  /** This event's reminders are switched off on this phone. */
  muted: boolean;
}): ReminderChip {
  if (!state.enabled) return off("notifications", "Opens Notifications, where reminders are switched off");
  if (state.allowed)
    return state.muted
      ? off("unmute", "Turns reminders on for this resbite")
      : {
          on: true,
          text: "Reminders on",
          label: "Reminders on, 1 day and 1 hour before",
          hint: "Turns reminders off for this resbite",
          action: "mute",
        };
  if (state.permission === "undetermined") return off("ask", "Asks to allow reminders");
  return off("settings", "Opens Settings to allow notifications");
}

/**
 * "Get reminders?" is shown once, before iPhone's own prompt: only while the permission was never asked
 * for, the sheet hasn't been shown on this phone and reminders aren't switched off.
 */
export function shouldAskForReminders(state: {
  permission: NotificationPermission;
  asked: boolean;
  enabled: boolean;
}): boolean {
  return state.permission === "undetermined" && !state.asked && state.enabled;
}

export const GET_REMINDERS_LINE =
  "Resbite can remind you 1 day and 1 hour before your resbites. Reminders are set on this phone, and only show the name and time.";

/**
 * Controller ruling P10: iPhone's add-event form opens without a permission only on iOS 17 or later; older
 * versions (and a form that is already open) make it fail. Resbite never asks for calendar access.
 */
export const CALENDAR_OPEN_FAILED = "We couldn’t open your calendar. Add to calendar needs iOS 17 or later.";
export const REMINDERS_CHANGE_FAILED = "Couldn’t change reminders on this phone. Try again.";
