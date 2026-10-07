import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.addInitScript(() => {
    window.__notificationPrompts = 0;
    if (window.Notification)
      window.Notification.requestPermission = async () => {
        window.__notificationPrompts++;
        throw Error("Unexpected notification prompt");
      };
  });
  await page.goto(process.env.RESBITE_QA_URL || "http://localhost:8081");
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Notification settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Notifications aren’t active yet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Preview does not read or request notification permission, or send notifications.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open device settings", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check permission again", exact: true }),
  ).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.__notificationPrompts), 0);
  await page
    .getByRole("button", { name: "Open My resbites", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Something to look forward to.",
      exact: true,
    }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "Notification availability preview passed at 320px; no permission prompts or backend calls.",
  );
} finally {
  await browser.close();
}
