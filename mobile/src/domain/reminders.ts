// UX3 reminders (spec "Calendar and reminders", UX3-D4): two local notifications, 1 day and 1 hour before the
// start, for events the person organizes or answered Going or Maybe. Name and time only, never the place.

export type ReminderSource = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  owner: boolean;
  response: string | null;
};
export type Reminder = { id: string; planId: string; at: Date; body: string };
export type ScheduledReminder = { id: string; at: number | null; body: string };

/** Every reminder identifier starts with this, so syncing never touches other notifications. */
export const REMINDER_PREFIX = "resbite-reminder:";
/** iOS keeps at most 64 pending local notifications per app; stay well under it, soonest first. */
export const REMINDER_LIMIT = 60;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

export function remindersWanted(source: ReminderSource): boolean {
  return source.status === "active" && (source.owner || source.response === "accepted" || source.response === "maybe");
}

/** The reminders this phone should have: none when switched off; none for muted, past or other events. */
export function plannedReminders(
  sources: readonly ReminderSource[],
  options: { now: Date; enabled: boolean; muted: ReadonlySet<string> },
): Reminder[] {
  if (!options.enabled) return [];
  const now = options.now.getTime();
  const reminders: Reminder[] = [];
  for (const source of sources) {
    if (!remindersWanted(source) || options.muted.has(source.id)) continue;
    const start = new Date(source.starts_at);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= now) continue;
    const title = source.title.trim() || "your resbite";
    const clock = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const day = new Date(start.getTime() - DAY);
    const hour = new Date(start.getTime() - HOUR);
    if (day.getTime() > now)
      reminders.push({ id: `${REMINDER_PREFIX}${source.id}:1d`, planId: source.id, at: day, body: `Tomorrow at ${clock} · ${title}` });
    if (hour.getTime() > now)
      reminders.push({ id: `${REMINDER_PREFIX}${source.id}:1h`, planId: source.id, at: hour, body: `In 1 hour · ${title}` });
  }
  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, REMINDER_LIMIT);
}

/** What to cancel and what to schedule so the phone holds exactly `wanted` (only Resbite reminders are touched). */
export function reminderChanges(
  scheduled: readonly ScheduledReminder[],
  wanted: readonly Reminder[],
): { cancel: string[]; schedule: Reminder[] } {
  const ours = scheduled.filter((s) => s.id.startsWith(REMINDER_PREFIX));
  const want = new Map(wanted.map((r) => [r.id, r]));
  const cancel = ours.filter((s) => {
    const w = want.get(s.id);
    return !w || w.at.getTime() !== s.at || w.body !== s.body;
  });
  const kept = new Set(ours.filter((s) => !cancel.includes(s)).map((s) => s.id));
  return { cancel: cancel.map((s) => s.id), schedule: wanted.filter((r) => !kept.has(r.id)) };
}
