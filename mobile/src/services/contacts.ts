import { person, mergePeople } from "../domain/people";

type ContactPermission = {
  granted: boolean;
  accessPrivileges?: "all" | "limited" | "none";
};
type ContactRow = {
  fullName?: string | null;
  emails?: { address?: string | null }[];
  phones?: { number?: string | null }[];
};
export type ContactAdapter = {
  platform: string;
  getPermission(): Promise<ContactPermission>;
  requestPermission(): Promise<ContactPermission>;
  read(offset: number, limit: number): Promise<ContactRow[]>;
  expand(): Promise<unknown>;
};
const accessOff =
  "Contacts access is off. You can add a person yourself or share a plan link without contacts.";
const allowed = (permission: ContactPermission) =>
  permission.granted && permission.accessPrivileges !== "none";

// Inject the platform boundary so permission races can be tested without reading
// the device address book. This service never persists contacts or requests access
// except in response to the caller's explicit request flag.
export function createContactService(adapter: ContactAdapter) {
  return {
    async readContactPage(offset = 0, request = false) {
      if (adapter.platform === "web")
        throw Error(
          "Phone contacts are available in the iPhone app. You can add a person below.",
        );
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw Error(
          "Could not load this contacts page. Choose phone contacts again.",
        );
      const permission = request
        ? await adapter.requestPermission()
        : await adapter.getPermission();
      if (!allowed(permission)) throw Error(accessOff);
      const rows = await adapter.read(offset, 50);
      const current = await adapter.getPermission();
      if (!allowed(current)) throw Error(accessOff);
      // Do not expose a page obtained with a broader permission than now granted.
      if (permission.accessPrivileges !== current.accessPrivileges)
        throw Error(
          "Contacts access changed. Choose phone contacts again to refresh.",
        );
      let missing = 0;
      const people = mergePeople(
        ...rows.map((row) => {
          const name = row.fullName?.trim() || "Unnamed contact";
          const options = [
            ...(row.emails ?? []).map((e) => e.address),
            ...(row.phones ?? []).map((p) => p.number),
          ].flatMap((address) => {
            const p = address ? person(name, address) : null;
            return p ? [p] : [];
          });
          if (!options.length) missing++;
          return options;
        }),
      );
      return {
        people,
        missing,
        more: rows.length === 50,
        limited: current.accessPrivileges === "limited",
        nextOffset: offset + rows.length,
      };
    },
    async expandContactAccess() {
      const permission = await adapter.getPermission();
      if (!allowed(permission)) throw Error(accessOff);
      if (
        adapter.platform === "ios" &&
        permission.accessPrivileges === "limited"
      )
        await adapter.expand();
    },
    async hasContactAccess() {
      return (
        adapter.platform !== "web" && allowed(await adapter.getPermission())
      );
    },
  };
}

async function nativeService() {
  // A namespace import evaluates React Native's lazy legacy-module getters,
  // including PushNotificationIOS, whose native emitter is absent in this build.
  // Read only Platform, keeping the native boundary lazy for adapter tests.
  const { Platform } = require("react-native") as typeof import("react-native");
  // Keep the native module in the main bundle rather than a separately loaded
  // development chunk that can retain stale module IDs after Fast Refresh.
  const contacts = require("expo-contacts") as typeof import("expo-contacts");
  return createContactService({
    platform: Platform.OS,
    getPermission: contacts.getPermissionsAsync,
    requestPermission: contacts.requestPermissionsAsync,
    read: (offset, limit) =>
      contacts.Contact.getAllDetails(
        [
          contacts.ContactField.FULL_NAME,
          contacts.ContactField.EMAILS,
          contacts.ContactField.PHONES,
        ],
        // Expo 57.0.5's JS userDefault value disagrees with iOS useDefault.
        // Omitting it uses the native user's default order on both platforms.
        { offset, limit },
      ),
    expand: () => contacts.Contact.presentAccessPicker(),
  });
}
export async function readContactPage(offset = 0, request = false) {
  return (await nativeService()).readContactPage(offset, request);
}
export async function expandContactAccess() {
  return (await nativeService()).expandContactAccess();
}
export async function hasContactAccess() {
  return (await nativeService()).hasContactAccess();
}
