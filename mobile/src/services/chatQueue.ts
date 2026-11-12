import type { KeyStore } from "./secureChunks";

/** A message written on this phone and not yet confirmed by the server, resent with its own client id (K-S7). */
export type QueuedMessage = {
  clientId: string;
  series: string;
  body: string;
  /** When it was written, as ISO text. */
  createdAt: string;
  /** The last send failed: it shows "Not sent. Tap to retry." and is resent only by a tap. */
  failed: boolean;
};

/** At most this many unsent messages per account, so a phone left offline can't grow the record without end (H20). */
export const MAX_QUEUED = 100;
const INVALID = "Invalid queued message";

const isItem = (value: unknown): value is QueuedMessage => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clientId === "string" &&
    typeof v.series === "string" &&
    typeof v.body === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.failed === "boolean"
  );
};
const copy = (item: QueuedMessage): QueuedMessage => ({
  clientId: item.clientId,
  series: item.series,
  body: item.body,
  createdAt: item.createdAt,
  failed: item.failed,
});

/**
 * The unsent chat messages, on this phone only, by account. The shape of `createInviteCodeStore`: one serial `run`, an
 * epoch per scope, and `suspend`/`resume` around sign-out, so a write issued after sign-out began, or finishing after
 * the clear, never brings the messages back.
 */
export function createChatQueue(store: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };
  const epochs = new Map<string, number>();
  const blocked = new Set<string>();
  const key = (scope: string) => `resbite.chat-queue.v1.${scope}`;
  async function read(scope: string): Promise<QueuedMessage[]> {
    const raw = await store.getItem(key(scope));
    if (!raw) return [];
    // A damaged record reads as empty and the next write replaces it, so it never stops this account from queuing
    // (H20). One damaged item never holds the others back either; the next write leaves it out.
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
    return Array.isArray(data) ? data.filter(isItem).map(copy) : [];
  }
  const epochOf = (scope: string) => epochs.get(scope) ?? 0;
  function change(scope: string, update: (items: QueuedMessage[]) => QueuedMessage[]) {
    if (blocked.has(scope)) return Promise.reject(Error("Session changed"));
    const epoch = epochOf(scope);
    return run(async () => {
      if (epoch !== epochOf(scope)) throw Error("Session changed");
      const current = await read(scope);
      if (blocked.has(scope) || epoch !== epochOf(scope)) throw Error("Session changed");
      await store.setItem(key(scope), JSON.stringify(update(current)));
    });
  }
  return {
    suspend: (scope: string) => {
      blocked.add(scope);
      epochs.set(scope, epochOf(scope) + 1);
    },
    resume: (scope: string) => {
      blocked.delete(scope);
    },
    /** A series' unsent messages, oldest first. */
    list: (scope: string, series: string) =>
      run(async () => (await read(scope)).filter((item) => item.series === series)),
    /**
     * Adds the message, or replaces the one with its client id where it stands. A partial item is refused, and so is
     * a new one past `MAX_QUEUED` (H20).
     */
    put: (scope: string, item: QueuedMessage) => {
      if (!isItem(item)) return Promise.reject(Error(INVALID));
      const saved = copy(item);
      return change(scope, (items) => {
        if (items.some((i) => i.clientId === saved.clientId))
          return items.map((i) => (i.clientId === saved.clientId ? saved : i));
        if (items.length >= MAX_QUEUED) throw Error("Too many unsent messages");
        return [...items, saved];
      });
    },
    /** Marks a message failed or not; a client id that isn't queued is left alone. A patch without a boolean is refused. */
    update: (scope: string, clientId: string, patch: { failed: boolean }) => {
      if (!patch || typeof patch.failed !== "boolean") return Promise.reject(Error(INVALID));
      const failed = patch.failed;
      return change(scope, (items) => items.map((i) => (i.clientId === clientId ? { ...i, failed } : i)));
    },
    remove: (scope: string, clientId: string) =>
      change(scope, (items) => items.filter((i) => i.clientId !== clientId)),
    /** Takes off, in one write, every message of the account that `drop` picks, in any series (H26 Q6). */
    prune: (scope: string, drop: (item: QueuedMessage) => boolean) =>
      change(scope, (items) => items.filter((i) => !drop(i))),
    clear: (scope: string) => {
      epochs.set(scope, epochOf(scope) + 1);
      return run(() => store.removeItem(key(scope)));
    },
  };
}

// The secure storage loads on first use, so the queue's logic runs under node without React Native.
const device = async () => (await import("./supabase")).storage;
export const chatQueue = createChatQueue({
  getItem: async (k) => (await device()).getItem(k),
  setItem: async (k, v) => (await device()).setItem(k, v),
  removeItem: async (k) => (await device()).removeItem(k),
});
