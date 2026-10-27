// Where a tapped push notification goes. `result` is the plan id after an authorized refetch, or null when
// the event can't be read any more (removed, declined, cancelled, gone). Never a blank event page.
export type PushDestination =
  | { pathname: "/event"; params: { plan: string } }
  | { pathname: "/plans"; params: { notice: "gone" } };

export function pushDestination(result: string | null): PushDestination {
  return result
    ? { pathname: "/event", params: { plan: result } }
    : { pathname: "/plans", params: { notice: "gone" } };
}
