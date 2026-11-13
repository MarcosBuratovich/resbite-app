import { PLAN_COPY } from "./planCopy";

// The plan's local wall clock, one number at a time. Never `formatToParts`: Hermes on iOS answers it with the whole
// string as one literal part and no hour, minute, year, month or day parts, which read "undefined:undefined" on the
// iPhone (12 Nov 2026). A one-field `format` gives just that field's digits everywhere. Formatters are kept per zone and
// field, since a chat reads one date per message.
type Field = "year" | "month" | "day" | "hour" | "minute";
const FIELD_OPTIONS: Record<Field, Intl.DateTimeFormatOptions> = {
  year: { year: "numeric" },
  month: { month: "2-digit" },
  day: { day: "2-digit" },
  hour: { hour: "2-digit", hourCycle: "h23" },
  minute: { minute: "2-digit" },
};
const formatters = new Map<string, Intl.DateTimeFormat>();
const digits = (date: Date, zone: string, field: Field): string => {
  const key = `${zone}|${field}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { ...FIELD_OPTIONS[field], timeZone: zone });
    formatters.set(key, f);
  }
  return f.format(date).replace(/\D/g, "");
};
const pad = (n: string, width: number): string => n.padStart(width, "0").slice(-width);
const wall = (iso: string, zone: string) => {
  const d = new Date(iso);
  const hour = pad(digits(d, zone, "hour"), 2);
  return {
    year: digits(d, zone, "year"),
    month: pad(digits(d, zone, "month"), 2),
    day: pad(digits(d, zone, "day"), 2),
    // Some engines write midnight as 24 even with h23.
    hour: hour === "24" ? "00" : hour,
    minute: pad(digits(d, zone, "minute"), 2),
  };
};

/** "Sat 24 Oct" in the plan's zone. */
export function shortDate(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: zone })
    .format(new Date(iso))
    .replace(",", "");
}

/** "19:00" in the plan's zone. */
export function clockTime(iso: string, zone: string): string {
  const p = wall(iso, zone);
  return `${p.hour}:${p.minute}`;
}

/** The plan's local date and time: "2026-10-24" and "19:00". */
export function localParts(iso: string, zone: string): { date: string; time: string } {
  const p = wall(iso, zone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** "Sat 24 Oct · 19:00 to 22:00", "… · All day", "… · 22:00 to Sun 25 Oct 02:00", or just the start. */
export function whenLine(startsAt: string, endsAt: string | null, zone: string): string {
  const head = `${shortDate(startsAt, zone)} · `;
  const start = clockTime(startsAt, zone);
  if (!endsAt) return `${head}${start}`;
  const end = clockTime(endsAt, zone);
  const sameDay = localParts(startsAt, zone).date === localParts(endsAt, zone).date;
  if (!sameDay) return `${head}${start} to ${shortDate(endsAt, zone)} ${end}`;
  if (start === "00:00" && end === "23:59") return `${head}${PLAN_COPY.allDay}`;
  return `${head}${start} to ${end}`;
}

/** "Every Thursday" or "Every other Thursday"; null when it does not repeat. */
export function repeatLine(startsAt: string, zone: string, repeatWeeks: 1 | 2 | null): string | null {
  if (!repeatWeeks) return null;
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: zone }).format(new Date(startsAt));
  return repeatWeeks === 1 ? `Every ${weekday}` : `Every other ${weekday}`;
}

/** The Repeats choice: "Doesn’t repeat", "Every week", "Every 2 weeks". */
export function repeatChoice(repeatWeeks: 1 | 2 | null): string {
  return repeatWeeks === 1 ? PLAN_COPY.everyWeek : repeatWeeks === 2 ? PLAN_COPY.everyTwoWeeks : PLAN_COPY.noRepeat;
}
