import type { KeyStore } from "./secureChunks";

/** UX3 reminder switches (all reminders on or off) and the ask's flags. Mutes live on the server (Plan 3). */
export type ReminderPrefs = {
  enabled: boolean;
  /** UX3's "Get reminders?" was shown. Kept as stored: nothing sets or reads it since Plan 4. */
  asked: boolean;
  /**
   * Plan 4's notification ask ("Get notified?") was shown. A flag of its own, so a phone that said Not now to
   * "Get reminders?" is still asked once.
   */
  notificationsAsked: boolean;
};
const defaults = (): ReminderPrefs => ({ enabled: true, asked: false, notificationsAsked: false });

// UX3: the account's reminder switches, on this device only, cleared at sign-out and account deletion.
// A convenience: unreadable data reads as the defaults (reminders on, not asked yet).
export function createReminderPrefsStore(storage: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  const key = (scope: string) => `resbite.reminder-prefs.v1.${scope}`;
  async function read(scope: string): Promise<ReminderPrefs> {
    const raw = await storage.getItem(key(scope));
    let saved: unknown;
    try {
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      return defaults();
    }
    if (typeof saved !== "object" || saved === null) return defaults();
    // A `muted` list stored by an older version is ignored: mutes are the server's now.
    const { enabled, asked, notificationsAsked } = saved as Record<string, unknown>;
    return {
      enabled: typeof enabled === "boolean" ? enabled : true,
      asked: asked === true,
      notificationsAsked: notificationsAsked === true,
    };
  }
  const change = (scope: string, edit: (prefs: ReminderPrefs) => ReminderPrefs, assertCurrent: () => void) =>
    run(async () => {
      assertCurrent();
      const next = edit(await read(scope));
      assertCurrent();
      await storage.setItem(key(scope), JSON.stringify(next));
      return next;
    });
  return {
    read: (scope: string): Promise<ReminderPrefs> => run(() => read(scope)).catch(defaults),
    setEnabled: (scope: string, enabled: boolean, assertCurrent: () => void = () => {}) =>
      change(scope, (prefs) => ({ ...prefs, enabled }), assertCurrent),
    /** The notification ask was shown on this phone; UX3's `asked` is left as it was. */
    markNotificationsAsked: (scope: string, assertCurrent: () => void = () => {}) =>
      change(scope, (prefs) => ({ ...prefs, notificationsAsked: true }), assertCurrent),
    clear: (scope: string) => run(() => storage.removeItem(key(scope))),
  };
}
export type ReminderPrefsStore = ReturnType<typeof createReminderPrefsStore>;
