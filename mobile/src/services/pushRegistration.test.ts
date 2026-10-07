import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPushRegistration,
  parseNotificationTarget,
  resolveNotificationTarget,
  type PushJournal,
  type PushRegistrationAdapter,
} from "./pushRegistration";
const token = "ExpoPushToken[synthetic]";
function fixture(enabled = true) {
  let journal: PushJournal | null = null;
  const events: string[] = [];
  const adapter: PushRegistrationAdapter = {
    platform: "ios",
    readJournal: async () => journal,
    writeJournal: async (v) => {
      journal = v;
      events.push(`journal:${v?.phase ?? "clear"}`);
    },
    readPermission: async () => "granted",
    readToken: async () => token,
    register: async (account, t) => {
      events.push(`register:${account}:${t}`);
    },
    unregister: async (account, t) => {
      events.push(`remove:${account}:${t}`);
    },
  };
  const service = createPushRegistration(adapter, enabled);
  service.update({ account: "a", preview: false });
  return {
    adapter,
    service,
    events,
    get journal() {
      return journal;
    },
  };
}
test("disabled and preview never access permission, token or storage", async () => {
  for (const preview of [false, true]) {
    const f = fixture(preview);
    f.service.update({ account: "a", preview });
    f.adapter.readJournal = async () => {
      throw Error("must not read");
    };
    assert.equal(await f.service.reconcile(), "disabled");
    assert.equal(await f.service.beforeSignOut(), "disabled");
  }
});
test("registration journals before network; lost reply retries same token after restart", async () => {
  const f = fixture();
  let calls = 0;
  f.adapter.register = async () => {
    if (++calls === 1) throw Error("lost");
  };
  await assert.rejects(f.service.reconcile(), /lost/);
  assert.equal(f.journal?.phase, "registering");
  const restarted = createPushRegistration(f.adapter, true);
  restarted.update({ account: "a", preview: false });
  await restarted.reconcile();
  assert.equal(f.journal?.phase, "registered");
  assert.equal(calls, 2);
});
test("rotation removes old binding before registering new endpoint", async () => {
  const f = fixture();
  await f.service.reconcile();
  f.events.length = 0;
  f.adapter.readToken = async () => "ExpoPushToken[new]";
  await f.service.reconcile();
  assert.deepEqual(f.events, [
    "journal:removing",
    `remove:a:${token}`,
    "journal:clear",
    "journal:registering",
    "register:a:ExpoPushToken[new]",
    "journal:registered",
  ]);
});
test("revocation/signout preserve failed cleanup and retry before account reassignment", async () => {
  const f = fixture();
  await f.service.reconcile();
  f.adapter.readPermission = async () => "denied";
  f.adapter.unregister = async () => {
    throw Error("offline");
  };
  await assert.rejects(f.service.reconcile(), /offline/);
  assert.equal(f.journal?.phase, "removing");
  f.service.update({ account: "b", preview: false });
  await assert.rejects(f.service.reconcile(), /Previous account/);
  f.service.update({ account: "a", preview: false });
  f.adapter.unregister = async () => {};
  await f.service.beforeSignOut();
  assert.equal(JSON.stringify(f.journal), "null");
  f.service.update({ account: "b", preview: false });
  f.adapter.readPermission = async () => "granted";
  await f.service.reconcile();
  assert.equal(f.journal?.account, "b");
});
test("late token result after account switch cannot register", async () => {
  const f = fixture();
  let resolve!: (value: string) => void;
  f.adapter.readToken = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = f.service.reconcile();
  await new Promise((r) => setImmediate(r));
  f.service.update({ account: "b", preview: false });
  resolve(token);
  await assert.rejects(pending, /Account changed/);
  assert.equal(f.events.length, 0);
});
test("late register completion keeps old-account recovery journal without publishing success", async () => {
  const f = fixture();
  let resolve!: () => void;
  f.adapter.register = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = f.service.reconcile();
  await new Promise((r) => setImmediate(r));
  f.service.update({ account: "b", preview: false });
  resolve();
  await assert.rejects(pending, /Account changed/);
  assert.equal(f.journal?.account, "a");
  assert.equal(f.journal?.phase, "registering");
});
test("tap rejects arbitrary routes and only resolves fresh authorized account reads", async () => {
  const payload = {
    type: "plan_update",
    planId: "20000000-0000-4000-8000-000000000001",
    notificationId: "1",
  };
  assert.ok(parseNotificationTarget(payload));
  assert.equal(
    parseNotificationTarget({ ...payload, url: "https://evil.invalid" }),
    null,
  );
  assert.equal(
    parseNotificationTarget({ ...payload, planId: "../profile" }),
    null,
  );
  let reads = 0;
  const deps = {
    account: "a",
    preview: false,
    assertCurrent: () => {},
    readAuthorizedPlan: async () => {
      reads++;
      return { id: payload.planId };
    },
  };
  assert.equal(
    await resolveNotificationTarget(payload, { ...deps, account: null }),
    null,
  );
  assert.equal(reads, 0);
  assert.equal(await resolveNotificationTarget(payload, deps), payload.planId);
  assert.equal(
    await resolveNotificationTarget(payload, {
      ...deps,
      readAuthorizedPlan: async () => null,
    }),
    null,
  );
  let current = true;
  await assert.rejects(
    resolveNotificationTarget(payload, {
      ...deps,
      assertCurrent: () => {
        if (!current) throw Error("changed");
      },
      readAuthorizedPlan: async () => {
        current = false;
        return { id: payload.planId };
      },
    }),
    /changed/,
  );
});
