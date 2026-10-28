import type { KeyStore } from "./secureChunks";
import { permissionFrom, type NotificationPermissionResponse } from "./notifications";
import {
  createPushRegistration,
  isUnreadableRecord,
  type PushContext,
  type PushJournal,
  type PushRegistrationAdapter,
} from "./pushRegistration";

// Plan 4: this phone's push endpoint (an Expo push token) for the signed-in account. Registered whenever a
// real session exists and notifications are allowed, including an account still waiting for access (it is
// sent the host's approval); removed with that account's own session before it signs out or another
// account takes the phone; if that session ended without a sign-out here, the next account's registration
// replaces it (the server rebinds the token). It never asks for permission: the ask (Task 5) does, then
// calls reconcile().

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
  /** The account whose session is live on this phone now, or null. */
  liveAccount(): Promise<string | null>;
  /** Rejects with `serverAnswered(status)` when the server answers with an error status (pushRpc). */
  rpc(accessToken: string, name: Rpc, args: Record<string, string>): Promise<void>;
};

/** The server answered a device request with an error status: any HTTP response that isn't 2xx. */
export function serverAnswered(status: number): Error {
  return Object.assign(Error(`Notification setup failed (${status}).`), { serverAnswer: status });
}
/** Whether a device request reached the server and was answered (serverAnswered), as opposed to never reaching
 * it: offline, or no answer in time. */
export const isServerAnswer = (error: unknown): boolean =>
  typeof (error as { serverAnswer?: unknown } | null)?.serverAnswer === "number";

/**
 * The device RPCs over PostgREST, each with the access token it is given. Any HTTP response that isn't 2xx
 * rejects with serverAnswered(status); a request that gets no answer (offline, or none within `timeoutMs`)
 * rejects with fetch's own error.
 */
export function pushRpc(
  url: string,
  key: string,
  send: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 15000,
): PushDeviceDeps["rpc"] {
  return async (accessToken, name, args) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await send(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw serverAnswered(response.status);
  };
}

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
    // A record that can't be read or parsed rejects; the registration treats it as unreadable.
    async readJournal() {
      const raw = await deps.store.getItem(JOURNAL);
      return raw === null ? null : (JSON.parse(raw) as PushJournal);
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
    hasSession: async (account) => (await deps.liveAccount()) === account,
    register: (account, token, platform) =>
      call(account, "register_device", { p_token: token, p_platform: platform }),
    unregister: (account, token) => call(account, "unregister_device", { p_token: token }),
  };
}

