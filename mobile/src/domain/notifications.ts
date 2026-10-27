import { pushEnabled, type PushStatus } from "../services/pushDevice";

export type NotificationPermission =
  | "undetermined"
  | "denied"
  | "granted"
  | "provisional"
  | "ephemeral"
  | "unknown"
  | "preview"
  | "unsupported";

// Plan 4: the server's sending (updates) follows the build's push switch, `EXPO_PUBLIC_PUSH_ENABLED`
// (pushEnabled). UX3 reminders are set on the phone and don't depend on it.
export const notificationDelivery = {
  get enabled(): boolean {
    return pushEnabled();
  },
  label: "Updates aren’t active yet",
  detail:
    "This build does not send plan or RSVP notifications. Open My resbites to check the latest details and responses.",
};

/** The About sheet: what updates are sent for (the spec's six events, CI "Notifications"). */
export const NOTIFICATION_EVENTS = [
  "A new invitation, to the person invited.",
  "An answer, to the host: “Sam is going.”",
  "A new request to join, to the host.",
  "Approved, to the person who asked. Declined isn’t sent.",
  "A change of time or place, and a cancellation, to the people invited.",
  "A Note to guests.",
] as const;
/** The line before NOTIFICATION_EVENTS, once updates are sent and while they aren't yet. */
export const notificationEventsLead = (delivery: boolean) =>
  delivery ? "Resbite sends updates for:" : "Once updates are on, Resbite sends them for:";

const UPDATES_NOT_ACTIVE = "Updates aren’t active yet.";

// UX3 (approved with the spec): reminders now use the permission, so the wording no longer says
// there's nothing to enable or that nothing can arrive. Titles are unchanged. The details are the wording
// while updates aren't sent; permissionDetail drops "Updates aren’t active yet." once they are.
export const permissionCopy: Record<
  NotificationPermission,
  { title: string; detail: string }
> = {
  undetermined: {
    title: "Not requested",
    detail: "Resbite asks the first time it can set a reminder.",
  },
  denied: {
    title: "Permission is off",
    detail: `Turn notifications on in Settings to get reminders. ${UPDATES_NOT_ACTIVE}`,
  },
  granted: {
    title: "Permission is allowed",
    detail: `Reminders can reach you. ${UPDATES_NOT_ACTIVE}`,
  },
  provisional: {
    title: "Quiet permission",
    detail: `Reminders arrive quietly. ${UPDATES_NOT_ACTIVE}`,
  },
  ephemeral: {
    title: "Temporary permission",
    detail: `Reminders can reach you for now. ${UPDATES_NOT_ACTIVE}`,
  },
  unknown: {
    title: "Permission unavailable",
    detail: "We couldn’t identify the current permission. Try checking again.",
  },
  preview: {
    title: "Design preview",
    detail:
      "Preview does not read or request notification permission, or send notifications.",
  },
  unsupported: {
    title: "Available in the mobile app",
    detail:
      "Notification permission is managed on your phone. Browser preview does not request it.",
  },
};

/** The permission's line on Notification settings. Once updates are sent, the Updates card says their state. */
export function permissionDetail(permission: NotificationPermission, delivery: boolean): string {
  const { detail } = permissionCopy[permission];
  return delivery ? detail.replace(` ${UPDATES_NOT_ACTIVE}`, "") : detail;
}

/** UX3 Notifications screen: the "Event reminders" switch's line and the ⓘ sheet's reminders paragraph. */
export const reminderCopy = {
  line: "1 day and 1 hour before resbites you’re going to, or might. Set on this phone.",
  about:
    "Reminders are set on this phone when you answer Going or Maybe, or organize a resbite. If an organizer changes the time and you don’t open Resbite before the old reminder, it may still arrive at the old time.",
} as const;

/**
 * Plan 4: the one notification ask (iPhone has one permission for updates and reminders). It replaces UX3's
 * "Get reminders?" and keeps its device flag. "Turn on notifications" shows iPhone's prompt; "Not now"
 * never blocks anything.
 */
export const NOTIFICATION_ASK = {
  title: "Get notified?",
  body: "Resbite can tell you when people answer or ask to join, when a resbite changes or gets a note, and before it starts.",
  turnOn: "Turn on notifications",
  notNow: "Not now",
} as const;
/** iPhone's prompt couldn't be shown or read (as REMINDERS_CHANGE_FAILED for the reminders chip). */
export const NOTIFICATIONS_TURN_ON_FAILED = "Couldn’t turn on notifications on this phone. Try again.";

/** When the ask may come (spec "Notifications": after the first answer or the first created event). */
export type AskMoment = {
  /** The organizer, on the event page. */
  owner?: boolean;
  /** Just created an event: My resbites with `created=1`. */
  created?: boolean;
  /**
   * The person's answer: theirs on the event page, or the one just confirmed from an Invitations row or the
   * open link's waiting screen. Going ("accepted") and Maybe bring the ask; Can’t go never does.
   */
  response?: string | null;
};

/** Whether this is a moment for the ask, before reading the phone. */
export const askMoment = (moment: AskMoment): boolean =>
  moment.owner === true || moment.created === true || moment.response === "accepted" || moment.response === "maybe";

/**
 * The ask shows once: at a moment for it, while iPhone's permission was never asked for and the ask was
 * never shown on this phone (`asked`, the reminder switches' flag). Showing it sets the flag.
 */
export function shouldAsk(state: AskMoment & { permission: NotificationPermission; asked: boolean }): boolean {
  return state.permission === "undetermined" && !state.asked && askMoment(state);
}

/** What the Updates card's button does. */
export type UpdatesAction = "settings" | "turn-on" | "retry";
/** `on` only when updates can reach this phone; `action` is the card's one button. */
export type UpdatesChip = { text: string; on: boolean; action: UpdatesAction | null };
export const UPDATES_ACTIONS: Record<UpdatesAction, { text: string; label: string }> = {
  settings: { text: "Settings", label: "Open device settings" },
  "turn-on": { text: NOTIFICATION_ASK.turnOn, label: NOTIFICATION_ASK.turnOn },
  retry: { text: "Try again", label: "Try setting up notifications again" },
};

const allowed = (permission: NotificationPermission) =>
  permission === "granted" || permission === "provisional" || permission === "ephemeral";

/**
 * Notification settings' Updates chip: the real state. Never alarming: a registration still being checked
 * reads "Checking…", and one that failed (a missing profile can fail it for a moment; it is retried on the
 * next foreground) reads "Not set up yet" with Try again.
 */
export function updatesChip(state: {
  /** `notificationDelivery.enabled`: this build sends updates. */
  enabled: boolean;
  /** This phone's permission, or null while it is read. */
  permission: NotificationPermission | null;
  /** The push registration for the current session (usePushRegistration). */
  push: PushStatus;
}): UpdatesChip {
  const { enabled, permission, push } = state;
  const off = (text: string, action: UpdatesAction | null = null): UpdatesChip => ({ text, on: false, action });
  // Switched off, or nothing can be registered: preview, web, signed out.
  if (!enabled || push === "disabled") return off("Not active yet");
  if (permission === "denied") return off("Off in Settings", "settings");
  if (permission === "undetermined") return off("Not asked yet", "turn-on");
  if (permission === null || push === null) return off("Checking…");
  if (allowed(permission)) {
    if (push === "registered") return { text: "On", on: true, action: null };
    // Allowed in Settings a moment ago: the foreground's registration (or the prompt's) catches up.
    if (push === "permission-off") return off("Checking…");
  }
  return off("Not set up yet", "retry");
}
