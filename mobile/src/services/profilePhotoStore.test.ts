import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProfilePhotoStore,
  finishPhotoChange,
  type PhotoGateway,
} from "./profilePhotoStore";
import { stripJpegMetadata, MAX_PHOTO_BYTES } from "./photo";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
const noop = () => {};
test("JPEG metadata is removed before upload; incomplete and oversize results fail", () => {
  const jpeg = Uint8Array.from([
    255, 216, 255, 225, 0, 6, 69, 88, 73, 70, 255, 254, 0, 4, 65, 66, 255, 218,
    0, 2, 1, 255, 0, 2, 255, 225, 0, 4, 67, 68, 255, 217,
  ]);
  assert.deepEqual(
    [...stripJpegMetadata(jpeg)],
    [255, 216, 255, 218, 0, 2, 1, 255, 0, 2, 255, 217],
  );
  assert.throws(() => stripJpegMetadata(jpeg.slice(0, -1)));
  const huge = new Uint8Array(MAX_PHOTO_BYTES + 10);
  huge.set([255, 216]);
  huge.set([255, 217], huge.length - 2);
  assert.throws(() => stripJpegMetadata(huge), /large/);
});
function fixture() {
  let avatar: string | null = "user/old.jpg";
  let revision = 7;
  const calls: string[] = [];
  const gateway: PhotoGateway = {
    read: async () => ({ avatar_path: avatar, avatar_revision: revision }),
    upload: async (path) => {
      calls.push(`upload:${path}`);
    },
    link: async (path, previous, expected) => {
      if (previous !== avatar || expected !== revision) throw Error("Photo conflict");
      calls.push(`link:${path}`);
      if (avatar !== path) revision++;
      avatar = path;
    },
  };
  return {
    gateway,
    calls,
    avatar: () => avatar,
    revision: () => revision,
    set: (x: string | null) => {
      if (avatar !== x) revision++;
      avatar = x;
    },
  };
}
const change = { previous: "user/old.jpg", target: "user/new.jpg", expectedRevision: 7 };
test("lost linking reply is reconciled; restart skips reupload and client never deletes detached files", async () => {
  const f = fixture();
  f.gateway.link = async (path) => {
    f.set(path);
    throw Error("Lost reply");
  };
  assert.deepEqual(
    await finishPhotoChange(
      change,
      f.gateway,
      async () => new Uint8Array([1]),
      noop,
    ),
    { cleanupPending: true, avatarPath: change.target, avatarRevision: 8 },
  );
  assert.deepEqual(f.calls, ["upload:user/new.jpg"]);
  f.calls.length = 0;
  await finishPhotoChange(
    change,
    f.gateway,
    async () => {
      throw Error("Must not need bytes after linked");
    },
    noop,
  );
  assert.deepEqual(f.calls, []);
});
test("failed upload keeps previous photo and never deletes candidate; concurrent edits are not overwritten", async () => {
  const f = fixture();
  f.gateway.upload = async () => {
    throw Error("Offline");
  };
  await assert.rejects(
    finishPhotoChange(change, f.gateway, async () => new Uint8Array([1]), noop),
    /Offline/,
  );
  assert.equal(f.avatar(), change.previous);
  assert.deepEqual(f.calls, []);
  f.set("user/another.jpg");
  await assert.rejects(
    finishPhotoChange(change, f.gateway, async () => new Uint8Array([1]), noop),
    /changed elsewhere/,
  );
});
test("removal confirms the reference is clear while leaving bytes for safe server cleanup", async () => {
  const f = fixture();
  assert.deepEqual(
    await finishPhotoChange(
      { ...change, target: null },
      f.gateway,
      async () => {
        throw Error("No bytes needed");
      },
      noop,
    ),
    { cleanupPending: true, avatarPath: null, avatarRevision: 8 },
  );
  assert.deepEqual(f.calls, ["link:null"]);
});
test("journal is durable before mutation and signout during local writes invalidates it", async () => {
  const values = new Map<string, string>();
  let active = true,
    file = false;
  const store = createProfilePhotoStore(
    {
      getItem: async (k) => values.get(k) ?? null,
      setItem: async (k, v) => {
        values.set(k, v);
      },
      removeItem: async (k) => {
        values.delete(k);
      },
    },
    {
      write: async () => {
        file = true;
        active = false;
      },
      read: async () => new Uint8Array([1]),
      clear: async () => {
        file = false;
      },
    },
  );
  await assert.rejects(
    store.begin("user", change, new Uint8Array([1]), () => {
      if (!active) throw Error("Signed out");
    }),
  );
  assert.equal(await store.read("user"), null);
  assert.equal(file, false);
  active = true;
  await store.begin("user", { ...change, target: null }, null, noop);
  assert.deepEqual(await store.read("user"), { ...change, target: null });
});
test("account switch after read prevents upload and mutation", async () => {
  const f = fixture();
  let active = true;
  f.gateway.read = async () => {
    active = false;
    return { avatar_path: change.previous, avatar_revision: 7 };
  };
  await assert.rejects(
    finishPhotoChange(
      change,
      f.gateway,
      async () => new Uint8Array([1]),
      () => {
        if (!active) throw Error("Account changed");
      },
    ),
  );
  assert.deepEqual(f.calls, []);
});

