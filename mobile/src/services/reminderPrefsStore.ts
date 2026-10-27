import type { KeyStore } from "./secureChunks";

/** UX3 reminder switches (all reminders on or off, events muted one by one) and the ask's flags. */
export type ReminderPrefs = {
  enabled: boolean;
  muted: string[];
  /** UX3's "Get reminders?" was shown. Kept as stored: nothing sets or reads it since Plan 4. */
  asked: boolean;
  /**
   * Plan 4's notification ask ("Get notified?") was shown. A flag of its own, so a phone that said Not now to
   * "Get reminders?" is still asked once.
   */
  notificationsAsked: boolean;
};
/** The most muted events kept; the oldest mute drops off first. */
export const MUTED_MAX = 200;
const defaults = (): ReminderPrefs => ({ enabled: true, muted: [], asked: false, notificationsAsked: false });

// UX3: the account's reminder switches, on this device only, cleared at sign-out and account deletion.
// A convenience: unreadable data reads as the defaults (reminders on, none muted, not asked yet).
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
    const { enabled, muted, asked, notificationsAsked } = saved as Record<string, unknown>;
    return {
      enabled: typeof enabled === "boolean" ? enabled : true,
      muted: Array.isArray(muted)
        ? [...new Set(muted.filter((id): id is string => typeof id === "string" && id !== ""))].slice(-MUTED_MAX)
        : [],
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
    /** Mutes or unmutes one event's reminders; the newest mute is kept last. */
    setMuted: (scope: string, planId: string, muted: boolean, assertCurrent: () => void = () => {}) =>
      change(
        scope,
        (prefs) => {
          const others = prefs.muted.filter((id) => id !== planId);
          return { ...prefs, muted: muted ? [...others, planId].slice(-MUTED_MAX) : others };
        },
        assertCurrent,
      ),
    /** The notification ask was shown on this phone; UX3's `asked` is left as it was. */
    markNotificationsAsked: (scope: string, assertCurrent: () => void = () => {}) =>
      change(scope, (prefs) => ({ ...prefs, notificationsAsked: true }), assertCurrent),
    clear: (scope: string) => run(() => storage.removeItem(key(scope))),
  };
}
export type ReminderPrefsStore = ReturnType<typeof createReminderPrefsStore>;
