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
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  // UX3: updates from organizers stay "Not active yet"; reminders are set on this phone, with a real switch.
  await expect(page.getByText("Updates from organizers", { exact: true })).toBeVisible();
  await expect(page.getByText("Not active yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Design preview", { exact: true })).toBeVisible();
  const reminders = page.getByRole("switch", { name: "Event reminders", exact: true });
  await expect(reminders).toBeChecked();
  await expect(
    page.getByText("1 day and 1 hour before resbites you’re going to, or might. Set on this phone.", { exact: true }),
  ).toBeVisible();
  const box = await reminders.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 320, "The switch fits at 320px");
  await reminders.click();
  await expect(reminders).not.toBeChecked();
  // It's kept on this phone: leaving and coming back keeps it off.
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Event reminders", exact: true })).not.toBeChecked();
  await page.getByRole("switch", { name: "Event reminders", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Event reminders", exact: true })).toBeChecked();
  await page
    .getByRole("button", { name: "About notifications", exact: true })
    .click();
  await expect(
    page.getByText(
      "This build does not send plan or RSVP notifications. Open My resbites to check the latest details and responses.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Reminders are set on this phone when you answer Going or Maybe, or organize a resbite. If an organizer changes the time and you don’t open Resbite before the old reminder, it may still arrive at the old time.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close sheet", exact: true })).toHaveCount(0);
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
    page.getByRole("button", { name: "Check again", exact: true }),
  ).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.__notificationPrompts), 0);
  await page
    .getByRole("button", { name: "Open My resbites", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "My resbites",
      exact: true,
    }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Notifications preview at 320px: the Event reminders switch (kept on this phone), Updates from organizers not active yet, the About sheet; no permission prompts or backend calls.",
  );
} finally {
  await browser.close();
}
