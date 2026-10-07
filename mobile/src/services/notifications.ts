import type { NotificationPermission } from "../domain/notifications";

export type NotificationPermissionResponse = {
  status: string;
  ios?: { status: number };
};
export type NotificationAdapter = {
  platform: string;
  getPermission(): Promise<NotificationPermissionResponse>;
  openSettings(): Promise<void>;
};

// Deliberately no request/token/register/schedule methods at this boundary.
export function createNotificationService(adapter: NotificationAdapter) {
  const supported =
    adapter.platform === "ios" || adapter.platform === "android";
  return {
    async readPermission(preview: boolean): Promise<NotificationPermission> {
      if (preview) return "preview";
      if (!supported) return "unsupported";
      const permission = await adapter.getPermission();
      if (adapter.platform === "ios" && permission.ios) {
        // Expo 57 IosAuthorizationStatus: use the richer iOS status before
        // the generic flag, which cannot distinguish quiet/temporary access.
        const statuses: Record<number, NotificationPermission> = {
          0: "undetermined",
          1: "denied",
          2: "granted",
          3: "provisional",
          4: "ephemeral",
        };
        return statuses[permission.ios.status] ?? "unknown";
      }
      return ["undetermined", "denied", "granted"].includes(permission.status)
        ? (permission.status as NotificationPermission)
        : "unknown";
    },
    async openSettings(preview: boolean) {
      if (preview || !supported)
        throw Error("Open notification settings in the signed-in mobile app.");
      await adapter.openSettings();
    },
  };
}

async function nativeService() {
  // Avoid evaluating unrelated legacy native modules through a namespace import.
  const { Platform, Linking } =
    require("react-native") as typeof import("react-native");
  return createNotificationService({
    platform: Platform.OS,
    getPermission: async () => {
      const notifications =
        require("expo-notifications") as typeof import("expo-notifications");
      return notifications.getPermissionsAsync();
    },
    openSettings: () => Linking.openSettings(),
  });
}
export async function readNotificationPermission(preview: boolean) {
  return (await nativeService()).readPermission(preview);
}
export async function openNotificationSettings(preview: boolean) {
  return (await nativeService()).openSettings(preview);
}
