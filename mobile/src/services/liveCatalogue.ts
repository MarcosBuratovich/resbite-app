import { decodePublishedActivities } from "../domain/catalogue";
import type { Activity } from "../domain/rules";

export type CatalogueAdapter = {
  sessionAccountId(): Promise<string | null>;
  read(signal: AbortSignal, activityId?: string): Promise<unknown>;
};
const adapter: CatalogueAdapter = {
  async sessionAccountId() {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user.id ?? null;
  },
  async read(signal, activityId) {
    const { supabase } = await import("./supabase");
    let query = supabase
      .from("activities")
      .select(
        "id,title,category,description,artwork_key,source_ids,published,duration_minutes,tips",
      )
      .eq("published", true);
    if (activityId !== undefined) query = query.eq("id", activityId);
    const { data, error } = await query
      .order("title")
      .order("id")
      .abortSignal(signal);
    if (error) throw error;
    return data;
  },
};

/** Reads are bound to the screen's account and lifetime, even if an adapter ignores abort. */
export async function readPublishedCatalogue(
  options: {
    accountId: string;
    activityId?: string;
    assertCurrent: () => void;
    signal: AbortSignal;
    timeoutMs?: number;
  },
  source: CatalogueAdapter = adapter,
): Promise<Activity[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const current = () => {
    options.assertCurrent();
    if (
      !options.accountId ||
      options.signal.aborted ||
      controller.signal.aborted
    )
      throw Error("Activity check interrupted. Please try again.");
  };
  const request = async () => {
    current();
    if ((await source.sessionAccountId()) !== options.accountId)
      throw Error("Account changed.");
    current();
    const rows = await source.read(controller.signal, options.activityId);
    current();
    if ((await source.sessionAccountId()) !== options.accountId)
      throw Error("Account changed.");
    current();
    const items = decodePublishedActivities(rows);
    if (
      options.activityId !== undefined &&
      items.some((item) => item.id !== options.activityId)
    )
      throw Error("Activity unavailable.");
    return items;
  };
  try {
    return await Promise.race([
      request(),
      new Promise<never>((_, reject) => {
        abort = () => {
          controller.abort();
          reject(Error("Activity check interrupted. Please try again."));
        };
        options.signal.addEventListener("abort", abort, { once: true });
        if (options.signal.aborted) abort();
        timer = setTimeout(abort, options.timeoutMs ?? 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
  }
}
