import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const shots = join(tmpdir(), "resbite-registration");
await mkdir(shots, { recursive: true });
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Nothing here talks to Supabase: a request is recorded and refused.
    const requests = [];
    await page.route("**/*.supabase.co/**", (route) => {
      requests.push(new URL(route.request().url()).pathname);
      return route.abort();
    });
    await page.goto(base);
    await page.getByRole("button", { name: "Get started", exact: true }).click();
    await expect(
      page.getByRole("progressbar", { name: "Step 1 of 3", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Little plans", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${shots}/intro-${width}.png`,
      fullPage: true,
    });
    // Close on the first slide returns to the landing, also when the introduction was opened directly.
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Get together", exact: true }),
    ).toBeVisible();
    await page.goto(`${base}/introduction`);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Get together", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Get started", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("progressbar", { name: "Step 2 of 3", exact: true }),
    ).toBeVisible();
    // VoiceOver focus follows the new slide's title.
    await expect(
      page.getByRole("heading", { name: "Your people", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Previous step", exact: true }).click();
    await expect(
      page.getByRole("progressbar", { name: "Step 1 of 3", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    // The last slide's Create account opens sign-up by phone, with the 18+ tick still to give.
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/auth\/phone$/);
    await expect(
      page.getByRole("heading", { name: "Your number", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("");
    await expect(
      page.getByRole("checkbox", { name: "I’m 18 or over", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Send code", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: `${shots}/phone-${width}.png`,
      fullPage: true,
    });
    // Skip opens it from any slide, and the old registration address now leads there too.
    await page.goto(`${base}/introduction`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Skip introduction", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/phone$/);
    await expect(
      page.getByRole("heading", { name: "Your number", exact: true }),
    ).toBeVisible();
    await page.goto(`${base}/auth?mode=register`);
    await expect(page).toHaveURL(/\/auth\/phone$/);
    await expect(
      page.getByRole("heading", { name: "Your number", exact: true }),
    ).toBeVisible();
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Registration passed at 320/390: introduction navigation and focus, and Create account, Skip and the old register address all opening sign-up by phone with the 18+ tick unticked; no backend requests.",
  );
} finally {
  await browser.close();
}
