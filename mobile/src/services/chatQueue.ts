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
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw Error("Invalid saved messages");
    // One damaged item never holds the others back; the next write leaves it out.
    return data.filter(isItem).map(copy);
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
    /** Adds the message, or replaces the one with its client id where it stands. */
    put: (scope: string, item: QueuedMessage) =>
      change(scope, (items) =>
        items.some((i) => i.clientId === item.clientId)
          ? items.map((i) => (i.clientId === item.clientId ? copy(item) : i))
          : [...items, copy(item)],
      ),
    /** Marks a message failed or not; a client id that isn't queued is left alone. */
    update: (scope: string, clientId: string, patch: { failed: boolean }) =>
      change(scope, (items) => items.map((i) => (i.clientId === clientId ? { ...i, failed: patch.failed } : i))),
    remove: (scope: string, clientId: string) =>
      change(scope, (items) => items.filter((i) => i.clientId !== clientId)),
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
