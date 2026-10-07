import type { KeyStore } from "./secureChunks";
export type PhotoChange = {
  previous: string | null;
  target: string | null;
  // Optional only so old journals can be opened and explicitly discarded.
  expectedRevision?: number;
};
/** User-facing copy for one kind of photo (profile photo, event cover). */
export type PhotoChangeCopy = {
  unretryable: string;
  missing: string;
  unverified: string;
  changedElsewhere: string;
  unconfirmed: string;
};
/** Where one kind of photo is journaled on the device and stored in its bucket. */
export type PhotoLayout = {
  validScope(scope: string): boolean;
  key(scope: string): string;
  prefix(scope: string): string;
  copy: PhotoChangeCopy;
};
export const profilePhotoLayout: PhotoLayout = {
  validScope: (scope) => /^[a-zA-Z0-9-]+$/.test(scope) && scope !== "preview",
  key: (scope) => `resbite.photo.v1.${scope}`,
  prefix: (scope) => `${scope}/`,
  copy: {
    unretryable:
      "This saved photo change cannot be safely retried. Choose Keep saved photo, then choose your photo again.",
    missing: "Save your name before adding a photo.",
    unverified:
      "Your saved photo could not be verified. Reload your profile before trying again.",
    changedElsewhere:
      "Your photo changed elsewhere. Choose Keep saved photo before making another change.",
    unconfirmed: "Photo update is unconfirmed. Retry to check the saved photo.",
  },
};
const validRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function requireRevision(change: PhotoChange, copy: PhotoChangeCopy): number {
  if (!validRevision(change.expectedRevision)) throw Error(copy.unretryable);
  return change.expectedRevision;
}
export type PhotoFiles = {
  write(scope: string, bytes: Uint8Array): Promise<void>;
  read(scope: string): Promise<Uint8Array>;
  clear(scope: string): Promise<void>;
};
export function createPhotoChangeStore(
  storage: KeyStore,
  files: PhotoFiles,
  layout: PhotoLayout,
) {
  const epochs = new Map<string, number>();
  const queues = new Map<string, Promise<unknown>>();
  function run<T>(scope: string, action: () => Promise<T>): Promise<T> {
    if (!layout.validScope(scope))
      return Promise.reject(Error("Invalid photo owner."));
    const next = (queues.get(scope) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    queues.set(
      scope,
      next.catch(() => {}),
    );
    return next;
  }
  function validate(scope: string, change: PhotoChange) {
    const prefix = layout.prefix(scope);
    const path = (value: unknown) =>
      value === null ||
      (typeof value === "string" &&
        value.startsWith(prefix) &&
        /^[a-zA-Z0-9-]+\.jpg$/.test(value.slice(prefix.length)));
    const previous = (value: unknown) =>
      value === null ||
      (typeof value === "string" &&
        value.startsWith(prefix) &&
        !value
          .split("/")
          .some((part) => !part || part === "." || part === "..") &&
        !/[\\\u0000-\u001f]/.test(value));
    if (!change || !previous(change.previous) || !path(change.target))
      throw Error("Saved photo change is invalid.");
    if (change.expectedRevision !== undefined && !validRevision(change.expectedRevision))
      throw Error("Saved photo revision is invalid.");
    return change;
  }
  return {
    read(scope: string): Promise<PhotoChange | null> {
      return run(scope, async () => {
        const value = await storage.getItem(layout.key(scope));
        return value ? validate(scope, JSON.parse(value)) : null;
      });
    },
    begin(
      scope: string,
      change: PhotoChange,
      bytes: Uint8Array | null,
      assertCurrent: () => void,
    ) {
      const epoch = epochs.get(scope) ?? 0;
      return run(scope, async () => {
        const check = () => {
          assertCurrent();
          if ((epochs.get(scope) ?? 0) !== epoch)
            throw Error("Photo operation cancelled.");
        };
        check();
        validate(scope, change);
        requireRevision(change, layout.copy);
        try {
          if (bytes) await files.write(scope, bytes);
          check();
          await storage.setItem(layout.key(scope), JSON.stringify(change));
          check();
        } catch (error) {
          await storage.removeItem(layout.key(scope));
          await files.clear(scope);
          throw error;
        }
      });
    },
    bytes: (scope: string) => run(scope, () => files.read(scope)),
    clear(scope: string) {
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
      return run(scope, async () => {
        await storage.removeItem(layout.key(scope));
        await files.clear(scope);
      });
    },
  };
}
export function createProfilePhotoStore(storage: KeyStore, files: PhotoFiles) {
  return createPhotoChangeStore(storage, files, profilePhotoLayout);
}

export type VersionedPhoto = { path: string | null; revision: number };
export type VersionedPhotoGateway = {
  read(): Promise<VersionedPhoto | null>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  link(path: string | null, expectedPath: string | null, expectedRevision: number): Promise<void>;
};
// A pending operation is preserved on every uncertain result. Never delete the
// candidate: its link may have committed even if a reply was lost.
export async function finishVersionedPhotoChange(
  change: PhotoChange,
  gateway: VersionedPhotoGateway,
  readBytes: () => Promise<Uint8Array>,
  assertCurrent: () => void,
  copy: PhotoChangeCopy,
) {
  assertCurrent();
  const expected = requireRevision(change, copy);
  let current = await gateway.read();
  assertCurrent();
  if (!current) throw Error(copy.missing);
  if (!validRevision(current.revision)) throw Error(copy.unverified);
  const matches = (value: VersionedPhoto | null) =>
    value?.path === change.target &&
    (value.revision === expected + 1 ||
      (change.previous === change.target && value.revision === expected));
  if (!matches(current)) {
    if (current.path !== change.previous || current.revision !== expected)
      throw Error(copy.changedElsewhere);
    if (change.target) {
      const bytes = await readBytes();
      assertCurrent();
      await gateway.upload(change.target, bytes);
      assertCurrent();
    }
    let failure: unknown;
    try {
      await gateway.link(change.target, change.previous, expected);
    } catch (error) {
      failure = error;
    }
    assertCurrent();
    current = await gateway.read();
    assertCurrent();
    if (!matches(current)) {
      if (current && (current.path !== change.previous || current.revision !== expected))
        throw Error(copy.changedElsewhere);
      throw failure ?? Error(copy.unconfirmed);
    }
  }
  // A client read cannot fence a concurrent reattachment on another device.
  // Only the prepared server retirement protocol may remove detached bytes.
  return {
    cleanupPending: change.previous !== null && change.previous !== change.target,
    path: current!.path,
    revision: current!.revision,
  };
}

export type PhotoGateway = {
  read(): Promise<{ avatar_path: string | null; avatar_revision: number } | null>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  link(path: string | null, expectedPath: string | null, expectedRevision: number): Promise<void>;
};
export async function finishPhotoChange(
  change: PhotoChange,
  gateway: PhotoGateway,
  readBytes: () => Promise<Uint8Array>,
  assertCurrent: () => void,
) {
  const result = await finishVersionedPhotoChange(
    change,
    {
      read: async () => {
        const value = await gateway.read();
        return value && { path: value.avatar_path, revision: value.avatar_revision };
      },
      upload: (path, bytes) => gateway.upload(path, bytes),
      link: (path, expectedPath, expectedRevision) =>
        gateway.link(path, expectedPath, expectedRevision),
    },
    readBytes,
    assertCurrent,
    profilePhotoLayout.copy,
  );
  return {
    cleanupPending: result.cleanupPending,
    avatarPath: result.path,
    avatarRevision: result.revision,
  };
}
