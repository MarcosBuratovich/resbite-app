import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionLifecycle } from "./sessionLifecycle";
import { createPushDeviceAdapter, createPushSession, pushEnabled } from "./pushDevice";

const token = "ExponentPushToken[phone-1]";
const JOURNAL = "resbite.push-endpoint";
const ios = (status: number) => ({ status: status === 2 ? "granted" : "denied", ios: { status } });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// One phone: fake expo-notifications, fake secure storage and a fake RPC, wired the way AppState wires the
// real ones (sessionLifecycle for sign-out, every session change mirrored to the push session).
function phone(options: { platform?: string; enabled?: boolean } = {}) {
  const disk = new Map<string, string>();
  const events: string[] = [];
  const sessions = new Set<string>();
  let permission = ios(2);
  let offline = false;
  let authGate: Promise<void> = Promise.resolve();
  const adapter = createPushDeviceAdapter({
    platform: options.platform ?? "ios",
    store: {
      getItem: async (k) => {
        events.push("storage:read");
        return disk.get(k) ?? null;
      },
      setItem: async (k, v) => {
        disk.set(k, v);
      },
      removeItem: async (k) => {
        disk.delete(k);
      },
    },
    notifications: {
      getPermissionsAsync: async () => {
        events.push("permission:read");
        return permission;
      },
      getExpoPushTokenAsync: async ({ projectId }) => {
        events.push(`token:${projectId}`);
        return { type: "expo", data: token };
      },
    },
    projectId: () => "project-1",
    sessionFor: async (account) => (sessions.has(account) ? `jwt-${account}` : null),
    rpc: async (accessToken, name, args) => {
      if (offline) throw Error("offline");
      events.push([name, accessToken, args.p_token, args.p_platform].filter(Boolean).join(":"));
    },
  });
  const push = createPushSession(adapter, options.enabled ?? true);
  let current: string | null = null;
  const session = (account: string | null) => {
    current = account;
    lifecycle.update({ account, preview: false });
    return push.update({ account, preview: false });
  };
  const lifecycle = createSessionLifecycle({
    suspend: () => {},
    resume: () => {},
    clearPeople: async () => {
      events.push("clear:people");
    },
    clearRecentPlaces: async () => {},
    clearInviteCodes: async () => {},
    clearReminders: async () => {},
    clearCalendarRecords: async () => {},
    clearPhoto: async () => {},
    clearCovers: async () => {},
    clearDrafts: async () => {},
    blockPending: () => () => {},
    clearPending: async () => {},
    blockPush: push.hold,
    clearPush: push.clear,
    authSignOut: async () => {
      await authGate;
      events.push("auth.signOut");
      // supabase-js delivers SIGNED_OUT before signOut() resolves; AppState mirrors it.
      if (current) sessions.delete(current);
      void session(null);
    },
    finish: () => {
      void session(null);
    },
    busy: () => {},
  });
  return {
    push,
    lifecycle,
    events,
    disk,
    journal: () => (disk.has(JOURNAL) ? JSON.parse(disk.get(JOURNAL)!) : null),
    rpc: () => events.filter((e) => e.startsWith("register_device") || e.startsWith("unregister_device") || e === "auth.signOut"),
    signIn(account: string) {
      sessions.add(account);
      return session(account);
    },
    /** Settles whatever the last session change started. */
    settle: () => push.update({ account: current, preview: false }),
    setPermission: (status: number) => {
      permission = ios(status);
    },
    setOffline: (value: boolean) => {
      offline = value;
    },
    holdAuth: (gate: Promise<void>) => {
      authGate = gate;
    },
  };
}

