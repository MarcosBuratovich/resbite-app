import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`./${name}.html`, import.meta.url), "utf8");
const count = (text, part) => text.split(part).length - 1;
const placeholders = {
  confirmation: ["ConfirmationURL", "Token"],
  recovery: ["ConfirmationURL"],
  "email-code": ["Token"],
};

for (const name of ["confirmation", "email-code", "recovery"]) {
  test(`${name} carries the company footer and the Privacy Policy link`, () => {
    const html = read(name);
    for (const part of [
      "Resbite Ltd",
      "company number 12450334",
      "86-90 Paul Street, London EC2A 4NE",
      "support@resbite.com",
      'href="https://link.resbite.com/privacy"',
    ]) {
      assert.equal(count(html, part), 1, `${name} should contain "${part}" exactly once`);
    }
    assert.ok(!/\bVAT\b/.test(html), `${name} has no VAT line while the placeholder is open`);
  });

  test(`${name} says nothing about a private test or testers`, () => {
    assert.ok(!/private test|tester/i.test(read(name)));
  });

  test(`${name} keeps its placeholders`, () => {
    const found = new Set([...read(name).matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map((m) => m[1]));
    assert.deepEqual([...found].sort(), [...placeholders[name]].sort());
  });
}
