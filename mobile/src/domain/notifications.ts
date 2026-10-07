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
// authenticated tap routing have all been implemented and verified together.
export const notificationDelivery = {
  enabled: false,
  label: "Notifications aren’t active yet",
  detail:
    "This build does not send plan or RSVP notifications. Open My resbites to check the latest details and responses.",
} as const;

export const permissionCopy: Record<
  NotificationPermission,
  { title: string; detail: string }
> = {
  undetermined: {
    title: "Not requested",
    detail:
      "We’ll ask when notifications are ready. There’s nothing you need to enable yet.",
  },
  denied: {
    title: "Permission is off",
    detail:
      "You can review Resbite’s permission in your device settings. Enabling it will not start delivery in this build.",
  },
  granted: {
    title: "Permission is allowed",
    detail:
      "Your device allows notifications. Delivery is still unavailable in this build.",
  },
  provisional: {
    title: "Quiet permission",
    detail:
      "Your iPhone allows quiet notifications. Delivery is still unavailable in this build.",
  },
  ephemeral: {
    title: "Temporary permission",
    detail:
      "Your device allows notifications temporarily. Delivery is still unavailable in this build.",
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
