/** The end in ms, or the start when there is none: the one boundary between "open" and "ended". */
export function planEnd(plan: { starts_at: string; ends_at?: string | null }): number {
  return Date.parse(plan.ends_at ?? plan.starts_at);
}
