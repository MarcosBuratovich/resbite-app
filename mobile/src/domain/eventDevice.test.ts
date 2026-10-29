import test from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_OPEN_FAILED } from "./eventDevice.ts";

test("the calendar failure keeps its wording", () => {
  assert.equal(CALENDAR_OPEN_FAILED, "We couldn’t open your calendar. Add to calendar needs iOS 17 or later.");
});
