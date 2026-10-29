import { PLAN_COPY } from "./planCopy";

type Parts = { weekday: string; day: string; month: string; hour: string; minute: string; year: string };

const partsIn = (iso: string, zone: string): Parts => {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone,
  }).formatToParts(new Date(iso)))
    out[p.type] = p.value;
  return out as Parts;
};

/** "Sat 24 Oct" in the plan's zone. */
export function shortDate(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: zone })
    .format(new Date(iso))
    .replace(",", "");
}

/** "19:00" in the plan's zone. */
export function clockTime(iso: string, zone: string): string {
  const p = partsIn(iso, zone);
  return `${p.hour}:${p.minute}`;
}

/** The plan's local date and time: "2026-10-24" and "19:00". */
export function localParts(iso: string, zone: string): { date: string; time: string } {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone,
  }).formatToParts(new Date(iso)))
    parts[p.type] = p.value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
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
