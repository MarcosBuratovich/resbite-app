import test from "node:test";
import assert from "node:assert/strict";
import { createPendingInviteStore } from "./pendingInviteStore";
import { createSessionLifecycle } from "./sessionLifecycle";
import { createPeopleStore } from "./peopleStore";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}
const a = "a".repeat(64),
  b = "b".repeat(64);
test("pending restore cannot publish over a newer link; malformed links preserve it", async () => {
  const disk = storage(),
    gate = deferred(),
    started = deferred();
  disk.data.set("resbite.pending-invite", a);
  const seen: unknown[] = [];
  let first = true;
  const store = createPendingInviteStore(
    {
      ...disk,
      getItem: async (k) => {
        const saved = await disk.getItem(k);
        if (first) {
          first = false;
          started.resolve();
          await gate.promise;
        }
        return saved;
      },
    },
    (t) => seen.push(t),
  );
  const restore = store.restore();
  await started.promise;
  const write = store.remember(b);
  await assert.rejects(store.remember("bad"));
  gate.resolve();
  await Promise.all([restore, write]);
  assert.deepEqual(seen, [b]);
  assert.equal(disk.data.get("resbite.pending-invite"), b);
});
test("pending writes and cleanup are serialized; stale claim cannot clear newer token", async () => {
  const disk = storage(),
    seen: unknown[] = [],
    store = createPendingInviteStore(disk, (t) => seen.push(t));
  const write = store.remember(b),
    staleClear = store.remember(null, a);
  await Promise.all([write, staleClear]);
  assert.equal(seen.at(-1), b);
  const unblock = store.beginCleanup();
  await assert.rejects(store.remember(a));
  await store.clear();
  assert.equal(seen.at(-1), null);
  unblock();
  await store.remember(a);
  assert.equal(seen.at(-1), a);
});
test("failed pending persistence reports failure and can be retried", async () => {
  const disk = storage();
  let fail = true;
  const seen: unknown[] = [];
  const store = createPendingInviteStore(
    {
      ...disk,
      setItem: async (k, v) => {
        if (fail) throw Error("disk");
        await disk.setItem(k, v);
      },
    },
    (t) => seen.push(t),
  );
  await assert.rejects(store.remember(a));
  assert.deepEqual(seen, []);
  fail = false;
  await store.remember(a);
  assert.deepEqual(seen, [a]);
});
function lifecycleHarness() {
  const disk = storage(),
    people = createPeopleStore(disk),
    events: string[] = [],
    places: string[] = [],
    device: string[] = [];
  let auth = async () => {
      events.push("auth");
    },
    photo = async () => {
      events.push("photo");
    };
  const life = createSessionLifecycle({
    suspend: people.suspend,
    resume: people.resume,
    clearPeople: async (scope) => {
      events.push(`clear:${scope}`);
      await people.clear(scope);
    },
    clearRecentPlaces: async (scope) => {
      places.push(scope);
    },
    clearReminders: async (scope) => {
      device.push(`reminders:${scope}`);
    },
    clearCalendarRecords: async (scope) => {
      device.push(`calendar:${scope}`);
    },
    clearPhoto: () => photo(),
    clearInviteCodes: async () => {},
    clearCovers: async (scope) => {
      events.push(`covers:${scope}`);
    },
    blockPending: () => {
      events.push("block");
      return () => {
        events.push("unblock");
      };
    },
    clearPending: async () => {
      events.push("pending");
    },
    authSignOut: () => auth(),
    finish: (preview) => {
      events.push(`finish:${preview}`);
    },
    busy: (value) => {
      events.push(`busy:${value}`);
    },
  });
  return {
    life,
    people,
    events,
    places,
    device,
    setAuth: (fn: () => Promise<void>) => {
      auth = fn;
    },
    setPhoto: (fn: () => Promise<void>) => {
      photo = fn;
    },
  };
}
test("sign-out is single-flight, blocks new writes immediately and retries honest failures", async () => {
  const h = lifecycleHarness(),
    gate = deferred();
  h.life.update({ account: "owner", preview: false });
  const old = h.life.capture();
  h.setAuth(async () => {
    await gate.promise;
    throw Error("offline");
  });
  const first = h.life.signOut(),
    second = h.life.signOut();
  assert.equal(first, second);
  assert.throws(old);
  await assert.rejects(h.people.saveSelection("owner", "plan", []));
  gate.resolve();
  await assert.rejects(first);
  assert(!h.events.some((e) => e.startsWith("finish")));
  await h.people.saveSelection("owner", "plan", []);
  h.setAuth(async () => {});
  await h.life.signOut();
  assert(h.events.includes("finish:false"));
  await assert.rejects(h.people.saveSelection("owner", "plan", []));
});
test("preview exit never signs out a real session or clears its pending invitation", async () => {
  const h = lifecycleHarness();
  h.life.update({ account: "owner", preview: true });
  await h.life.signOut();
  assert.deepEqual(h.events, [
    "busy:true",
    "clear:preview",
    "finish:true",
    "busy:false",
  ]);
});
test("sign-out clears cover journals for the account after the photo; preview does not", async () => {
  const h = lifecycleHarness();
  h.life.update({ account: "owner", preview: false });
  await h.life.signOut();
  const photo = h.events.indexOf("photo"),
    covers = h.events.indexOf("covers:owner");
  assert(photo >= 0 && covers > photo);
  assert(covers < h.events.indexOf("pending"));
  const p = lifecycleHarness();
  p.life.update({ account: "owner", preview: true });
  await p.life.signOut();
  assert(!p.events.some((e) => e.startsWith("covers")));
});
test("a failed cover clear fails sign-out before auth sign-out", async () => {
  const events: string[] = [];
  const life = createSessionLifecycle({
    suspend: () => {},
    resume: () => {},
    clearPeople: async () => {},
    clearRecentPlaces: async () => {},
    clearReminders: async () => {},
    clearCalendarRecords: async () => {},
    clearPhoto: async () => {},
    clearInviteCodes: async () => {},
    clearCovers: async () => {
      throw Error("disk");
    },
    blockPending: () => () => {},
    clearPending: async () => {},
    authSignOut: async () => {
      events.push("auth");
    },
    finish: () => {},
    busy: () => {},
  });
  life.update({ account: "owner", preview: false });
  await assert.rejects(life.signOut(), /disk/);
  assert.deepEqual(events, []);
});
test("account switch during cleanup prevents auth sign-out and completion for the new account", async () => {
  const h = lifecycleHarness(),
    gate = deferred(),
    started = deferred();
  h.life.update({ account: "a", preview: false });
  h.setPhoto(async () => {
    started.resolve();
    await gate.promise;
  });
  const flight = h.life.signOut();
  await started.promise;
  h.life.update({ account: "b", preview: false });
  gate.resolve();
  await assert.rejects(flight);
  assert(!h.events.includes("auth"));
  assert(!h.events.some((e) => e.startsWith("finish")));
  await h.people.saveSelection("b", "plan", []);
});
test("people suspension during an awaited read prevents its write", async () => {
  const disk = storage(),
    gate = deferred(),
    started = deferred();
  const store = createPeopleStore({
    ...disk,
    getItem: async (k) => {
      started.resolve();
      await gate.promise;
      return disk.getItem(k);
    },
  });
  const write = store.saveSelection("owner", "plan", []);
  await started.promise;
  store.suspend("owner");
  gate.resolve();
  await assert.rejects(write);
  assert.equal(disk.data.size, 0);
});

