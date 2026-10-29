import test from "node:test";
import assert from "node:assert/strict";
import { phoneKey } from "./phone-key.ts";

test("the key table", () => {
  const rows: Array<[string | null, string]> = [
    ["+5491112341234", "541112341234"],
    ["+541112341234", "541112341234"],
    ["5491112341234", "541112341234"],
    ["+54 9 11 1234 1234", "541112341234"],
    ["+5493511234567", "543511234567"],
    ["+13055550123", "13055550123"],
    ["+447700900834", "447700900834"],
    ["549123456789", "549123456789"],
    [null, ""],
    ["abc", ""],
  ];
  for (const [input, key] of rows) assert.equal(phoneKey(input), key, String(input));
});
