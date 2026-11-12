// Where a tapped push notification goes. `result` is the plan id after an authorized refetch (or after a read
// that failed: the event page has its own retry and offline states), or null when the event can't be read any
// more (removed, declined, cancelled, gone). Never a blank event page. A chat tap's `result` is its series (Task 8).
export type PushDestination =
  | { pathname: "/connections" }
  | { pathname: "/event"; params: { plan: string } }
  | { pathname: "/chat"; params: { series: string } }
  | { pathname: "/plans"; params: { notice: "gone"; n: string } };

/** A fresh id for each tap, so My resbites shows its note once per tap (as a saved note is shown once). */
const nonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * - `pushDestination(plan)` / `pushDestination(plan, "plan")`: the event, or the gone note for null.
 * - `pushDestination(_, "connection")`: Connections, whatever the read said.
 * - `pushDestination(series, "chat")`: the chat, `/chat?series=` (its screen checks the series and reads it); null has
 *   no chat to open and gets the gone note.
 */
export function pushDestination(result: string | null, kind: "plan" | "connection" | "chat" = "plan"): PushDestination {
  if (kind === "connection") return { pathname: "/connections" };
  if (kind === "chat" && result) return { pathname: "/chat", params: { series: result } };
  return result && kind === "plan"
    ? { pathname: "/event", params: { plan: result } }
    : { pathname: "/plans", params: { notice: "gone", n: nonce() } };
}
