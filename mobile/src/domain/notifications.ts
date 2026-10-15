export type NotificationPermission =
  | "undetermined"
  | "denied"
  | "granted"
  | "provisional"
  | "ephemeral"
  | "unknown"
  | "preview"
  | "unsupported";

// Keep delivery unavailable until credentials, endpoint removal, the worker and
// authenticated tap routing have all been implemented and verified together. This is the server's
// sending (updates from organizers); UX3 reminders are set on the phone and don't depend on it.
export const notificationDelivery = {
  enabled: false,
  label: "Updates from organizers aren’t active yet",
  detail:
    "This build does not send plan or RSVP notifications. Open My resbites to check the latest details and responses.",
} as const;

// UX3 (approved with the spec): reminders now use the permission, so the wording no longer says
// there's nothing to enable or that nothing can arrive. Titles are unchanged.
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
    detail:
      "Turn notifications on in Settings to get reminders. Updates from organizers aren’t active yet.",
  },
  granted: {
    title: "Permission is allowed",
    detail:
      "Reminders can reach you. Updates from organizers aren’t active yet.",
  },
  provisional: {
    title: "Quiet permission",
    detail:
      "Reminders arrive quietly. Updates from organizers aren’t active yet.",
  },
  ephemeral: {
    title: "Temporary permission",
    detail:
      "Reminders can reach you for now. Updates from organizers aren’t active yet.",
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

/** UX3 Notifications screen: the "Event reminders" switch's line and the ⓘ sheet's reminders paragraph. */
export const reminderCopy = {
  line: "1 day and 1 hour before resbites you’re going to, or might. Set on this phone.",
  about:
    "Reminders are set on this phone when you answer Going or Maybe, or organize a resbite. If an organizer changes the time and you don’t open Resbite before the old reminder, it may still arrive at the old time.",
} as const;
