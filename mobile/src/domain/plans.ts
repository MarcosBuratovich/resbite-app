import type { CategoryKey } from "./categories";
import type { EventFields } from "./events";

/** A resbite as stored on the server (CE1: it carries its own event text). */
export type Plan = {
  id: string;
  activity_id: string | null;
  title: string;
  description: string;
  categories: CategoryKey[];
  starts_at: string;
  place_label: string;
  note: string;
  status: string;
  version: number;
  owner_id?: string;
  time_zone?: string;
  /** CE2 cover photo; absent on preview plans and on plans loaded before CE2. */
  cover_path?: string | null;
  cover_revision?: number;
};

export type PlanDetails = EventFields &
  Pick<Plan, "starts_at" | "place_label" | "note"> & { time_zone: string };

export function canEditPlan(
  plan: Plan,
  userId?: string,
  preview = false,
  now = Date.now(),
) {
  return (
    plan.status === "active" &&
    Date.parse(plan.starts_at) > now &&
    (preview || Boolean(userId && plan.owner_id === userId))
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

export function samePlanDetails(plan: Plan, details: PlanDetails): boolean {
  return (
    plan.title === details.title.trim() &&
    plan.description === details.description &&
    sameCategories(plan.categories, details.categories) &&
    Date.parse(plan.starts_at) === Date.parse(details.starts_at) &&
    plan.time_zone === details.time_zone &&
    plan.place_label.trim() === details.place_label.trim() &&
    plan.note === details.note
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
  cancel: (plan: { id: string; version: number }) => Promise<void>;
};

export class PlanSaveError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public latest?: Plan | null,
  ) {
    super(message);
  }
}

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
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
          "We couldn’t check the latest plan. Your draft is here. Retry when you’re connected.",
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
        "This plan changed since you opened it. Your draft is still here. Review the saved details before trying again.",
        false,
        latest,
      );
    }
    if (code === "42501" || code === "PGRST301") {
      throw new PlanSaveError(
        "Your account can’t save this plan. Private tester access may still be closed. Your draft is unchanged.",
      );
    }
    if (code === "22023") {
      throw new PlanSaveError(
        "This plan or idea is no longer available for these changes. Your draft is unchanged; check My resbites before trying again.",
      );
    }
    if (/^(22|23)/.test(code)) {
      throw new PlanSaveError(
        "Check the name, categories, date, meeting place and note, then try again. Your draft is unchanged.",
      );
    }
    throw new PlanSaveError(
      "We couldn’t confirm the save. Your draft is kept here. Retry the same save when you’re connected; don’t create another plan yet.",
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
      "We couldn’t check the saved plan. Your draft and original save are kept. Try again when connected.",
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
  plan: { id: string; version: number },
): Promise<void> {
  let failure: unknown;
  try {
    await gateway.cancel(plan);
    return;
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
  if (latest?.status === "cancelled") return;
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
      "This plan has already started or is no longer available.",
      false,
      latest,
    );
  throw new PlanSaveError(
    "We couldn’t confirm the cancellation. Check your connection and try again.",
    true,
    latest,
  );
}
