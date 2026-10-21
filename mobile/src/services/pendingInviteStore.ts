import { isPendingInvite } from "../domain/appLinks";
import type { KeyStore } from "./secureChunks";
const key = "resbite.pending-invite";
const termsKey = "resbite.pending-terms";
/**
 * One kept invitation: a per-person token or (GI1) an event link code, told apart by their shapes
 * (`pendingInviteParams`). A newer link replaces an older one of either kind.
 */
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
    if (token !== null && !isPendingInvite(token))
      return Promise.reject(Error("This invitation link is incomplete."));
    if (blocked) return Promise.reject(Error("Sign-out is in progress."));
    const version = ++revision;
    return run(async () => {
      if (expected !== undefined) {
        const saved = await storage.getItem(key);
        if (saved !== expected) {
          if (version === revision)
            publish(isPendingInvite(saved) ? saved : null);
          return;
        }
      }
      if (token === null) {
        await storage.removeItem(key);
        await storage.removeItem(termsKey);
      } else await storage.setItem(key, token);
      if (version === revision) publish(token);
    });
  }
  return {
    remember,
    restore: () => {
      const version = revision;
      return run(async () => {
        const value = await storage.getItem(key);
        if (version === revision) publish(isPendingInvite(value) ? value : null);
      });
    },
    /** GI2: the Terms version agreed to before sign-in, kept beside the invitation until it is claimed. */
    rememberTerms: (version: string | null) =>
      run(async () => {
        if (version === null) await storage.removeItem(termsKey);
        else await storage.setItem(termsKey, version);
      }),
    readTerms: () => run(() => storage.getItem(termsKey)),
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
        await storage.removeItem(termsKey);
        if (version === revision) publish(null);
      });
    },
  };
}
