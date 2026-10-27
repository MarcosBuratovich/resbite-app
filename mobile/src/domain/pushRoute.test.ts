import test from "node:test";
import assert from "node:assert/strict";
import { pushDestination } from "./pushRoute.ts";
import { INVITE_COPY } from "./inviteCopy.ts";

test("a readable plan opens its event", () => {
  assert.deepEqual(pushDestination("p1"), { pathname: "/event", params: { plan: "p1" } });
});
test("an unreadable plan lands on My resbites with the gone note", () => {
  const gone = pushDestination(null);
  assert.equal(gone.pathname, "/plans");
  assert.equal((gone.params as { notice: string }).notice, "gone");
  assert.match((gone.params as { n: string }).n, /^[0-9a-z]+$/);
  // Each tap carries its own id.
  assert.notEqual((pushDestination(null).params as { n: string }).n, (gone.params as { n: string }).n);
  assert.equal(INVITE_COPY.goneNotice, "That resbite isn’t available any more.");
});
