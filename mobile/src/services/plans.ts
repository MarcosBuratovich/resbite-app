import { supabase } from "./supabase";
import type { LocalPlan } from "../state/AppState";
import type { PlanGateway } from "../domain/plans";

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

export const planGateway: PlanGateway = {
  async read(id) {
    const { data, error } = await withDeadline((signal) =>
      supabase
        .from("plans")
        .select(
          "id,activity_id,starts_at,time_zone,place_label,note,status,version,owner_id",
        )
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle(),
    );
    if (error) throw error;
    return data as LocalPlan | null;
  },
  async create({ id, activityId, details }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("create_plan", {
          p_id: id,
          p_activity: activityId,
          p_start: details.starts_at,
          p_zone: details.time_zone,
          p_place: details.place_label,
          p_note: details.note,
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
  async update({ id, version, details }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("change_plan", {
          p_plan: id,
          p_version: version,
          p_start: details.starts_at,
          p_zone: details.time_zone,
          p_place: details.place_label,
          p_note: details.note,
          p_cancel: false,
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
};