test("clear waits for an in-flight file write and invalidates its journal; legacy private paths remain removable", async () => {
  const values = new Map<string, string>();
  let release!: () => void,
    started!: () => void,
    file = false;
  const entered = new Promise<void>((r) => {
    started = r;
  });
  const blocked = new Promise<void>((r) => {
    release = r;
  });
  const store = createProfilePhotoStore(
    {
      getItem: async (k) => values.get(k) ?? null,
      setItem: async (k, v) => {
        values.set(k, v);
      },
      removeItem: async (k) => {
        values.delete(k);
      },
    },
    {
      write: async () => {
        started();
        await blocked;
        file = true;
      },
      read: async () => new Uint8Array(),
      clear: async () => {
        file = false;
      },
    },
  );
  const writing = store.begin("user", change, new Uint8Array([1]), noop);
  const rejected = assert.rejects(writing, /cancelled/);
  await entered;
  const clearing = store.clear("user");
  release();
  await Promise.all([clearing, rejected]);
  assert.equal(file, false);
  assert.equal(await store.read("user"), null);
  await store.begin(
    "user",
    { previous: "user/photos/old.webp", target: null, expectedRevision: 7 },
    null,
    noop,
  );
  assert.equal((await store.read("user"))?.previous, "user/photos/old.webp");
  await assert.rejects(
    store.begin(
      "user",
      { previous: "someone/secret.jpg", target: null, expectedRevision: 7 },
      null,
      noop,
    ),
  );
});

test("a competing photo change during upload is rejected atomically and no candidate is deleted", async () => {
  const f = fixture();
  f.gateway.upload = async (path) => {
    f.calls.push(`upload:${path}`);
    f.set("user/other-device.jpg");
  };
  await assert.rejects(finishPhotoChange(change, f.gateway, async () => new Uint8Array([1]), noop), /changed elsewhere/);
  assert.equal(f.avatar(), "user/other-device.jpg");
  assert.deepEqual(f.calls, ["upload:user/new.jpg"]);
});

test("revision rejects an ABA baseline and a matching target from a different change", async () => {
  const f = fixture();
  f.set("user/another.jpg");
  f.set(change.previous);
  await assert.rejects(finishPhotoChange(change, f.gateway, async () => new Uint8Array([1]), noop), /changed elsewhere/);
  f.set(change.target);
  await assert.rejects(finishPhotoChange(change, f.gateway, async () => new Uint8Array([1]), noop), /changed elsewhere/);
  assert.deepEqual(f.calls, []);
});

test("legacy pending changes remain readable but cannot silently adopt a fresh revision", async () => {
  const legacy = { previous: change.previous, target: change.target };
  const store = createProfilePhotoStore({
    getItem: async () => JSON.stringify(legacy), setItem: async () => {}, removeItem: async () => {},
  }, { write: async () => {}, read: async () => new Uint8Array([1]), clear: async () => {} });
  assert.deepEqual(await store.read("user"), legacy);
  const f = fixture();
  await assert.rejects(finishPhotoChange(legacy, f.gateway, async () => new Uint8Array([1]), noop), /Keep saved photo/);
  await assert.rejects(store.begin("user", legacy, new Uint8Array([1]), noop), /Keep saved photo/);
  assert.deepEqual(f.calls, []);
});

