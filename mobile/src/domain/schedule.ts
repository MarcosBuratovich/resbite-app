import { localDateTime, parseLocalDateTime } from "./plans";

// The UX1 "When" step. Values stay in the editor's local `YYYY-MM-DD HH:mm` format.
// Days are calendar days in the device's zone, never "now + 24 hours".
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Local midnight `days` calendar days after `date`; safe across clock changes. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The local calendar day of `date` as YYYY-MM-DD. */
export function localDay(date: Date): string {
  return localDateTime(date).slice(0, 10);
}

/** "Saturday 10 October", with the year when it is not the current year. */
export function spokenDate(date: Date, now: Date): string {
  const text = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

/** "Saturday 10 October at 10:00": how chips and cards read to VoiceOver. */
export function spokenDateTime(date: Date, now: Date): string {
  return `${spokenDate(date, now)} at ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Sat 10": the short form on a day tile. */
export function shortDay(date: Date): string {
  return `${WEEKDAYS[date.getDay()].slice(0, 3)} ${date.getDate()}`;
}

export type DayKey = "today" | "tomorrow" | "weekend";
export type DayOption = { key: DayKey; day: string; text: string; label: string };

/** Today, Tomorrow and the weekend tile: the next Saturday that is neither today nor tomorrow, or Sunday when tomorrow is Saturday. */
export function quickDays(now: Date): DayOption[] {
  const today = addDays(now, 0);
  const tomorrow = addDays(now, 1);
  let weekend: Date;
  if (tomorrow.getDay() === 6) weekend = addDays(now, 2);
  else {
    let ahead = (6 - today.getDay() + 7) % 7;
    if (ahead < 2) ahead += 7;
    weekend = addDays(now, ahead);
  }
  return [
    { key: "today", day: localDay(today), text: "Today", label: `Today, ${spokenDate(today, now)}` },
    { key: "tomorrow", day: localDay(tomorrow), text: "Tomorrow", label: `Tomorrow, ${spokenDate(tomorrow, now)}` },
    { key: "weekend", day: localDay(weekend), text: shortDay(weekend), label: spokenDate(weekend, now) },
  ];
}

export const QUICK_TIMES = ["09:00", "10:00", "13:00", "18:00"] as const;
export type TimeOption = { time: string; label: string; disabled: boolean };

/** Quick times on a chosen day. A time at or before now is disabled, as validatePlan would refuse it; with no day chosen, every time is disabled. */
export function quickTimes(day: string | null, now: Date): TimeOption[] {
  return QUICK_TIMES.map((time) => {
    const at = day ? parseLocalDateTime(`${day} ${time}`) : null;
    return {
      time,
      label: at ? spokenDateTime(at, now) : time,
      disabled: !at || at.getTime() <= now.getTime(),
    };
  });
}

/** Splits a valid editor value. Anything else (empty, partial or a calendar rollover) has neither part. */
export function splitLocal(value: string): { day: string | null; time: string | null } {
  return parseLocalDateTime(value)
    ? { day: value.slice(0, 10), time: value.slice(11) }
    : { day: null, time: null };
}

export function joinLocal(day: string, time: string): string {
  return `${day} ${time}`;
}

/** The time a new resbite starts at, and the picker's time when none is chosen yet. */
export const DEFAULT_TIME = "10:00";

/** A new resbite starts tomorrow at 10:00 local time (a quick day and a quick time), never "now + 24 hours". */
export function defaultStart(now: Date): string {
  return joinLocal(localDay(addDays(now, 1)), DEFAULT_TIME);
}

/** Where the native picker opens: the chosen day at the chosen time (or 10:00), else the current value, else tomorrow at 10:00. */
export function pickerSeed(value: string, day: string | null, now: Date): Date {
  const time = splitLocal(value).time ?? DEFAULT_TIME;
  return (
    (day ? parseLocalDateTime(joinLocal(day, time)) : null) ??
    parseLocalDateTime(value) ??
    parseLocalDateTime(defaultStart(now)) ??
    addDays(now, 1)
  );
}

/** The value after a native pick: a picked time keeps the seed's day, a picked date keeps the seed's time. */
export function pickedValue(mode: "date" | "time", picked: Date, seed: Date): string {
  const from = mode === "date" ? [picked, seed] : [seed, picked];
  return joinLocal(localDay(from[0]), localDateTime(from[1]).slice(11));
}

/** The When step's zone line: "Buenos Aires time" for "America/Argentina/Buenos_Aires" (the last part, with spaces). */
export function zoneLabel(zone: string): string {
  const city = (zone.split("/").pop() || zone).replaceAll("_", " ");
  return `${city || "Local"} time`;
}
