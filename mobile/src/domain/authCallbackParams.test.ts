import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthCallbackParams } from "./authCallbackParams";

test("callback accepts a scalar PKCE code with an optional recovery marker", () => {
  assert.deepEqual(parseAuthCallbackParams("valid-code_123", undefined), {
    code: "valid-code_123",
    recovery: false,
  });
  assert.deepEqual(parseAuthCallbackParams("valid-code_123", "1"), {
    code: "valid-code_123",
    recovery: true,
  });
});
test("callback rejects missing, repeated, oversized and malformed parameters", () => {
  for (const code of [
    undefined,
    "",
    ["code"],
    ["one", "two"],
    " code",
    "code\n",
    "a".repeat(2049),
  ]) {
    assert.equal(parseAuthCallbackParams(code, undefined), null);
  }
  for (const recovery of ["", "0", "true", ["1"], ["1", "1"]]) {
    assert.equal(parseAuthCallbackParams("code", recovery), null);
  }
});
