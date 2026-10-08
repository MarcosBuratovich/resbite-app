import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, choosePeople, createFromIdea, later } from "./qa-helpers.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(process.env.RESBITE_QA_URL || "http://localhost:8081");
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "People & groups", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create a group", exact: true })
    .click();
  await page.getByLabel("Group name", { exact: true }).fill("Weekend friends");
  await page
    .getByRole("button", { name: "Choose phone contacts", exact: true })
    .click();
  await expect(
    page.getByText(
      "Phone contacts are available in the iPhone app. You can add a person below.",
      { exact: true },
    ),
  ).toBeVisible();
  const add = async (name, email) => {
    await page.getByLabel("Person’s name", { exact: true }).fill(name);
    await page.getByLabel("Email or phone", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  };
  await add("Alex", "alex@example.invalid");
  await add("Bea", "bea@example.invalid");
  await add("Alex", "ALEX@example.invalid");
  await expect(
    page.getByRole("heading", { name: "Selected · 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  await expect(
    page.getByText("Group saved on this device.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Weekend friends", exact: true })
    .click();
  await page.getByLabel("Group name", { exact: true }).fill("Coffee friends");
  await page
    .getByRole("checkbox", { name: "Bea, bea@example.invalid", exact: true })
    .locator("xpath=ancestor::label")
    .click();
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  await button(page, "Back").click();
  await page.getByRole("tab", { name: "Create", exact: true }).click();
  await page
    .getByRole("button", { name: "Coffee together", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use idea", exact: true })
    .click();
  await createFromIdea(page, "Test café");
  await later(page);
  await choosePeople(page, "Coffee together");
  await page
    .getByRole("button", { name: "Add Coffee friends", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Coffee friends", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Selected · 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save people", exact: true }).click();
  await expect(
    page.getByText(
      "People saved for this plan. No invitations have been sent.",
      { exact: true },
    ),
  ).toBeVisible();
  await button(page, "Back").click();
  await button(page, "Back").click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "People & groups", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete Coffee friends", exact: true })
    .click();
  await expect(
    page.getByText("No groups yet. Start with the people you see most.", {
      exact: true,
    }),
  ).toBeVisible();
  await button(page, "Back").click();
  await page.getByRole("tab", { name: "My resbites", exact: true }).click();
  await choosePeople(page, "Coffee together");
  await expect(
    page.getByRole("checkbox", {
      name: "Alex, alex@example.invalid",
      exact: true,
    }),
  ).toBeChecked();
  await button(page, "Back").click();
  await button(page, "Back").click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview")),
    JSON.stringify(["Test café"]),
  );
  await page
    .getByRole("button", { name: "Leave preview", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("resbite.people.v1.preview"),
    ),
    null,
  );
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview")),
    null,
    "Leaving preview clears recent places",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: manual contact fallback, group create/edit/delete, deduplication, independent plan selections and exit cleanup. No network writes.",
  );
} finally {
  await browser.close();
}
