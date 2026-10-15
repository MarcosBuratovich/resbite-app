import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
await mkdir("/private/tmp/resbite-registration", { recursive: true });
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let payload = null;
    await page.route("**/*.supabase.co/**", (route) => {
      assert.equal(new URL(route.request().url()).pathname, "/auth/v1/signup");
      payload = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
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
      path: `/private/tmp/resbite-registration/intro-${width}.png`,
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
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByText("Use a name between 1 and 80 characters.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("Alex Fixture");
    await page.getByLabel("Date of birth (optional)", { exact: true }).fill("2000-02-29");
    await page.screenshot({
      path: `/private/tmp/resbite-registration/about-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Phone number (optional)", { exact: true }).fill("07700900123");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByText(
        "Include your country code, for example +44 7700 900123.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByLabel("Phone number (optional)", { exact: true }).fill("+44 7700 900123");
    await page.getByLabel("City (optional)", { exact: true }).fill("London");
    await page.getByText("Outdoors", { exact: true }).click();
    await page.screenshot({
      path: `/private/tmp/resbite-registration/interests-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByRole("button", { name: "Previous step", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "About you", exact: true }),
    ).toBeFocused();
    await expect(page.getByLabel("City (optional)", { exact: true })).toHaveValue("London");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Email address", { exact: true }).fill("fixture@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("test-password-only");
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Password", { exact: true }).evaluate((el) => el.type),
      "text",
    );
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox", exact: true }),
    ).toBeFocused();
    assert.equal(payload.data.display_name, "Alex Fixture");
    assert.deepEqual(payload.data.registration_details, {
      birth_date: "2000-02-29",
      phone: "+447700900123",
      city: "London",
      interests: ["Outdoors"],
    });
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `/private/tmp/resbite-registration/confirm-${width}.png`,
      fullPage: true,
    });
    await page.close();
  }
  console.log(
    "Registration passed at 320/390: introduction navigation, validation, retained fields, interests, password visibility, confirmation and intercepted metadata payload.",
  );
} finally {
  await browser.close();
}
