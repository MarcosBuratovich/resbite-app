import test from "node:test";
import assert from "node:assert/strict";
import { draftAutosaveAction } from "./draftAutosave.ts";

test("an untouched editor with no draft in this session writes nothing", () => {
  assert.equal(draftAutosaveAction({ dirty: false, pending: null, persisted: false }), "skip");
});

test("an edited editor writes the draft, persisted or not", () => {
  assert.equal(draftAutosaveAction({ dirty: true, pending: null, persisted: false }), "write");
  assert.equal(draftAutosaveAction({ dirty: true, pending: null, persisted: true }), "write");
});

test("an editor returned to untouched removes the draft it wrote or restored", () => {
  assert.equal(draftAutosaveAction({ dirty: false, pending: null, persisted: true }), "remove");
});

test("a pending save is always written and never removed", () => {
  const pending = { id: "plan-1" };
  for (const dirty of [true, false])
    for (const persisted of [true, false])
      assert.equal(draftAutosaveAction({ dirty, pending, persisted }), "write");
});
