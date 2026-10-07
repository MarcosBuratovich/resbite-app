// The UX1 component kit in its development-only gallery (/kit): roles, labels, selected
// states and 44 pt targets at 390 and 320 px, and forced Larger Text at 320 px. Every Supabase request is aborted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const out = "/private/tmp/resbite-kit";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
async function open(width, query = "") {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(`${base}/kit${query}`);
  await expect(page.getByRole("heading", { name: "Kit", exact: true })).toBeVisible();
  return page;
}
async function size(locator) {
  const box = await locator.boundingBox();
  assert.ok(box, "The element is rendered");
  return box;
}
const fitsWidth = (page, selector) =>
  page.evaluate(
    (selector) =>
      [...document.querySelectorAll(`${selector} *`)].every((el) => {
        const box = el.getBoundingClientRect();
        return box.width === 0 || (box.left >= -1 && box.right <= window.innerWidth + 1);
      }),
    selector,
  );
try {
  for (const width of [390, 320]) {
    const page = await open(width);
    // Chip: a pressable chip is a button whose label can say more than its text.
    const maps = page.getByRole("button", { name: "Open Riverside park in Maps", exact: true });
    await expect(maps).toHaveText("Open in Maps");
    await expect(page.getByRole("button", { name: "Hosting", exact: true })).toHaveCount(0);
    // Tile: checkbox tiles carry checked and disabled states; button tiles carry selected.
    const natural = page.getByRole("checkbox", { name: "Natural", exact: true });
    await expect(natural).not.toBeChecked();
    await natural.click();
    await expect(natural).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Creative", exact: true })).toBeDisabled();
    const tomorrow = page.getByRole("button", { name: "Tomorrow, Thursday 8 October", exact: true });
    await expect(tomorrow).toHaveAttribute("aria-selected", "false");
    await tomorrow.click();
    await expect(tomorrow).toHaveAttribute("aria-selected", "true");
    // IconButton and Fab: labelled, with at least 44 pt targets.
    const edit = await size(page.getByRole("button", { name: "Edit Picnic in the park", exact: true }));
    assert.ok(edit.width >= 44 && edit.height >= 44, "IconButton is at least 44 pt");
    const fab = await size(page.getByRole("button", { name: "New resbite", exact: true }));
    assert.ok(fab.width >= 56 && fab.height >= 56, "Fab is at least 56 pt");
    // CoverCard: one button with a composed label; nothing inside is separately focusable.
    const card = page.getByRole("button", {
      name: "Picnic in the park, Saturday 10 October 2099 at 10:00, Riverside park, Hosting, 3 going",
      exact: true,
    });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(card.getByText("SAT", { exact: true })).toBeVisible();
    // CoverCard on Review: each part is its own button.
    for (const name of [
      "Edit photo",
      "Edit name, Picnic in the park",
      "Edit date and time, Saturday 10 October 2099 at 10:00",
      "Edit place, Riverside park",
      "Edit vibe, Natural and Community",
    ])
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    // AvatarStack: up to three initials, then a count.
    await expect(page.getByRole("button", { name: "4 going", exact: true })).toContainText("+1");
    // Segmented: a radio group with one checked option.
    await expect(page.getByRole("radiogroup", { name: "Show", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Upcoming", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Past", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Past", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Upcoming", exact: true })).not.toBeChecked();
    // InfoSheet: a modal sheet with a heading and a close button.
    await page.getByRole("button", { name: "About cover photos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cover photos", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close sheet", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cover photos", exact: true })).toHaveCount(0);
    assert.equal(await fitsWidth(page, '[data-testid="kit"]'), true, `Kit fits ${width} px`);
    await page.screenshot({ path: `${out}/kit-${width}.png`, fullPage: true });
    // StepScreen: progress, a big question title, Previous step and Close, and the pinned pill.
    await page.getByRole("button", { name: "Show step screen", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Step 2 of 4", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "When?", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous step", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="step-scroll"]').contains(document.querySelector('[data-testid="step-primary"]')),
      ),
      false,
      "The pill is pinned outside the scroll view at normal text sizes",
    );
    await page.screenshot({ path: `${out}/step-${width}.png` });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Kit", exact: true })).toBeVisible();
    await page.close();
  }
  // Larger Text at 320 px: forced layouts plus scaled text (a browser proxy for Dynamic Type).
  {
    const page = await open(320, "?largeText=1");
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    const fab = await size(page.getByRole("button", { name: "New resbite", exact: true }));
    assert.ok(fab.width > 200, "The Fab becomes an inline pill under Larger Text");
    assert.equal(await fitsWidth(page, '[data-testid="kit"]'), true, "Nothing scrolls sideways at 320 px");
    await page.screenshot({ path: `${out}/kit-large-320.png`, fullPage: true });
    await page.getByRole("button", { name: "Show step screen", exact: true }).click();
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="step-scroll"]').contains(document.querySelector('[data-testid="step-primary"]')),
      ),
      true,
      "The pill moves inline under Larger Text",
    );
    assert.equal(await fitsWidth(page, '[data-testid="step-screen"]'), true, "The step screen fits 320 px");
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: kit roles, labels, selected states and 44 pt targets at 390/320; Larger Text at 320. Screenshots: " +
      out,
  );
} finally {
  await browser.close();
}
