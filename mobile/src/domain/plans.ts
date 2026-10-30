import type { CategoryKey } from "./categories";
import type { EventFields } from "./events";
import { PLAN_COPY } from "./planCopy";
import { planEnd } from "./planEnd";

/** A resbite as stored on the server (CE1: it carries its own event text). */
export type Plan = {
  id: string;
  activity_id: string | null;
  title: string;
  description: string;
  categories: CategoryKey[];
  starts_at: string;
  /** UX3 optional end time; absent on plans loaded before UX3. */
  ends_at?: string | null;
  place_label: string;
  /** UX3 Meeting details visible to this person: "" when there are none or they may not read them. */
  note: string;
  status: string;
  version: number;
  owner_id?: string;
  time_zone?: string;
  /** CE2 cover photo; absent on preview plans and on plans loaded before CE2. */
  cover_path?: string | null;
  cover_revision?: number;
  /** UX2 photo description, read aloud by VoiceOver; "" when none, absent on plans loaded before UX2. */
  cover_description?: string;
  /** Saved coordinates. The app does not set them yet; Open in Maps prefers them when present. */
  latitude?: number | null;
  longitude?: number | null;
  /** UX3 Note to guests: "" when none, with the time it was posted. */
  guest_note?: string;
  guest_note_at?: string | null;
  /** UX3: every invitee may know Meeting details exist; only the organizer and Going or Maybe guests read them. */
  has_meeting_details?: boolean;
  /** GI1 area shown to anyone with the event's link before they reply: "" when none, absent before GI1. */
  area?: string;
  place_tbd: boolean;
  repeat_weeks: 1 | 2 | null;
  series_id: string;
  repeats_from: string | null;
  /** Plan 3: the ids of the people the host made admins (the embed `plan_admins(user_id)`); [] when none. */
  admins: string[];
};

/** A plans row read with its Meeting details embedded as `plan_meeting_details(note)` and its admins as `plan_admins(user_id)`. */
export type PlanRow = Omit<Plan, "note" | "admins"> & {
  note?: string | null;
  plan_admins?: { user_id: string }[] | null;
  plan_meeting_details?: { note: string | null } | { note: string | null }[] | null;
};

/**
 * The app's Plan from a plans row (UX3). Meeting details live in their own table, which the database only
 * returns to the organizer and Going or Maybe guests; the row's own note column is always empty now.
 */
export function planFromRow(row: PlanRow): Plan {
  const { plan_meeting_details: embedded, plan_admins: admins, ...plan } = row;
  const details = Array.isArray(embedded) ? embedded[0] : embedded;
  return { ...plan, note: details?.note ?? "", admins: (admins ?? []).map((a) => a.user_id) };
}

export type PlanDetails = EventFields &
  Pick<Plan, "starts_at" | "place_label" | "note"> & {
    time_zone: string;
    ends_at: string;
    /** GI1 area (trimmed). A save kept on the device before GI1 has none: the stored area stays as it is. */
    area: string;
    place_tbd: boolean;
    repeat_weeks: 1 | 2 | null;
  };

export function canEditPlan(
  plan: Plan,
  userId?: string,
  preview = false,
  now = Date.now(),
  admins: readonly string[] = [],
) {
  return (
    plan.status === "active" &&
    planEnd(plan) > now &&
    (preview ||
      Boolean(userId && (plan.owner_id === userId || admins.includes(userId))))
  );
}

export function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Reject invalid/partial input and calendar rollovers instead of silently moving a plan.
export function parseLocalDateTime(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return null;
  const date = new Date(text.replace(" ", "T"));
  return Number.isFinite(date.getTime()) && localDateTime(date) === text
    ? date
    : null;
}

const sameCategories = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, i) => key === b[i]);
// Two ends match when both are absent or they are the same instant.
const sameEnd = (a: string | null = null, b: string | null = null) =>
  a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

export function samePlanDetails(plan: Plan, details: PlanDetails): boolean {
  return (
    plan.title === details.title.trim() &&
    plan.description === details.description &&
    sameCategories(plan.categories, details.categories) &&
    Date.parse(plan.starts_at) === Date.parse(details.starts_at) &&
    sameEnd(plan.ends_at, details.ends_at) &&
    plan.time_zone === details.time_zone &&
    plan.place_label.trim() === details.place_label.trim() &&
    plan.note === details.note &&
    plan.place_tbd === details.place_tbd &&
    plan.repeat_weeks === details.repeat_weeks &&
    // A save kept before GI1 has no area and leaves the stored one unchanged, so any area matches it.
    (details.area === undefined || (plan.area ?? "").trim() === details.area.trim())
  );
}

export type PlanWrite = {
  id: string;
  /** The idea this event started from, or null when it was started from scratch. */
  activityId: string | null;
  details: PlanDetails;
  version?: number;
};

