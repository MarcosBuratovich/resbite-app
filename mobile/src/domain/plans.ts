import type { LocalPlan } from "../state/AppState";

export type PlanDetails = Pick<
  LocalPlan,
  "starts_at" | "place_label" | "note"
> & {
  time_zone: string;
};

export function canEditPlan(
  plan: LocalPlan,
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

export function samePlanDetails(
  plan: LocalPlan,
  details: PlanDetails,
): boolean {
  return (
    Date.parse(plan.starts_at) === Date.parse(details.starts_at) &&
    plan.time_zone === details.time_zone &&
    plan.place_label.trim() === details.place_label.trim() &&
    plan.note === details.note
  );
}

export type PlanWrite = {
  id: string;
  activityId: string;
  details: PlanDetails;
  version?: number;
};

export type PlanGateway = {
  read: (id: string) => Promise<LocalPlan | null>;
  create: (write: PlanWrite) => Promise<void>;
  update: (write: PlanWrite) => Promise<void>;
};

export class PlanSaveError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public latest?: LocalPlan | null,
  ) {
    super(message);
  }
}

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
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "40001") {
      let latest: LocalPlan | null;
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
        "This plan or activity is no longer available for these changes. Your draft is unchanged; check My resbites before trying again.",
      );
    }
    if (/^(22|23)/.test(code)) {
      throw new PlanSaveError(
        "Check the date, meeting place and note, then try again. Your draft is unchanged.",
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
  let current: LocalPlan | null;
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
