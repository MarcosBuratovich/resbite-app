import type { KeyStore } from "./secureChunks";
export type PhotoChange = {
  previous: string | null;
  target: string | null;
  // Optional only so old journals can be opened and explicitly discarded.
  expectedRevision?: number;
};
const validRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function requireRevision(change: PhotoChange): number {
  if (!validRevision(change.expectedRevision))
    throw Error(
      "This saved photo change cannot be safely retried. Choose Keep saved photo, then choose your photo again.",
    );
  return change.expectedRevision;
}
export type PhotoFiles = {
  write(scope: string, bytes: Uint8Array): Promise<void>;
  read(scope: string): Promise<Uint8Array>;
  clear(scope: string): Promise<void>;
};
export function createProfilePhotoStore(storage: KeyStore, files: PhotoFiles) {
  const epochs = new Map<string, number>();
  const key = (scope: string) => `resbite.photo.v1.${scope}`;
  const queues = new Map<string, Promise<unknown>>();
  function run<T>(scope: string, action: () => Promise<T>): Promise<T> {
    if (!/^[a-zA-Z0-9-]+$/.test(scope) || scope === "preview")
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
    const path = (value: unknown) =>
      value === null ||
      (typeof value === "string" &&
        value.startsWith(`${scope}/`) &&
        /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.jpg$/.test(value));
    const previous = (value: unknown) =>
      value === null ||
      (typeof value === "string" &&
        value.startsWith(`${scope}/`) &&
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
        const value = await storage.getItem(key(scope));
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
        requireRevision(change);
        try {
          if (bytes) await files.write(scope, bytes);
          check();
          await storage.setItem(key(scope), JSON.stringify(change));
          check();
        } catch (error) {
          await storage.removeItem(key(scope));
          await files.clear(scope);
          throw error;
        }
      });
    },
    bytes: (scope: string) => run(scope, () => files.read(scope)),
    clear(scope: string) {
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
      return run(scope, async () => {
        await storage.removeItem(key(scope));
        await files.clear(scope);
      });
    },
  };
}

export type PhotoGateway = {
  read(): Promise<{ avatar_path: string | null; avatar_revision: number } | null>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  link(path: string | null, expectedPath: string | null, expectedRevision: number): Promise<void>;
};
// A pending operation is preserved on every uncertain result. Never delete the
// candidate: its link may have committed even if a reply was lost.
export async function finishPhotoChange(
  change: PhotoChange,
  gateway: PhotoGateway,
  readBytes: () => Promise<Uint8Array>,
  assertCurrent: () => void,
) {
  assertCurrent();
  const expected = requireRevision(change);
  let current = await gateway.read();
  assertCurrent();
  if (!current) throw Error("Save your name before adding a photo.");
  if (!validRevision(current.avatar_revision))
    throw Error("Your saved photo could not be verified. Reload your profile before trying again.");
  const matches = (value: typeof current) => value?.avatar_path === change.target &&
    (value.avatar_revision === expected + 1 ||
      (change.previous === change.target && value.avatar_revision === expected));
  if (!matches(current)) {
    if (current.avatar_path !== change.previous || current.avatar_revision !== expected)
      throw Error(
        "Your photo changed elsewhere. Choose Keep saved photo before making another change.",
      );
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
      if (current && (current.avatar_path !== change.previous || current.avatar_revision !== expected))
        throw Error("Your photo changed elsewhere. Choose Keep saved photo before making another change.");
      throw failure ?? Error("Photo update is unconfirmed. Retry to check the saved photo.");
    }
  }
  // A client read cannot fence a concurrent reattachment on another device.
  // Only the prepared server retirement protocol may remove detached bytes.
  return {
    cleanupPending: change.previous !== null && change.previous !== change.target,
    avatarPath: current!.avatar_path,
    avatarRevision: current!.avatar_revision,
  };
}
