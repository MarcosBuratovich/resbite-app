import type { CalendarRecord } from "../domain/calendarEvent";
import type { KeyStore } from "./secureChunks";

/** The most added events remembered; the oldest addition drops off first. */
export const CALENDAR_RECORDS_MAX = 100;
type Entry = CalendarRecord & { planId: string };

const isEntry = (value: unknown): value is Entry => {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.planId === "string" &&
    e.planId !== "" &&
    typeof e.starts_at === "string" &&
    (e.ends_at === null || typeof e.ends_at === "string") &&
    typeof e.place_label === "string"
  );
};

// UX3 Add to calendar: which events this account added on this device, with the start, end and place they
// were added with, so "Update calendar" can show after a change. Cleared at sign-out and account deletion.
// A convenience: unreadable data reads as nothing added.
export function createCalendarRecordStore(storage: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  const key = (scope: string) => `resbite.calendar-records.v1.${scope}`;
  async function read(scope: string): Promise<Entry[]> {
    const raw = await storage.getItem(key(scope));
    let items: unknown;
    try {
      items = raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
    return Array.isArray(items) ? items.filter(isEntry).slice(-CALENDAR_RECORDS_MAX) : [];
  }
  return {
    /** What this phone added for the event, or null when it wasn't added here. */
    get: (scope: string, planId: string): Promise<CalendarRecord | null> =>
      run(() => read(scope))
        .then((entries) => {
          const entry = entries.find((e) => e.planId === planId);
          return entry ? { starts_at: entry.starts_at, ends_at: entry.ends_at, place_label: entry.place_label } : null;
        })
        .catch(() => null),
    remember: (scope: string, planId: string, record: CalendarRecord, assertCurrent: () => void = () => {}) =>
      run(async () => {
        assertCurrent();
        const current = await read(scope);
        assertCurrent();
        const entry: Entry = { planId, starts_at: record.starts_at, ends_at: record.ends_at, place_label: record.place_label };
        const next = [...current.filter((e) => e.planId !== planId), entry].slice(-CALENDAR_RECORDS_MAX);
        await storage.setItem(key(scope), JSON.stringify(next));
      }),
    clear: (scope: string) => run(() => storage.removeItem(key(scope))),
  };
}
export type CalendarRecordStore = ReturnType<typeof createCalendarRecordStore>;
