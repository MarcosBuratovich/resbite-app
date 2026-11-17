import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

// App Store readiness B4 (CON-1, CON-2): no sample, beta, build or tester wording ships in the app.
// The scan reads the strings and JSX text of every non-test source file. Comments are never scanned.
const root = join(__dirname, "..", "..");

// Plan 2 (B3) rewrites these; remove each when it does. Plan 2's Task 8 has rewritten all three, so every file is scanned.
const B3_REWRITES: string[] = [];

const BANNED: RegExp[] = [
  /\bbeta\b/i,
  /development build/i,
  /\bthis build\b/i,
  /private test/i,
  /in private testing/i,
  /switched on yet/i,
  /aren’t active yet/i,
  /sample data/i,
  /example numbers/i,
  /Preview & samples/,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

function userText(file: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      found.push(node.text);
    else if (ts.isJsxText(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("no sample, beta, build or tester wording in the app's user-facing text", () => {
  const problems: string[] = [];
  for (const dir of ["app", "src"]) {
    for (const file of sourceFiles(join(root, dir))) {
      const name = relative(root, file).split("\\").join("/");
      if (B3_REWRITES.includes(name)) continue;
      for (const text of userText(file)) {
        for (const pattern of BANNED) if (pattern.test(text)) problems.push(`${name}: ${text.trim().slice(0, 80)}`);
        if (text === "Tester") problems.push(`${name}: "Tester"`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("the Wellness tab is removed, not hidden", () => {
  assert.equal(existsSync(join(root, "app/(tabs)/wellness.tsx")), false);
  for (const layout of ["app/(tabs)/_layout.tsx", "app/(tabs)/_layout.web.tsx"])
    assert.ok(!/wellness/i.test(readFileSync(join(root, layout), "utf8")), `${layout} names wellness`);
});
