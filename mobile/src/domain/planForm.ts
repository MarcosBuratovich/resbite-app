import { validCategories, type CategoryKey } from "./categories";
import type { Plan, PlanDetails } from "./plans";
import { PLAN_COPY } from "./planCopy";
import { localParts, repeatChoice, whenLine } from "./whenText";

export type RepeatWeeks = 1 | 2 | null;

export type PlanForm = {
  title: string;
  description: string;
  categories: CategoryKey[];
  /** "YYYY-MM-DD" */
  date: string | null;
  /** "HH:mm" */
  start: string | null;
  end: string | null;
  repeatWeeks: RepeatWeeks;
  place: string;
  placeTbd: boolean;
  area: string;
  meetingDetails: string;
  guestNote: string;
};

/** Nothing is pre-filled: no date, no start, no end, no place. */
export const EMPTY_FORM: PlanForm = {
  title: "",
  description: "",
  categories: [],
  date: null,
  start: null,
  end: null,
  repeatWeeks: null,
  place: "",
  placeTbd: false,
  area: "",
  meetingDetails: "",
  guestNote: "",
};

export type MissingItem = "name" | "when" | "place" | "categories";

/** What the form still lacks, in screen order. */
export function missingItems(form: PlanForm): MissingItem[] {
  const items: MissingItem[] = [];
  if (!form.title.trim()) items.push("name");
  if (!form.date || !form.start || !form.end) items.push("when");
  if (!form.placeTbd && !form.place.trim()) items.push("place");
  if (!validCategories(form.categories)) items.push("categories");
  return items;
}

const PHRASE: Record<MissingItem, string> = {
  name: PLAN_COPY.missingName,
  when: PLAN_COPY.missingWhen,
  place: PLAN_COPY.missingPlace,
  categories: PLAN_COPY.missingCategories,
};
const COUNT = ["", PLAN_COPY.oneMissing, PLAN_COPY.twoMissing, PLAN_COPY.threeMissing, PLAN_COPY.fourMissing];

/** "Two things are missing: a date and time, and a place."; null when nothing is missing. */
export function missingLine(items: MissingItem[]): string | null {
  if (items.length === 0) return null;
  const phrases = items.map((item) => PHRASE[item]);
  const and = PLAN_COPY.and;
  const list =
    phrases.length === 1
      ? phrases[0]
      : phrases.length === 2
        ? `${phrases[0]}, ${and} ${phrases[1]}`
        : `${phrases.slice(0, -1).join(", ")}, ${and} ${phrases[phrases.length - 1]}`;
  return `${COUNT[items.length]}: ${list}.`;
}

const ROW: Record<MissingItem, string> = {
  name: PLAN_COPY.nameRowMessage,
  when: PLAN_COPY.whenRowMessage,
  place: PLAN_COPY.placeRowMessage,
  categories: PLAN_COPY.categoriesRowMessage,
};
export const rowMessage = (item: MissingItem): string => ROW[item];

const pad = (n: number) => String(n).padStart(2, "0");
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** The zone's offset from UTC, in ms, at the instant `at`. */
function offsetAt(at: number, zone: string): number {
  const { date, time } = localParts(new Date(at).toISOString(), zone);
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5))) - Math.floor(at / 60000) * 60000;
}

/** The instant at which the wall clock in `zone` reads `date` `time`. */
function instantIn(date: string, time: string, zone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  let at = wall - offsetAt(wall, zone);
  at = wall - offsetAt(at, zone);
  return new Date(at).toISOString();
}

/** The start and end instants of a complete form; an end not later than the start is the next day. */
export function formInstants(form: PlanForm, zone: string): { starts_at: string; ends_at: string } | null {
  if (!form.date || !form.start || !form.end) return null;
  let endDate = form.date;
  if (minutesOf(form.end) <= minutesOf(form.start)) {
    const [y, mo, d] = form.date.split("-").map(Number);
    endDate = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
  }
  return { starts_at: instantIn(form.date, form.start, zone), ends_at: instantIn(endDate, form.end, zone) };
}

/**
 * The When row's text: the line, and the repeat choice when there is one. A start without an end
 * (a resbite made before ends existed) shows the start only; null while there is no date and start.
 */
export function whenRowText(form: PlanForm, zone: string): { line: string; repeat: string | null } | null {
  const instants = formInstants(form, zone);
  const repeat = form.repeatWeeks ? repeatChoice(form.repeatWeeks) : null;
  if (instants) return { line: whenLine(instants.starts_at, instants.ends_at, zone), repeat };
  if (!form.date || !form.start) return null;
  return { line: whenLine(instantIn(form.date, form.start, zone), null, zone), repeat };
}