test("permission granted registers this phone for the account, with its session, and journals it", async () => {
  const p = phone();
  await p.signIn("a");
  assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`]);
  assert.ok(p.events.includes("token:project-1"));
  assert.deepEqual(p.journal(), { account: "a", token, phase: "registered" });
  assert.equal(p.push.status(), "registered");
});

test("denied permission registers nothing", async () => {
  const p = phone();
  p.setPermission(1);
  await p.signIn("a");
  assert.deepEqual(p.rpc(), []);
  assert.equal(p.journal(), null);
  assert.equal(p.push.status(), "permission-off");
});

test("sign-out unregisters before the sign-out call, before anything else is cleared", async () => {
  const p = phone();
  await p.signIn("a");
  p.events.length = 0;
  await p.lifecycle.signOut();
  await p.settle();
  assert.deepEqual(p.rpc(), [`unregister_device:jwt-a:${token}`, "auth.signOut"]);
  assert.ok(p.events.indexOf(`unregister_device:jwt-a:${token}`) < p.events.indexOf("clear:people"));
  assert.equal(p.journal(), null);
});

test("signing out A then in as B unregisters A, then registers B (Review Focus 1)", async () => {
  const p = phone();
  await p.signIn("a");
  await p.lifecycle.signOut();
  await p.settle();
  await p.signIn("b");
  assert.deepEqual(p.rpc(), [
    `register_device:jwt-a:${token}:ios`,
    `unregister_device:jwt-a:${token}`,
    "auth.signOut",
    `register_device:jwt-b:${token}:ios`,
  ]);
  assert.deepEqual(p.journal(), { account: "b", token, phase: "registered" });
});

test("switching account without signing out unregisters A with A's session before registering B", async () => {
  const p = phone();
  await p.signIn("a");
  // An email link for another account replaces the session; A's last session still cleans up.
  await p.signIn("b");
  assert.deepEqual(p.rpc(), [
    `register_device:jwt-a:${token}:ios`,
    `unregister_device:jwt-a:${token}`,
    `register_device:jwt-b:${token}:ios`,
  ]);
  assert.equal(p.push.status(), "registered");
});

test("an offline unregister keeps the journal, fails sign-out before it, and retries on the next reconcile", async () => {
  const p = phone();
  await p.signIn("a");
  p.setOffline(true);
  await assert.rejects(p.lifecycle.signOut(), /offline/);
  // The failed sign-out releases the registration, which retries at once: still offline.
  await new Promise((r) => setImmediate(r));
  assert.ok(!p.events.includes("auth.signOut"));
  assert.ok(!p.events.includes("clear:people"));
  assert.deepEqual(p.journal(), { account: "a", token, phase: "removing" });
  assert.equal(p.push.status(), "failed");
  p.setOffline(false);
  p.events.length = 0;
  // Still signed in as A: the next reconcile (here, the foreground return) finishes the removal first.
  await p.push.reconcile();
  assert.deepEqual(p.rpc(), [`unregister_device:jwt-a:${token}`, `register_device:jwt-a:${token}:ios`]);
  await p.lifecycle.signOut();
  assert.equal(p.journal(), null);
});

test("a foreground return during sign-out can't register the account again", async () => {
  const p = phone();
  await p.signIn("a");
  const gate = deferred();
  p.holdAuth(gate.promise);
  const signingOut = p.lifecycle.signOut();
  await new Promise((r) => setImmediate(r));
  await p.push.reconcile();
  gate.resolve();
  await signingOut;
  await p.settle();
  assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`, `unregister_device:jwt-a:${token}`, "auth.signOut"]);
  assert.equal(p.journal(), null);
});

test("deleting the account forgets an endpoint it couldn't remove: the server already removed it", async () => {
  const p = phone();
  await p.signIn("a");
  p.setOffline(true);
  await p.lifecycle.finishAccountDeletion("a");
  await p.settle();
  assert.equal(p.journal(), null);
  p.setOffline(false);
  await p.signIn("b");
  assert.deepEqual(p.journal(), { account: "b", token, phase: "registered" });
});

test("a request is only ever sent with that account's own session", async () => {
  const p = phone();
  await p.signIn("b");
  p.events.length = 0;
  // The registration follows A, but this phone holds no session for A: B's is never borrowed.
  await p.push.update({ account: "a", preview: false });
  assert.deepEqual(p.rpc(), [`unregister_device:jwt-b:${token}`]);
  assert.equal(p.push.status(), "failed");
  assert.deepEqual(p.journal(), { account: "a", token, phase: "registering" });
});

test("pushEnabled() is off unless EXPO_PUBLIC_PUSH_ENABLED is \"true\", and off registers nothing", async () => {
  const saved = process.env.EXPO_PUBLIC_PUSH_ENABLED;
  try {
    delete process.env.EXPO_PUBLIC_PUSH_ENABLED;
    assert.equal(pushEnabled(), false);
    process.env.EXPO_PUBLIC_PUSH_ENABLED = "1";
    assert.equal(pushEnabled(), false);
    process.env.EXPO_PUBLIC_PUSH_ENABLED = "true";
    assert.equal(pushEnabled(), true);
    delete process.env.EXPO_PUBLIC_PUSH_ENABLED;
    const p = phone({ enabled: pushEnabled() });
    await p.signIn("a");
    await p.push.reconcile();
    assert.equal(p.push.status(), "disabled");
    await p.lifecycle.signOut();
    await p.settle();
    assert.deepEqual(p.rpc(), ["auth.signOut"]);
    assert.ok(!p.events.some((e) => e.startsWith("permission") || e.startsWith("token") || e.startsWith("storage")));
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_PUSH_ENABLED;
    else process.env.EXPO_PUBLIC_PUSH_ENABLED = saved;
  }
});

test("web and preview never register", async () => {
  const web = phone({ platform: "web" });
  await web.signIn("a");
  assert.deepEqual(web.rpc(), []);
  assert.ok(!web.events.some((e) => e.startsWith("permission") || e.startsWith("storage")));
  const preview = phone();
  await preview.push.update({ account: null, preview: true });
  await preview.push.update({ account: "a", preview: true });
  await preview.push.reconcile();
  assert.deepEqual(preview.rpc(), []);
  assert.ok(!preview.events.some((e) => e.startsWith("permission") || e.startsWith("storage")));
});
