export type SessionContext = { account: string | null; preview: boolean };
type Dependencies = {
  suspend: (scope: string) => void;
  resume: (scope: string) => void;
  clearPeople: (scope: string) => Promise<void>;
  clearPhoto: (scope: string) => Promise<void>;
  blockPending: () => () => void;
  clearPending: () => Promise<void>;
  clearDrafts?: (scope: string) => Promise<void>;
  authSignOut: (localOnly?: boolean) => Promise<void>;
  finish: (preview: boolean) => void;
  busy: (value: boolean) => void;
};
export function createSessionLifecycle(deps: Dependencies) {
  let context: SessionContext = { account: null, preview: false };
  let epoch = 0;
  let flight: Promise<void> | null = null;
  const deletedAccounts = new Set<string>();
  const identity = (c: SessionContext) => `${c.account}:${c.preview}`;
  return {
    update(next: SessionContext) {
      if (identity(next) !== identity(context)) {
        if (context.account) deps.suspend(context.account);
        if (context.preview) deps.suspend("preview");
        context = next;
        ++epoch;
        if (next.preview) deps.resume("preview");
        else if (next.account && !deletedAccounts.has(next.account))
          deps.resume(next.account);
      }
    },
    capture() {
      const version = epoch;
      return () => {
        if (
          flight ||
          version !== epoch ||
          (context.account && deletedAccounts.has(context.account))
        )
          throw Error("Session changed. Please try again.");
      };
    },
    finishAccountDeletion(expectedAccount: string): Promise<void> {
      if (context.preview || context.account !== expectedAccount)
        return Promise.reject(
          Error("Account changed before deletion cleanup."),
        );
      if (flight)
        return Promise.reject(
          Error("Account cleanup is already running. Retry deletion cleanup."),
        );
      deletedAccounts.add(expectedAccount);
      return this.signOut(true);
    },
    signOut(deleteAccount = false): Promise<void> {
      if (flight) return flight;
      const original = context;
      const scope = original.preview ? "preview" : original.account;
      ++epoch;
      if (scope) deps.suspend(scope);
      const unblock = original.preview ? () => {} : deps.blockPending();
      deps.busy(true);
      const current = () => {
        if (identity(context) !== identity(original))
          throw Error(
            "The account changed during sign-out. Please review the current account.",
          );
      };
      // The microtask lets every concurrent caller receive the same flight.
      flight = Promise.resolve().then(async () => {
        let completed = false;
        try {
          if (scope) {
            if (deleteAccount) {
              if (!deps.clearDrafts)
                throw Error("Draft cleanup is unavailable.");
              await deps.clearDrafts(scope);
              current();
            }
            await deps.clearPeople(scope);
            current();
            if (!original.preview) await deps.clearPhoto(scope);
            current();
          }
          if (!original.preview) {
            await deps.clearPending();
            current();
            if (original.account) await deps.authSignOut(deleteAccount);
            // SIGNED_OUT may already have delivered a null session.
            if (
              context.preview ||
              (context.account && context.account !== original.account)
            )
              current();
          } else current();
          deps.finish(original.preview);
          completed = true;
        } finally {
          if (
            !completed &&
            !deleteAccount &&
            scope &&
            !deletedAccounts.has(scope) &&
            identity(context) === identity(original)
          )
            deps.resume(scope);
          unblock();
          flight = null;
          deps.busy(false);
        }
      });
      return flight;
    },
  };
}