/**
 * The registration state for the current session. "disabled" whenever nothing can be registered (switched
 * off, web, preview, signed out), set at once; null only while a real account's state is being checked;
 * otherwise its last outcome.
 */
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
  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  let status: PushStatus = "disabled";
  const listeners = new Set<() => void>();
  const registrable = (c: PushContext) =>
    enabled && adapter.platform !== "web" && Boolean(c.account) && !c.preview;
  const checking = (c: PushContext): PushStatus => (registrable(c) ? null : "disabled");
  const same = (a: PushContext, b: PushContext) =>
    a.account === b.account && a.preview === b.preview;
  const publish = (next: PushStatus) => {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  };

  async function run(): Promise<void> {
    // Sign-out or an account change is removing the endpoint: nothing may register it again meanwhile.
    if (holds || leaving) return;
    if (!registrable(followed)) return publish("disabled");
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

  /** Calls made together share one run. One made while a run is under way gets a single run after it,
   * which later calls share too, so a permission changed meanwhile is still read. */
  function reconcile(): Promise<void> {
    if (holds || leaving) return Promise.resolve();
    if (queued) return queued;
    // Settled either way: a rejection can never leave `queued` or `running` set for good.
    const next = () => {
      queued = null;
      const current = run();
      running = current;
      const settled = () => {
        if (running === current) running = null;
      };
      return current.then(settled, settled);
    };
    const scheduled: Promise<void> = (running ?? Promise.resolve()).then(next, next);
    queued = scheduled;
    return scheduled;
  }

  function follow(next: PushContext, again = false): Promise<void> {
    const changed = !same(next, followed);
    followed = next;
    push.update(next);
    if (changed) {
      generation++;
      publish(checking(next));
    }
    return (changed || again) && registrable(next) ? reconcile() : Promise.resolve();
  }

  function update(next: PushContext): Promise<void> {
    const before = wanted;
    wanted = { account: next.account, preview: next.preview };
    if (leaving) {
      if (!same(wanted, before)) publish(checking(wanted));
      return leaving;
    }
    if (!registrable(followed) || wanted.account === followed.account) return follow(wanted);
    // The session moved to another account, or ended, without signing out here (an email link opened for
    // another account, a session ended on the server). The old account's state never shows for the new
    // one. Remove the endpoint with the leaving account's own session while the registration still
    // follows it, then follow the new session.
    generation++;
    publish(checking(wanted));
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
        if (--holds === 0 && !leaving && registrable(followed)) void reconcile();
      };
    },
    /** Sign-out, before auth sign-out: removes this phone's endpoint with the account's own session. A request
     * that never reached the server (offline, timed out) keeps the journal and fails sign-out; any answer from
     * the server lets it go ahead. Deleting the account forgets it instead, as the server removed the account's
     * endpoints when it accepted the deletion. */
    async clear(deleteAccount: boolean): Promise<void> {
      if (leaving) await leaving;
      try {
        await push.beforeSignOut();
      } catch (error) {
        if (isUnreadableRecord(error)) {
          // A damaged record never locks anyone out of signing out. A token it may have named is cleared by
          // the next registration's rebind, or by the sender on DeviceNotRegistered.
          await adapter.writeJournal(null).catch(() => {});
          return;
        }
        if (isServerAnswer(error)) {
          // The server answered (an error, an expired session, or no such function after a rollback), so
          // retrying can't help, and locking the person in is worse: this phone's part is done. An endpoint
          // still bound on the server is rebound by the next account that registers here.
          await adapter.writeJournal(null).catch(() => {});
          return;
        }
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

type AuthSession = { user: { id: string }; access_token: string } | null;
/** The part of `supabase.auth` the session binding reads. */
export type SessionSource = {
  getSession(): Promise<{ data: { session: AuthSession } }>;
  onAuthStateChange(callback: (event: string, session: AuthSession) => void): unknown;
};

/**
 * Which access token a request for an account carries: the live session's when it is that account's;
 * otherwise the last one this run saw for it before another session replaced it (so it can still remove
 * its own endpoint). Never another account's. An account that signs out is forgotten.
 */
export function createSessionTokens(
  auth: SessionSource,
): Pick<PushDeviceDeps, "sessionFor" | "liveAccount"> {
  const seen = new Map<string, string>();
  let last: string | null = null;
  auth.onAuthStateChange((event, session) => {
    if (session) {
      seen.set(session.user.id, session.access_token);
      last = session.user.id;
    } else if (event === "SIGNED_OUT" && last) {
      seen.delete(last);
      last = null;
    }
  });
  return {
    async sessionFor(account) {
      const { session } = (await auth.getSession()).data;
      if (session?.user.id === account) return session.access_token;
      return seen.get(account) ?? null;
    },
    liveAccount: async () => (await auth.getSession()).data.session?.user.id ?? null,
  };
}

/** The live dependencies: expo-notifications, expo-constants, the secure store and Supabase. Native modules
 * are required lazily, as in notifications.ts, so web and the tests never load them. */
export function nativePushDeps(): PushDeviceDeps {
  const { Platform } = require("react-native") as typeof import("react-native");
  const { supabase, storage } = require("./supabase") as typeof import("./supabase");
  const notifications = () =>
    require("expo-notifications") as typeof import("expo-notifications");
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co";
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured";
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
    ...createSessionTokens(supabase.auth),
    rpc: pushRpc(url, key),
  };
}

type Presented = { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
/** The part of expo-notifications that clears what is shown in Notification Center. */
export type ShownNotifications = {
  getPresentedNotificationsAsync(): Promise<Presented[]>;
  dismissNotificationAsync(identifier: string): Promise<void>;
};

/**
 * Sign-out (sessionLifecycle): dismisses the pushes from Resbite's sender (`data.type` "plan_update") still shown
 * on this phone, so the next account never sees the last one's titles. Reminders go with clearReminders; anything
 * else is left alone. Each one is tried. It rejects when one couldn't be dismissed, or after `waitMs` so it never
 * holds sign-out up; sign-out ignores that.
 */
export async function dismissShownPushes(notifications: ShownNotifications, waitMs = 3000): Promise<void> {
  const work = (async () => {
    let failed = false;
    for (const shown of await notifications.getPresentedNotificationsAsync())
      if (shown.request.content.data?.type === "plan_update")
        await notifications.dismissNotificationAsync(shown.request.identifier).catch(() => {
          failed = true;
        });
    if (failed) throw Error("Some notifications couldn’t be cleared on this phone.");
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("Clearing notifications took too long.")), waitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The live dismissal, through expo-notifications (required lazily). Web shows no pushes. */
export function clearShownPushes(): Promise<void> {
  const { Platform } = require("react-native") as typeof import("react-native");
  if (Platform.OS === "web") return Promise.resolve();
  return dismissShownPushes(require("expo-notifications") as typeof import("expo-notifications"));
}
