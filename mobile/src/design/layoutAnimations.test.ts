import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Reanimated layout animations (the entering, exiting and layout props) are not used anywhere in
// the app. On the new architecture the native view keeps the frame it had when the layout
// animation ran, so content that grows afterwards falls outside it and can't be tapped on iPhone,
// though the JS layout is right (the When pickers, confirmed on the owner's iPhone on 9 October
// 2026). Animate with shared values instead, as StepBody and Reveal do.
const root = fileURLToPath(new URL("../..", import.meta.url));
const layoutAnimationProp = /\b(entering|exiting|layout)=\{/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("no Reanimated layout-animation prop appears in app/ or src/", () => {
  const files = [...sources(join(root, "app")), ...sources(join(root, "src"))];
  assert.ok(files.length > 50, "the scan found the app's source files");
  const found = files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, i) => (layoutAnimationProp.test(line) ? [`${relative(root, file)}:${i + 1}: ${line.trim()}`] : [])),
  );
  assert.deepEqual(
    found,
    [],
    "Reanimated layout animations (entering, exiting, layout) freeze the native frame on the new " +
      "architecture, so content that grows later can't be tapped on iPhone. Use a shared-value " +
      "animation (useSharedValue, withTiming, useAnimatedStyle) as StepBody and Reveal do.",
  );
});
