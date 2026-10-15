import { DEFAULT_LENGTH_MS } from "./eventTime";

// UX3 Add to calendar (spec "Calendar and reminders", UX3-D8). Resbite fills iPhone's own form; the person saves.

export type CalendarSource = { title: string; starts_at: string; ends_at?: string | null; place_label: string };

/** What the form is pre-filled with. Never the Meeting details or a link; no alert of its own (UX3-D8). */
export type CalendarEventDetails = {
  title: string;
  startDate: Date;
  endDate: Date;
  location: string;
  notes: string;
  alarms: [];
};

export const CALENDAR_ADDED_NOTE = "Added from Resbite";
export const CALENDAR_UPDATED_NOTE = "Updated. Remove the earlier entry from your calendar.";

export function calendarEventDetails(plan: CalendarSource, update = false): CalendarEventDetails {
  const startDate = new Date(plan.starts_at);
  const end = plan.ends_at ? new Date(plan.ends_at) : null;
  const endDate = end && end > startDate ? end : new Date(startDate.getTime() + DEFAULT_LENGTH_MS);
  return {
    title: plan.title.trim() || "Resbite",
    startDate,
    endDate,
    location: plan.place_label.trim(),
    notes: update ? CALENDAR_UPDATED_NOTE : CALENDAR_ADDED_NOTE,
    alarms: [],
  };
}

/** What this phone remembers about an added event, to notice a later change of time or place. */
export type CalendarRecord = { starts_at: string; ends_at: string | null; place_label: string };

export function calendarRecordOf(plan: CalendarSource): CalendarRecord {
  return { starts_at: plan.starts_at, ends_at: plan.ends_at ?? null, place_label: plan.place_label.trim() };
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));

/** "Update calendar" shows when an event added on this phone has a new start, end or place. */
export function needsCalendarUpdate(record: CalendarRecord | null | undefined, plan: CalendarSource): boolean {
  if (!record) return false;
  return (
    !sameInstant(record.starts_at, plan.starts_at) ||
    !sameInstant(record.ends_at, plan.ends_at ?? null) ||
    record.place_label !== plan.place_label.trim()
  );
}

/** Who sees the calendar chip: the organizer and Going or Maybe guests, on active events that haven't started. */
export function canAddToCalendar(
  plan: { status: string; starts_at: string },
  view: { owner: boolean; response: string | null },
  now: number,
): boolean {
  return (
    plan.status === "active" &&
    Date.parse(plan.starts_at) > now &&
    (view.owner || view.response === "accepted" || view.response === "maybe")
  );
}
