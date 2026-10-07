import { isInviteToken } from "../domain/appLinks";
import type { KeyStore } from "./secureChunks";
const key = "resbite.pending-invite";
export function createPendingInviteStore(
  storage: KeyStore,
  publish: (token: string | null) => void,
) {
  let queue: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let blocked = false;
  const run = <T>(work: () => Promise<T>) => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  function remember(token: string | null, expected?: string) {
    if (token !== null && !isInviteToken(token))
      return Promise.reject(Error("This invitation link is incomplete."));
    if (blocked) return Promise.reject(Error("Sign-out is in progress."));
    const version = ++revision;
    return run(async () => {
      if (expected !== undefined) {
        const saved = await storage.getItem(key);
        if (saved !== expected) {
          if (version === revision)
            publish(isInviteToken(saved) ? saved : null);
          return;
        }
      }
      if (token === null) await storage.removeItem(key);
      else await storage.setItem(key, token);
      if (version === revision) publish(token);
    });
  }
  return {
    remember,
    restore: () => {
      const version = revision;
      return run(async () => {
        const value = await storage.getItem(key);
        if (version === revision) publish(isInviteToken(value) ? value : null);
      });
    },
    beginCleanup: () => {
      blocked = true;
      ++revision;
      return () => {
        blocked = false;
      };
    },
    clear: () => {
      const version = ++revision;
      return run(async () => {
        await storage.removeItem(key);
        if (version === revision) publish(null);
      });
    },
  };
}