/** Sets the end from the start; "allDay" is 00:00 to 23:59. Without a start a number does nothing. */
export function applyDuration(form: PlanForm, minutes: 30 | 60 | 120 | 180 | "allDay"): PlanForm {
  if (minutes === "allDay") return { ...form, start: "00:00", end: "23:59" };
  if (!form.start) return form;
  return { ...form, end: timeOf(minutesOf(form.start) + minutes) };
}

/** A new start at or after the end moves the end, keeping the previous duration (wrapping at 24 h). */
export function moveStart(form: PlanForm, start: string): PlanForm {
  if (!form.start || !form.end || minutesOf(start) < minutesOf(form.end)) return { ...form, start };
  const duration = (minutesOf(form.end) - minutesOf(form.start) + 1440) % 1440;
  return { ...form, start, end: timeOf(minutesOf(start) + duration) };
}

export function formFromIdea(a: { title: string; description: string; categories: CategoryKey[] }): PlanForm {
  return { ...EMPTY_FORM, title: a.title, description: a.description, categories: a.categories };
}

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function formFromPlan(plan: Plan): PlanForm {
  const zone = plan.time_zone ?? deviceZone();
  const start = localParts(plan.starts_at, zone);
  const end = plan.ends_at ? localParts(plan.ends_at, zone) : null;
  const placeTbd = plan.place_tbd ?? false;
  return {
    title: plan.title,
    description: plan.description,
    categories: plan.categories,
    date: start.date,
    start: start.time,
    end: end ? end.time : null,
    repeatWeeks: plan.repeat_weeks ?? null,
    place: placeTbd ? "" : plan.place_label,
    placeTbd,
    area: plan.area ?? "",
    meetingDetails: plan.note,
    guestNote: plan.guest_note ?? "",
  };
}

/** Do it again (spec rule 1, CR-P10): the text, the place and the categories; never the when or the note to guests. */
export function formForAgain(plan: Plan): PlanForm {
  return { ...formFromPlan(plan), date: null, start: null, end: null, repeatWeeks: null, guestNote: "" };
}

/** The details a complete form saves. Callers run `missingItems` first; an incomplete form throws. */
export function detailsFromForm(form: PlanForm, zone: string): PlanDetails {
  const instants = formInstants(form, zone);
  if (!instants) throw new Error("detailsFromForm needs a date, a start and an end; run missingItems first");
  return {
    title: form.title.trim(),
    description: form.description,
    categories: form.categories,
    starts_at: instants.starts_at,
    ends_at: instants.ends_at,
    place_label: form.placeTbd ? PLAN_COPY.toBeDecided : form.place.trim(),
    place_tbd: form.placeTbd,
    repeat_weeks: form.repeatWeeks,
    note: form.meetingDetails.trim(),
    area: form.area.trim(),
    time_zone: zone,
  };
}

/** Two times are the same instant; absent ("" or null) matches only absent. The server writes `+00:00`, the app `.000Z`. */
const sameInstant = (a: string | null | undefined, b: string | null | undefined) =>
  !a || !b ? !a === !b : Date.parse(a) === Date.parse(b);

/** Whether a save changes what guests plan around: start, end, zone or place. */
export function timeOrPlaceChanged(before: PlanDetails, after: PlanDetails): boolean {
  return (
    !sameInstant(before.starts_at, after.starts_at) ||
    !sameInstant(before.ends_at, after.ends_at) ||
    before.time_zone !== after.time_zone ||
    before.place_label !== after.place_label ||
    (before.place_tbd ?? false) !== (after.place_tbd ?? false)
  );
}

/** Guests a change reaches: accepted, maybe and pending. */
export function notifyCount(guests: { response: string }[]): number {
  return guests.filter((g) => g.response === "accepted" || g.response === "maybe" || g.response === "pending").length;
}

const people = (n: number) => `${n} ${n === 1 ? PLAN_COPY.person : PLAN_COPY.people}`;

export function saveLabel(n: number, changed: boolean): string {
  return !changed || n === 0 ? PLAN_COPY.save : `${PLAN_COPY.saveAndNotify} ${people(n)}`;
}

export function notifyBanner(n: number): string | null {
  return n === 0 ? null : `${people(n)} ${PLAN_COPY.notifyTold}`;
}
