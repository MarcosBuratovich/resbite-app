import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionLifecycle, signOutNotice } from "./sessionLifecycle";
import {
  createPushDeviceAdapter,
  createPushSession,
  createSessionTokens,
  pushEnabled,
  type SessionSource,
} from "./pushDevice";

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

// A fake `supabase.auth`: the live session and the auth events supabase-js delivers.
function fakeAuth() {
  type Live = { user: { id: string }; access_token: string } | null;
  let live: Live = null;
  const listeners: ((event: string, session: Live) => void)[] = [];
  const auth: SessionSource = {
    getSession: async () => ({ data: { session: live } }),
    onAuthStateChange: (callback) => listeners.push(callback),
  };
  return {
    auth,
    emit(event: string, session: Live) {
      live = session;
      for (const listener of listeners) listener(event, session);
    },
  };
}
const signedIn = (account: string, accessToken = `jwt-${account}`) => ({
  user: { id: account },
  access_token: accessToken,
});

// One phone: fake expo-notifications, fake secure storage, a fake RPC and a fake supabase.auth behind the real
// session binding, wired the way AppState wires the real ones (sessionLifecycle for sign-out, every session
// change mirrored to the push session).
function phone(options: { platform?: string; enabled?: boolean } = {}) {
  const disk = new Map<string, string>();
  const events: string[] = [];
  const supabase = fakeAuth();
  let permission = ios(2);
  let offline = false;
  let authGate: Promise<void> = Promise.resolve();
  let rpcGate: Promise<void> = Promise.resolve();
  let unreadable = false;
  const adapter = createPushDeviceAdapter({
    platform: options.platform ?? "ios",
    store: {
      getItem: async (k) => {
        events.push("storage:read");
        if (unreadable) throw Error("Invalid secure session manifest");
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
    ...createSessionTokens(supabase.auth),
    rpc: async (accessToken, name, args) => {
      await rpcGate;
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
    authSignOut: async (localOnly) => {
      await authGate;
      events.push(localOnly ? "auth.signOut:local" : "auth.signOut");
      // supabase-js delivers SIGNED_OUT before signOut() resolves; AppState mirrors it.
      supabase.emit("SIGNED_OUT", null);
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
    rpc: () =>
      events.filter(
        (e) => e.startsWith("register_device") || e.startsWith("unregister_device") || e.startsWith("auth.signOut"),
      ),
    /** A sign-in, or an email link that replaces the live session with another account's. */
    signIn(account: string) {
      supabase.emit("SIGNED_IN", signedIn(account));
      return session(account);
    },
    /** The session ends without signing out here (expired, or ended on the server). */
    endSession() {
      supabase.emit("SIGNED_OUT", null);
      return session(null);
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
    holdRpc: (gate: Promise<void>) => {
      rpcGate = gate;
    },
    breakStorage: () => {
      unreadable = true;
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

test("after a session ended without signing out here, the next account replaces its record and registers", async () => {
  const p = phone();
  await p.signIn("a");
  // The cleanup tries, but A's endpoint can't be removed without A's session: A's record stays.
  await p.endSession();
  assert.deepEqual(p.journal(), { account: "a", token, phase: "removing" });
  await p.signIn("b");
  // register_device rebinds the token to B on the server: A's notifications stop reaching this phone.
  assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`, `register_device:jwt-b:${token}:ios`]);
  assert.deepEqual(p.journal(), { account: "b", token, phase: "registered" });
  assert.equal(p.push.status(), "registered");
});

test("an offline switch can't wait on A's old session: B registers once online, replacing A's record", async () => {
  const p = phone();
  await p.signIn("a");
  p.setOffline(true);
  // An email link for B replaces the live session; A's cleanup fails offline.
  await p.signIn("b");
  assert.equal(p.push.status(), "failed");
  p.setOffline(false);
  await p.push.reconcile();
  assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`, `register_device:jwt-b:${token}:ios`]);
  assert.deepEqual(p.journal(), { account: "b", token, phase: "registered" });
});

test("an offline unregister keeps the journal, refuses sign-out with its reason, and retries on the next reconcile", async () => {
  const p = phone();
  await p.signIn("a");
  p.setOffline(true);
  const refused = await p.lifecycle.signOut().then(
    () => null,
    (error: unknown) => error,
  );
  // The notice AppState sets for this failure.
  assert.equal(
    signOutNotice(refused, true),
    "Couldn’t sign out. Connect to the internet and try again, so this phone stops getting your notifications.",
  );
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

test("pushStatus: \"disabled\" at once for preview and signed out; null, then the new account's state, on a switch", async () => {
  const p = phone();
  assert.equal(p.push.status(), "disabled");
  const previewing = p.push.update({ account: "a", preview: true });
  assert.equal(p.push.status(), "disabled");
  await previewing;
  assert.ok(!p.events.some((e) => e.startsWith("permission") || e.startsWith("storage")));
  await p.push.update({ account: null, preview: false });
  const signingIn = p.signIn("a");
  assert.equal(p.push.status(), null);
  await signingIn;
  assert.equal(p.push.status(), "registered");
  p.setPermission(1);
  const switching = p.signIn("b");
  // A's "registered" never shows for B.
  assert.equal(p.push.status(), null);
  await switching;
  assert.equal(p.push.status(), "permission-off");
  await p.lifecycle.signOut();
  await p.settle();
  assert.equal(p.push.status(), "disabled");
});

test("a damaged record never blocks sign-out: it is forgotten and sign-out completes", async () => {
  const damaged: [string, (p: ReturnType<typeof phone>) => void][] = [
    ["unparseable", (p) => p.disk.set(JOURNAL, "{not json")],
    ["untrustworthy", (p) => p.disk.set(JOURNAL, JSON.stringify({ account: "a", token: "nope", phase: "registered" }))],
    ["unreadable", (p) => p.breakStorage()],
  ];
  for (const [name, damage] of damaged) {
    const p = phone();
    await p.signIn("a");
    damage(p);
    await p.lifecycle.signOut();
    await p.settle();
    assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`, "auth.signOut"], name);
    assert.equal(p.disk.has(JOURNAL), false, name);
  }
});

test("a request for an account carries only that account's own session, and nothing when it has none", async () => {
  const supabase = fakeAuth();
  const tokens = createSessionTokens(supabase.auth);
  supabase.emit("SIGNED_IN", signedIn("a"));
  assert.equal(await tokens.sessionFor("a"), "jwt-a");
  assert.equal(await tokens.sessionFor("b"), null);
  // An email link for B replaces the live session: A keeps its own last token for its cleanup, never B's.
  supabase.emit("SIGNED_IN", signedIn("b"));
  assert.equal(await tokens.sessionFor("a"), "jwt-a");
  assert.equal(await tokens.sessionFor("b"), "jwt-b");
  assert.equal(await tokens.liveAccount(), "b");
  supabase.emit("TOKEN_REFRESHED", signedIn("b", "jwt-b2"));
  assert.equal(await tokens.sessionFor("b"), "jwt-b2");
  // B signs out: its token is forgotten.
  supabase.emit("SIGNED_OUT", null);
  assert.equal(await tokens.sessionFor("b"), null);
  assert.equal(await tokens.liveAccount(), null);

  // Through the adapter, with only B's session on this phone: nothing is sent for A.
  const phoneAuth = fakeAuth();
  const sent: string[] = [];
  const adapter = createPushDeviceAdapter({
    platform: "ios",
    store: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    notifications: {
      getPermissionsAsync: async () => ios(2),
      getExpoPushTokenAsync: async () => ({ data: token }),
    },
    projectId: () => "project-1",
    ...createSessionTokens(phoneAuth.auth),
    rpc: async (accessToken, name) => {
      sent.push(`${name}:${accessToken}`);
    },
  });
  phoneAuth.emit("SIGNED_IN", signedIn("b"));
  await assert.rejects(adapter.register("a", token, "ios"), /Sign in again/);
  await assert.rejects(adapter.unregister("a", token), /Sign in again/);
  await adapter.register("b", token, "ios");
  assert.deepEqual(sent, ["register_device:jwt-b"]);
});

test("reconciles made together share one registration; one made during a run gets a single run after it", async () => {
  const p = phone();
  await p.signIn("a");
  p.events.length = 0;
  await Promise.all([p.push.reconcile(), p.push.reconcile(), p.push.reconcile()]);
  assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`]);
  // A run waiting on the server: later calls share one more run, which reads a permission changed meanwhile.
  p.events.length = 0;
  const gate = deferred();
  p.holdRpc(gate.promise);
  const first = p.push.reconcile();
  await new Promise((r) => setImmediate(r));
  const later = [p.push.reconcile(), p.push.reconcile(), p.push.reconcile()];
  gate.resolve();
  await Promise.all([first, ...later]);
  assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`, `register_device:jwt-a:${token}:ios`]);
});

test("account deletion unregisters before the local auth sign-out", async () => {
  const p = phone();
  await p.signIn("a");
  await p.lifecycle.finishAccountDeletion("a");
  await p.settle();
  assert.deepEqual(p.rpc(), [
    `register_device:jwt-a:${token}:ios`,
    `unregister_device:jwt-a:${token}`,
    "auth.signOut:local",
  ]);
  assert.equal(p.journal(), null);
});

test("a reconcile queued just before sign-out starts doesn't register first", async () => {
  const p = phone();
  await p.signIn("a");
  const queued = p.push.reconcile();
  const signingOut = p.lifecycle.signOut();
  await Promise.all([queued, signingOut]);
  await p.settle();
  assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`, `unregister_device:jwt-a:${token}`, "auth.signOut"]);
});

test("a damaged record doesn't block registering: the current account registers and a fresh record replaces it", async () => {
  const damaged: [string, (p: ReturnType<typeof phone>) => void][] = [
    ["unparseable", (p) => p.disk.set(JOURNAL, "{not json")],
    ["untrustworthy", (p) => p.disk.set(JOURNAL, JSON.stringify({ account: "a", token: "nope", phase: "registered" }))],
    ["unreadable", (p) => p.breakStorage()],
  ];
  for (const [name, damage] of damaged) {
    const p = phone();
    await p.signIn("a");
    damage(p);
    p.events.length = 0;
    await p.push.reconcile();
    // Its token is unknown, so nothing is unregistered for it.
    assert.deepEqual(p.rpc(), [`register_device:jwt-a:${token}:ios`], name);
    assert.deepEqual(JSON.parse(p.disk.get(JOURNAL)!), { account: "a", token, phase: "registered" }, name);
    assert.equal(p.push.status(), "registered", name);
  }
});
