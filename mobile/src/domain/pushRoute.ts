// Where a tapped push notification goes. `result` is the plan id after an authorized refetch (or after a read
// that failed: the event page has its own retry and offline states), or null when the event can't be read any
// more (removed, declined, cancelled, gone). Never a blank event page.
export type PushDestination =
  | { pathname: "/event"; params: { plan: string } }
  | { pathname: "/plans"; params: { notice: "gone"; n: string } };

/** A fresh id for each tap, so My resbites shows its note once per tap (as a saved note is shown once). */
const nonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function pushDestination(result: string | null): PushDestination {
  return result
    ? { pathname: "/event", params: { plan: result } }
    : { pathname: "/plans", params: { notice: "gone", n: nonce() } };
}
