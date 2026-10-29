import { supabase } from "./supabase";
import { planFromRow, type PlanGateway, type PlanRow } from "../domain/plans";
import { createGuestNoteWriter } from "./guestNote";

export async function withDeadline<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// UX3: Meeting details come from their own table, embedded only for people allowed to read them.
const planColumns =
  "id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,status,version,owner_id,has_meeting_details,guest_note,guest_note_at,area,place_tbd,repeat_weeks,series_id,repeats_from,plan_meeting_details(note),plan_admins(user_id)";

/** The event page's and editor's plan read: every column, the Meeting details this person may read and the admins. */
export const planWithDetails = "*,plan_meeting_details(note),plan_admins(user_id)";

/** GI1: the trimmed area; null (leave it as it is) for a save kept on the device before GI1. */
const sentArea = (area: string | undefined) => (typeof area === "string" ? area.trim() : null);

export const planGateway: PlanGateway = {
  async read(id) {
    const { data, error } = await withDeadline((signal) =>
      supabase
        .from("plans")
        .select(planColumns)
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle(),
    );
    if (error) throw error;
    return data ? planFromRow(data as PlanRow) : null;
  },
  async create({ id, activityId, details }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("create_plan_v4", {
          p_id: id,
          p_title: details.title,
          p_description: details.description,
          p_categories: details.categories,
          p_activity: activityId,
          p_start: details.starts_at,
          p_ends: details.ends_at,
          p_zone: details.time_zone,
          p_place: details.place_label,
          p_place_tbd: details.place_tbd,
          p_repeat_weeks: details.repeat_weeks,
          p_note: details.note,
          p_area: sentArea(details.area),
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
  async update({ id, version, details }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("change_plan_v4", {
          p_plan: id,
          p_version: version,
          p_title: details.title,
          p_description: details.description,
          p_categories: details.categories,
          p_start: details.starts_at,
          p_ends: details.ends_at,
          p_zone: details.time_zone,
          p_place: details.place_label,
          p_place_tbd: details.place_tbd,
          p_repeat_weeks: details.repeat_weeks,
          p_note: details.note,
          p_area: sentArea(details.area),
          p_cancel: false,
          p_stop_repeating: false,
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
  async cancel({ id, version, stopRepeating }) {
    const { data, error } = await withDeadline((signal) =>
      supabase
        .rpc("change_plan_v4", {
          p_plan: id,
          p_version: version,
          p_title: null,
          p_description: null,
          p_categories: null,
          p_start: null,
          p_ends: null,
          p_zone: null,
          p_place: null,
          p_place_tbd: null,
          p_repeat_weeks: null,
          p_note: null,
          p_area: null,
          p_cancel: true,
          p_stop_repeating: Boolean(stopRepeating),
        })
        .abortSignal(signal),
    );
    if (error) throw error;
    return data as number;
  },
};

/**
 * UX3 Note to guests: posts, changes or (with "") removes the organizer's note. It never changes the event's
 * version. Preview never calls it; the caller keeps the note on the device.
 */
export const setGuestNote = createGuestNoteWriter((planId, text) =>
  withDeadline((signal) =>
    supabase.rpc("set_guest_note", { p_plan: planId, p_note: text }).abortSignal(signal),
  ),
);
