import test from "node:test";
import assert from "node:assert/strict";
import { pushDestination } from "./pushRoute.ts";
import { INVITE_COPY } from "./inviteCopy.ts";

test("a readable plan opens its event", () => {
  assert.deepEqual(pushDestination("p1"), { pathname: "/event", params: { plan: "p1" } });
});
test("an unreadable plan lands on My resbites with the gone note", () => {
  assert.deepEqual(pushDestination(null), { pathname: "/plans", params: { notice: "gone" } });
  assert.equal(INVITE_COPY.goneNotice, "That resbite isn’t available any more.");
});