test("unchanged target needs no upload or mutation and returns authoritative revision", async () => {
  const f = fixture();
  assert.deepEqual(await finishPhotoChange({ ...change, target: change.previous }, f.gateway, async () => {
    throw Error("No bytes needed");
  }, noop), { cleanupPending: false, avatarPath: change.previous, avatarRevision: 7 });
  assert.deepEqual(f.calls, []);
});

function loadNativeBoundary(file: string, require: (name: string) => unknown) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(source, {
    exports, require, Uint8Array, ArrayBuffer, atob, btoa, setTimeout, clearTimeout,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: "https://fixture.invalid", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key" } },
  });
  return exports;
}

test("photo requests and name saves stay bound to the captured owner across SDK session changes", async () => {
  let current = { access_token: "owner-token", user: { id: "owner" } };
  const requests: { path: string; token: string | null; body: unknown }[] = [];
  const service = loadNativeBoundary("./profile.ts", (name) => {
    if (name === "react-native") return { Platform: { OS: "ios" } };
    if (name === "./supabase") return { storage: {}, supabase: { auth: { getSession: async () => ({ data: { session: current }, error: null }) } } };
    if (name === "./plans") return { withDeadline: (fn: (signal: AbortSignal) => unknown) => fn(new AbortController().signal) };
    if (name === "./profilePhotoStore") return { createProfilePhotoStore };
    if (name === "./photo") return { MAX_PHOTO_BYTES };
    if (name === "@supabase/supabase-js") return {
      createClient: (url: string, key: string, options: { accessToken: () => Promise<string> }) => createClient(url, key, {
        ...options,
        global: { fetch: async (input, init) => {
          requests.push({ path: new URL(String(input)).pathname, token: new Headers(init?.headers).get("Authorization"), body: init?.body ? JSON.parse(String(init.body)) : null });
          current = { access_token: "different-token", user: { id: "different" } };
          return Response.json({ avatar_path: "owner/old.jpg", avatar_revision: 7, display_name: "Owner" });
        } },
      }),
    };
    throw Error(`Unexpected import: ${name}`);
  });
  const gateway = service.photoGateway("owner");
  await gateway.read(); // SDK session changes while the first response is in flight.
  await gateway.link(null, "owner/old.jpg", 7);
  assert.deepEqual(requests.map(({ token }) => token), ["Bearer owner-token", "Bearer owner-token"]);
  assert.equal(requests[1].path, "/rest/v1/rpc/set_avatar_if_current");
  assert.deepEqual(requests[1].body, { p_path: null, p_expected_path: "owner/old.jpg", p_expected_revision: 7 });
  await assert.rejects(service.photoGateway("owner").read(), /Account changed/);
  await assert.rejects(service.saveProfile("Owner", "owner"), /Account changed/);
  current = { access_token: "owner-token", user: { id: "owner" } };
  await service.saveProfile("Updated owner", "owner");
  assert.equal(requests.at(-1)?.token, "Bearer owner-token");
  assert.equal(requests.at(-1)?.path, "/rest/v1/rpc/save_profile");
});

test("picker cancellation does not normalize, and rendering failure releases native context", async () => {
  let cancelled = true;
  let contexts = 0;
  let releases = 0;
  const service = loadNativeBoundary("./photo.ts", (name) => {
    if (name === "expo-image-picker") return { launchImageLibraryAsync: async () => ({ canceled: cancelled, assets: [{ uri: "fixture.jpg", width: 1200, height: 800 }] }) };
    if (name === "expo-image-manipulator") return {
      SaveFormat: { JPEG: "jpeg" },
      ImageManipulator: { manipulate: () => {
        contexts++;
        return { resize: () => {}, renderAsync: async () => { throw Error("Unreadable photo"); }, release: () => { releases++; } };
      } },
    };
    throw Error(`Unexpected import: ${name}`);
  });
  assert.equal(await service.chooseNormalizedPhoto(), null);
  assert.equal(contexts, 0);
  cancelled = false;
  await assert.rejects(service.chooseNormalizedPhoto(), /Unreadable photo/);
  assert.equal(releases, 1);
});