test("cleanup waits for an in-flight pending write and failed removal can be retried", async () => {
  const disk = storage(),
    gate = deferred(),
    started = deferred();
  let failRemoval = true;
  const seen: unknown[] = [];
  const store = createPendingInviteStore(
    {
      ...disk,
      setItem: async (key, value) => {
        started.resolve();
        await gate.promise;
        await disk.setItem(key, value);
      },
      removeItem: async (key) => {
        if (failRemoval) throw Error("locked storage");
        await disk.removeItem(key);
      },
    },
    (value) => seen.push(value),
  );
  const write = store.remember(a);
  await started.promise;
  const unblock = store.beginCleanup();
  const clear = store.clear();
  gate.resolve();
  await write;
  await assert.rejects(clear);
  assert.deepEqual(seen, []);
  assert.equal(disk.data.get("resbite.pending-invite"), a);
  failRemoval = false;
  await store.clear();
  unblock();
  assert.deepEqual(seen, [null]);
  assert.equal(disk.data.size, 0);
});
test("sign-out clears recent places for the account and for preview", async () => {
  const h = lifecycleHarness();
  h.life.update({ account: "owner", preview: false });
  await h.life.signOut();
  assert.deepEqual(h.places, ["owner"]);
  const p = lifecycleHarness();
  p.life.update({ account: "owner", preview: true });
  await p.life.signOut();
  assert.deepEqual(p.places, ["preview"]);
});
test("a failed recent-places clear fails sign-out before auth sign-out", async () => {
  const events: string[] = [];
  const life = createSessionLifecycle({
    suspend: () => {},
    resume: () => {},
    clearPeople: async () => {},
    clearRecentPlaces: async () => {
      throw Error("disk");
    },
    clearReminders: async () => {},
    clearCalendarRecords: async () => {},
    clearPhoto: async () => {
      events.push("photo");
    },
    clearInviteCodes: async () => {},
    clearCovers: async () => {},
    blockPending: () => () => {},
    clearPending: async () => {},
    authSignOut: async () => {
      events.push("auth");
    },
    finish: () => {},
    busy: () => {},
  });
  life.update({ account: "owner", preview: false });
  await assert.rejects(life.signOut(), /disk/);
  assert.deepEqual(events, []);
});

test("sign-out clears reminders and calendar records for the account and for preview", async () => {
  const h = lifecycleHarness();
  h.life.update({ account: "owner", preview: false });
  await h.life.signOut();
  assert.deepEqual(h.device, ["reminders:owner", "calendar:owner"]);
  const p = lifecycleHarness();
  p.life.update({ account: "owner", preview: true });
  await p.life.signOut();
  assert.deepEqual(p.device, ["reminders:preview", "calendar:preview"]);
});
test("a failed reminder or calendar clear fails sign-out before auth sign-out", async () => {
  for (const failing of ["reminders", "calendar"]) {
    const events: string[] = [];
    const fail = (name: string) => async () => {
      events.push(name);
      if (name === failing) throw Error("disk");
    };
    const life = createSessionLifecycle({
      suspend: () => {},
      resume: () => {},
      clearPeople: async () => {},
      clearRecentPlaces: async () => {},
      clearReminders: fail("reminders"),
      clearCalendarRecords: fail("calendar"),
      clearPhoto: async () => {
        events.push("photo");
      },
      clearInviteCodes: async () => {},
      clearCovers: async () => {},
      blockPending: () => () => {},
      clearPending: async () => {},
      authSignOut: async () => {
        events.push("auth");
      },
      finish: () => {},
      busy: () => {},
    });
    life.update({ account: "owner", preview: false });
    await assert.rejects(life.signOut(), /disk/);
    assert.deepEqual(events, failing === "reminders" ? ["reminders"] : ["reminders", "calendar"]);
  }
});
