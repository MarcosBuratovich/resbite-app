import test from "node:test";
import assert from "node:assert/strict";
import {
  createPhotoChangeStore,
  finishVersionedPhotoChange,
  type PhotoChange,
  type VersionedPhoto,
} from "./profilePhotoStore.ts";
import { coverPhotoLayout, coverScope, coverTarget } from "../domain/covers.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const plan = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const noop = () => {};
const copy = coverPhotoLayout.copy;

function memory() {
  const values = new Map<string, string>();
  const blobs = new Map<string, Uint8Array>();
  return {
    storage: {
      getItem: async (k: string) => values.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        values.set(k, v);
      },
      removeItem: async (k: string) => {
        values.delete(k);
      },
    },
    files: {
      write: async (scope: string, bytes: Uint8Array) => {
        blobs.set(scope, bytes);
      },
      read: async (scope: string) => {
        const bytes = blobs.get(scope);
        if (!bytes) throw Error("missing bytes");
        return bytes;
      },
      clear: async (scope: string) => {
        blobs.delete(scope);
      },
    },
  };
}

function server(initial: VersionedPhoto) {
  const state = { ...initial };
  const uploads: string[] = [];
  let loseLink = false;
  return {
    state,
    uploads,
    loseNextLink() {
      loseLink = true;
    },
    gateway: {
      read: async (): Promise<VersionedPhoto | null> => ({ ...state }),
      upload: async (path: string) => {
        uploads.push(path);
      },
      link: async (path: string | null, expectedPath: string | null, expectedRevision: number) => {
        if (state.path !== expectedPath || state.revision !== expectedRevision)
          throw { code: "40001" };
        if (state.path !== path) {
          state.path = path;
          state.revision++;
        }
        if (loseLink) {
          loseLink = false;
          throw Error("Lost reply");
        }
      },
    },
  };
}

test("cover journals are scoped to one owner and plan and accept only that plan's folder", async () => {
  const { storage, files } = memory();
  const store = createPhotoChangeStore(storage, files, coverPhotoLayout);
  const scope = coverScope(owner, plan);
  const change: PhotoChange = { previous: null, target: coverTarget(scope, "abc-123"), expectedRevision: 0 };
  await store.begin(scope, change, new Uint8Array([1]), noop);
  assert.deepEqual(await store.read(scope), change);
  assert.equal(await store.read(coverScope(owner, other)), null);
  await assert.rejects(store.begin(scope, { ...change, target: `${owner}/${other}/x.jpg` }, null, noop), /invalid/);
  await assert.rejects(store.begin(scope, { ...change, target: `${scope}/../x.jpg` }, null, noop), /invalid/);
  await assert.rejects(store.read("preview"), /Invalid photo owner/);
  assert.throws(() => coverScope(owner, "not-a-plan"), /Invalid cover owner/);
});

test("a lost attach reply is confirmed by reading back; a later retry does nothing more", async () => {
  const scope = coverScope(owner, plan);
  const remote = server({ path: null, revision: 0 });
  remote.loseNextLink();
  const change: PhotoChange = { previous: null, target: coverTarget(scope, "a1"), expectedRevision: 0 };
  const bytes = async () => new Uint8Array([1]);
  assert.deepEqual(await finishVersionedPhotoChange(change, remote.gateway, bytes, noop, copy), {
    cleanupPending: false,
    path: change.target,
    revision: 1,
  });
  assert.equal(remote.uploads.length, 1);
  const again = await finishVersionedPhotoChange(change, remote.gateway, bytes, noop, copy);
  assert.equal(again.path, change.target);
  assert.equal(remote.uploads.length, 1);
});

test("a cover changed elsewhere, or a plan that stopped accepting changes, keeps the journal", async () => {
  const scope = coverScope(owner, plan);
  const change: PhotoChange = { previous: null, target: coverTarget(scope, "a1"), expectedRevision: 0 };
  const bytes = async () => new Uint8Array([1]);
  const moved = server({ path: `${scope}/other.jpg`, revision: 1 });
  await assert.rejects(finishVersionedPhotoChange(change, moved.gateway, bytes, noop, copy), /Keep saved cover/);
  const closed = server({ path: null, revision: 0 });
  closed.gateway.link = async () => {
    throw { code: "22023", message: "Plan unavailable" };
  };
  await assert.rejects(
    finishVersionedPhotoChange(change, closed.gateway, bytes, noop, copy),
    (e: unknown) => (e as { code?: string }).code === "22023",
  );
});

test("removing a cover detaches it without bytes and reports the previous file for cleanup", async () => {
  const scope = coverScope(owner, plan);
  const previous = `${scope}/old.jpg`;
  const remote = server({ path: previous, revision: 2 });
  const result = await finishVersionedPhotoChange(
    { previous, target: null, expectedRevision: 2 },
    remote.gateway,
    async () => {
      throw Error("no bytes needed");
    },
    noop,
    copy,
  );
  assert.deepEqual(result, { cleanupPending: true, path: null, revision: 3 });
  assert.equal(remote.uploads.length, 0);
});
