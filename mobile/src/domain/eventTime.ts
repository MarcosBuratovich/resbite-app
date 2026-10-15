import { localDateTime, parseLocalDateTime } from "./plans";
import { localDay, shortDay, spokenDate } from "./schedule";

// UX3 optional end time (spec "Event details"). Editor values stay in the local `YYYY-MM-DD HH:mm` format.
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const parse = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** Without an end, a calendar entry lasts this long (spec: "a calendar entry lasts 1 hour"). */
export const DEFAULT_LENGTH_MS = 60 * 60 * 1000;

/** "10:00 – 12:00"; "22:00 – Sun 11 02:00" when the end is on another day; "10:00" without an end; "" without a start. */
export function timeRange(startIso: string | null, endIso?: string | null): string {
  const start = parse(startIso);
  if (!start) return "";
  const end = parse(endIso);
  if (!end || end <= start) return clock(start);
  const endText = localDay(end) === localDay(start) ? clock(end) : `${shortDay(end)} ${clock(end)}`;
  return `${clock(start)} – ${endText}`;
}

/** How VoiceOver reads the range: "from 10:00 to 12:00", "from 22:00 to 02:00 on Sunday 11 October", or "". */
export function spokenRange(startIso: string | null, endIso: string | null | undefined, now: Date): string {
  const start = parse(startIso);
  const end = parse(endIso);
  if (!start || !end || end <= start) return "";
  const day = localDay(end) === localDay(start) ? "" : ` on ${spokenDate(end, now)}`;
  return `from ${clock(start)} to ${clock(end)}${day}`;
}

/** The editor's end check: none is fine; otherwise a valid local time after the start. */
export function validateEnd(start: string, end: string): string | null {
  if (!end) return null;
  const endDate = parseLocalDateTime(end);
  if (!endDate) return "Choose a valid end time.";
  const startDate = parseLocalDateTime(start);
  if (startDate && endDate.getTime() <= startDate.getTime()) return "The end must be after the start.";
  return null;
}

/** Where "+ End time" starts: an hour after a valid start, else "". */
export function defaultEnd(start: string): string {
  const startDate = parseLocalDateTime(start);
  return startDate ? localDateTime(new Date(startDate.getTime() + DEFAULT_LENGTH_MS)) : "";
}

/**
 * Keeps an end's length when the start moves in the editor (as the database does for older builds): a valid
 * end before the move stays the same length after it.
 */
export function shiftedEnd(previousStart: string, nextStart: string, end: string): string {
  const before = parseLocalDateTime(previousStart);
  const after = parseLocalDateTime(nextStart);
  const endDate = parseLocalDateTime(end);
  if (!before || !after || !endDate || endDate <= before) return end;
  return localDateTime(new Date(after.getTime() + (endDate.getTime() - before.getTime())));
}