export type PlanGateway = {
  read: (id: string) => Promise<Plan | null>;
  create: (write: PlanWrite) => Promise<void>;
  update: (write: PlanWrite) => Promise<void>;
  cancel: (plan: { id: string; version: number; stopRepeating?: boolean }) => Promise<number>;
};

export class PlanSaveError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public latest?: Plan | null,
    /** "past": the start is not in the future; "idea": the idea the create started from is withdrawn. */
    public reason?: "past" | "idea",
  ) {
    super(message);
  }
}

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

const errorMessage = (error: unknown) =>
  typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : "";

// A conflict never silently overwrites somebody else's newer plan. A lost reply
// can be acknowledged only when a read confirms precisely the attempted edit.
export async function writePlan(
  gateway: PlanGateway,
  write: PlanWrite,
): Promise<void> {
  try {
    if (write.version === undefined) await gateway.create(write);
    else await gateway.update(write);
  } catch (error) {
    const code = errorCode(error);
    if (code === "40001") {
      let latest: Plan | null;
      try {
        latest = await gateway.read(write.id);
      } catch {
        throw new PlanSaveError(
          "We couldn’t check the latest version of this resbite. Your changes are still here. Retry when you’re connected.",
          true,
        );
      }
      if (
        latest?.status === "active" &&
        latest.version === (write.version ?? 0) + 1 &&
        samePlanDetails(latest, write.details)
      )
        return;
      throw new PlanSaveError(
        "This resbite changed since you opened it. Review the saved details before trying again.",
        false,
        latest,
      );
    }
    if (code === "42501" || code === "PGRST301") {
      throw new PlanSaveError(
        "Your account can’t save this resbite. Private tester access may still be closed. Your changes are still here.",
      );
    }
    if (code === "22023" && /^End time/.test(errorMessage(error))) {
      throw new PlanSaveError("Add an end time.");
    }
    if (code === "22023" && /^Invalid future schedule/.test(errorMessage(error))) {
      throw new PlanSaveError(PLAN_COPY.whenInFuture, false, undefined, "past");
    }
    if (code === "22023" && /^Activity unavailable/.test(errorMessage(error))) {
      throw new PlanSaveError(PLAN_COPY.ideaGone, false, undefined, "idea");
    }
    if (code === "22023") {
      throw new PlanSaveError(
        "This resbite is no longer available for these changes. Your changes are still here; check My resbites before trying again.",
      );
    }
    if (/^(22|23)/.test(code)) {
      throw new PlanSaveError(
        "Check the name, categories, date, place and notes, then try again. Your changes are still here.",
      );
    }
    throw new PlanSaveError(
      "We couldn’t confirm the save. Your changes are still here. Retry the same save when you’re connected; don’t create another resbite yet.",
      true,
    );
  }
}

// Recovery is read-before-retry, never a blind new create after a lost reply.
export async function reconcilePlan(
  gateway: PlanGateway,
  write: PlanWrite,
): Promise<void> {
  let current: Plan | null;
  try {
    current = await gateway.read(write.id);
  } catch {
    throw new PlanSaveError(
      "We couldn’t check the saved resbite. The save is kept on this phone. Try again when you’re connected.",
      true,
    );
  }
  if (
    current &&
    current.activity_id === write.activityId &&
    current.status === "active" &&
    current.version === (write.version ?? 0) + 1 &&
    samePlanDetails(current, write.details)
  )
    return;
  if (
    (!current && write.version === undefined) ||
    (current?.status === "active" && current.version === write.version)
  ) {
    await writePlan(gateway, write);
    return;
  }
  throw new PlanSaveError(
    "The saved plan has changed. Review its current details before making another change.",
    false,
    current,
  );
}

// Cancelling is terminal. Any failure is followed by a read: an already cancelled
// plan is success, so a lost or repeated reply never shows a false error.
export async function cancelPlan(
  gateway: PlanGateway,
  plan: { id: string; version: number; stopRepeating?: boolean },
): Promise<number> {
  let failure: unknown;
  try {
    return await gateway.cancel(plan);
  } catch (error) {
    failure = error;
  }
  let latest: Plan | null;
  try {
    latest = await gateway.read(plan.id);
  } catch {
    throw new PlanSaveError(
      "We couldn’t confirm the cancellation. Check your connection and refresh before trying again.",
      true,
    );
  }
  if (latest?.status === "cancelled") return latest.version;
  const code = errorCode(failure);
  if (code === "42501" || code === "PGRST301")
    throw new PlanSaveError("Your account can’t cancel this plan.", false, latest);
  if (code === "40001")
    throw new PlanSaveError(
      "This plan changed since it loaded. Refresh and review it before cancelling.",
      false,
      latest,
    );
  if (code === "22023")
    throw new PlanSaveError(
      "This resbite has ended or is no longer available.",
      false,
      latest,
    );
  throw new PlanSaveError(
    "We couldn’t confirm the cancellation. Check your connection and try again.",
    true,
    latest,
  );
}
