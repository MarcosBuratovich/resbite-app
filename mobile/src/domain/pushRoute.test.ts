import test from "node:test";
import assert from "node:assert/strict";
import { pushDestination, type PushDestination } from "./pushRoute.ts";
import { INVITE_COPY } from "./inviteCopy.ts";

test("a readable plan opens its event", () => {
  assert.deepEqual(pushDestination("p1"), { pathname: "/event", params: { plan: "p1" } });
});
test("an unreadable plan lands on My resbites with the gone note", () => {
  const gone = pushDestination(null) as Extract<PushDestination, { pathname: "/plans" }>;
  assert.equal(gone.pathname, "/plans");
  assert.equal((gone.params as { notice: string }).notice, "gone");
  assert.match((gone.params as { n: string }).n, /^[0-9a-z]+$/);
  // Each tap carries its own id.
  assert.notEqual(((pushDestination(null) as typeof gone).params as { n: string }).n, (gone.params as { n: string }).n);
  assert.equal(INVITE_COPY.goneNotice, "That resbite isn’t available any more.");
});
test("a connection tap opens Connections whatever the read said", () => {
  assert.deepEqual(pushDestination(null, "connection"), { pathname: "/connections" });
  assert.deepEqual(pushDestination("p", "connection"), { pathname: "/connections" });
  assert.deepEqual(pushDestination("p", "plan"), { pathname: "/event", params: { plan: "p" } });
});
test("a chat tap's form: pushDestination(series, \"chat\") opens /chat?series=", () => {
  const series = "30000000-0000-4000-8000-000000000001";
  assert.deepEqual(pushDestination(series, "chat"), { pathname: "/chat", params: { series } });
  // Without a series there is no chat to open: the gone note, as for an unreadable plan.
  const gone = pushDestination(null, "chat") as Extract<PushDestination, { pathname: "/plans" }>;
  assert.equal(gone.pathname, "/plans");
  assert.equal((gone.params as { notice: string }).notice, "gone");
});
