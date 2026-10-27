import type { KeyStore } from "./secureChunks";
import { permissionFrom, type NotificationPermissionResponse } from "./notifications";
import {
  createPushRegistration,
  type PushContext,
  type PushJournal,
  type PushRegistrationAdapter,
} from "./pushRegistration";

// Plan 4: this phone's push endpoint (an Expo push token) for the signed-in account. Registered whenever a
// real session exists and notifications are allowed, including an account still waiting for access (it is
// sent the host's approval); removed with that account's own session before it signs out or another
// account takes the phone. It never asks for permission: the ask (Task 5) does, then calls reconcile().

/** The release switch: `EXPO_PUBLIC_PUSH_ENABLED=true`. Unset (tests, web QA) means off. */
export const pushEnabled = (): boolean =>
  process.env.EXPO_PUBLIC_PUSH_ENABLED === "true";

const JOURNAL = "resbite.push-endpoint";
type Rpc = "register_device" | "unregister_device";

export type PushDeviceDeps = {
  platform: string;
  /** Device-local secure storage: the app's Keychain/Keystore store (secureChunks). */
  store: KeyStore;
  notifications: {
    getPermissionsAsync(): Promise<NotificationPermissionResponse>;
    getExpoPushTokenAsync(options: { projectId: string }): Promise<{ data: string }>;
  };
  /** The EAS project id the token is attributed to (expo-constants, `expoConfig.extra.eas.projectId`). */
  projectId(): string | undefined;
  /** This account's access token: its live session, or the last one this run saw for it once another
   * session replaced it. Null when there is none. Never another account's. */
  sessionFor(account: string): Promise<string | null>;
  rpc(accessToken: string, name: Rpc, args: Record<string, string>): Promise<void>;
};

export function createPushDeviceAdapter(deps: PushDeviceDeps): PushRegistrationAdapter {
  const platform =
    deps.platform === "ios" || deps.platform === "android" ? deps.platform : "web";
  // Each request carries the session of the account it is for, captured when it is sent.
  async function call(account: string, name: Rpc, args: Record<string, string>) {
    const accessToken = await deps.sessionFor(account);
    if (!accessToken) throw Error("Sign in again to update notifications on this phone.");
    await deps.rpc(accessToken, name, args);
  }
  return {
    platform,
    async readJournal() {
      const raw = await deps.store.getItem(JOURNAL);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as PushJournal;
      } catch {
        throw Error("Notification cleanup record is invalid.");
      }
    },
    writeJournal: (value) =>
      value ? deps.store.setItem(JOURNAL, JSON.stringify(value)) : deps.store.removeItem(JOURNAL),
    readPermission: async () =>
      permissionFrom(deps.platform, await deps.notifications.getPermissionsAsync()),
    async readToken() {
      const projectId = deps.projectId();
      if (!projectId) throw Error("This build has no project id for notifications.");
      return (await deps.notifications.getExpoPushTokenAsync({ projectId })).data;
    },
    register: (account, token, platform) =>
      call(account, "register_device", { p_token: token, p_platform: platform }),
    unregister: (account, token) => call(account, "unregister_device", { p_token: token }),
  };
}

/** The last registration outcome for the current session; null until one has settled. */
export type PushStatus = "registered" | "permission-off" | "disabled" | "failed" | null;

/**
 * The one push registration on this phone, following the session. `update` runs on every session change
 * and registers after a sign-in; `reconcile` runs on foreground and after the permission changes. Sign-out
 * (sessionLifecycle) holds it and clears it before auth sign-out. `update` and `reconcile` never reject.
 */
export function createPushSession(adapter: PushRegistrationAdapter, enabled: boolean) {
  const push = createPushRegistration(adapter, enabled);
  let wanted: PushContext = { account: null, preview: false };
  let followed: PushContext = wanted;
  let generation = 0;
  let holds = 0;
  let leaving: Promise<void> | null = null;
  let status: PushStatus = null;
  const listeners = new Set<() => void>();
  const real = (c: PushContext) => Boolean(c.account) && !c.preview;
  const publish = (next: PushStatus) => {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  };

  async function reconcile(): Promise<void> {
    // Sign-out or an account change is removing the endpoint: nothing may register it again meanwhile.
    if (holds || leaving) return;
    const mine = generation;
    let next: PushStatus;
    try {
      const result = await push.reconcile();
      next = result === "registered" || result === "permission-off" ? result : "disabled";
    } catch {
      next = "failed";
    }
    if (mine === generation) publish(next);
  }

  function follow(next: PushContext, again = false): Promise<void> {
    const changed = next.account !== followed.account || next.preview !== followed.preview;
    followed = next;
    push.update(next);
    if (changed) {
      generation++;
      publish(null);
    }
    return (changed || again) && real(next) ? reconcile() : Promise.resolve();
  }

  function update(next: PushContext): Promise<void> {
    wanted = { account: next.account, preview: next.preview };
    if (leaving) return leaving;
    if (!real(followed) || wanted.account === followed.account) return follow(wanted);
    // The session moved to another account, or ended, without signing out here (an email link opened for
    // another account, a session ended on the server). Remove the endpoint with the leaving account's own
    // session while the registration still follows it, then follow the new session.
    const done: Promise<void> = push
      .beforeSignOut()
      .then(
        () => {},
        () => {},
      )
      .then(() => {
        leaving = null;
        return follow(wanted, true);
      });
    leaving = done;
    return done;
  }

  return {
    update,
    reconcile,
    /** Sign-out: no registration starts until the release. A sign-out that failed registers again. */
    hold(): () => void {
      holds++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--holds === 0 && !leaving && real(followed)) void reconcile();
      };
    },
    /** Sign-out, before auth sign-out: removes this phone's endpoint with the account's own session. An
     * offline failure keeps the journal and fails sign-out; deleting the account forgets it instead, as the
     * server removed the account's endpoints when it accepted the deletion. */
    async clear(deleteAccount: boolean): Promise<void> {
      if (leaving) await leaving;
      try {
        await push.beforeSignOut();
      } catch (error) {
        if (!deleteAccount) throw error;
        await adapter.writeJournal(null);
      }
    },
    status: (): PushStatus => status,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type PushSession = ReturnType<typeof createPushSession>;

/** The live dependencies: expo-notifications, expo-constants, the secure store and Supabase. Native modules
 * are required lazily, as in notifications.ts, so web and the tests never load them. */
export function nativePushDeps(): PushDeviceDeps {
  const { Platform } = require("react-native") as typeof import("react-native");
  const { supabase, storage } = require("./supabase") as typeof import("./supabase");
  const notifications = () =>
    require("expo-notifications") as typeof import("expo-notifications");
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co";
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured";
  // Each account's latest access token this run, so a session that another one replaced can still remove
  // its own endpoint.
  const seen = new Map<string, string>();
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) seen.set(session.user.id, session.access_token);
  });
  return {
    platform: Platform.OS,
    store: storage,
    notifications: {
      getPermissionsAsync: () => notifications().getPermissionsAsync(),
      getExpoPushTokenAsync: (options) => notifications().getExpoPushTokenAsync(options),
    },
    projectId: () => {
      const { default: Constants } = require("expo-constants") as typeof import("expo-constants");
      return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    },
    async sessionFor(account) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id === account) return data.session.access_token;
      return seen.get(account) ?? null;
    },
    async rpc(accessToken, name, args) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
          signal: controller.signal,
        });
        if (!response.ok) throw Error(`Notification setup failed (${response.status}).`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
