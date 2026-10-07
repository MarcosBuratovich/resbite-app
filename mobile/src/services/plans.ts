import { supabase } from "./supabase";
import type { Plan } from "../domain/plans";
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

const planColumns =
  "id,activity_id,title,description,categories,starts_at,time_zone,place_label,note,status,version,owner_id,cover_path,cover_revision";

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
    return data as Plan | null;
  },
  async create({ id, activityId, details }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("create_plan_v2", {
          p_id: id,
          p_title: details.title,
          p_description: details.description,
          p_categories: details.categories,
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
        .rpc("change_plan_v2", {
          p_plan: id,
          p_version: version,
          p_title: details.title,
          p_description: details.description,
          p_categories: details.categories,
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
  async cancel({ id, version }) {
    const { error } = await withDeadline((signal) =>
      supabase
        .rpc("change_plan_v2", {
          p_plan: id,
          p_version: version,
          p_title: null,
          p_description: null,
          p_categories: null,
          p_start: null,
          p_zone: null,
          p_place: null,
          p_note: null,
          p_cancel: true,
        })
        .abortSignal(signal),
    );
    if (error) throw error;
  },
};
