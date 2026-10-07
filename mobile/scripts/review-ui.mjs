import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const out = process.env.RESBITE_QA_SHOTS || "/private/tmp/resbite-ui-audit";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto("http://localhost:8081");
    await page.getByText("Preview the design", { exact: true }).click();
    await page.screenshot({ path: `${out}/discover-${width}.png` });
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.screenshot({ path: `${out}/profile-${width}.png` });
    await page
      .getByRole("button", { name: "Your data & privacy", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/settings-${width}.png` });
    await page
      .getByRole("button", { name: "People & groups", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create a group", exact: true })
      .click();
    await page.screenshot({ path: `${out}/people-${width}.png` });
    await page.getByLabel("Person’s name", { exact: true }).fill("Alex");
    await page
      .getByLabel("Email or phone", { exact: true })
      .fill("alex@example.invalid");
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    const checkbox = page.getByRole("checkbox", {
      name: "Alex, alex@example.invalid",
      exact: true,
    });
    await expect(checkbox).toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("heading", { name: "Selected · 0", exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Uncaught Error");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  console.log(
    "PASS: 320/390 layouts, gluestack keyboard selection, no console/page errors. Screenshots: " +
      out,
  );
} finally {
  await browser.close();
}
