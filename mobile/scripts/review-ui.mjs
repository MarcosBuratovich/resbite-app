// Captures every UX1 screen at 390 and 320 px in preview with no console or page errors,
// and keeps the gluestack keyboard-selection check. Every Supabase request is aborted.
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { button, heading, next } from "./qa-helpers.mjs";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const out = process.env.RESBITE_QA_SHOTS || "/private/tmp/resbite-ui-audit";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome" });
try {
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // Sheets are modal overlays: capture the viewport (a full-page capture resizes it and loses them).
    // Sheets fade in and out even under Reduce Motion, so let the fade finish before capturing.
    const shot = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      return page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage });
    };
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(base);
    await page.getByText("Preview the design", { exact: true }).click();
    await expect(heading(page, "Create")).toBeVisible();
    await shot("create");
    // Idea detail, and an idea opening at Review.
    await page.getByRole("button", { name: "Coffee together", exact: true }).click();
    await expect(heading(page, "Coffee together")).toBeVisible();
    await shot("idea");
    await button(page, "Use idea").click();
    await expect(heading(page, "Looks good?")).toBeVisible();
    await shot("review-idea");
    await button(page, "Close").click();
    await button(page, "Back").click();
    // My resbites, empty.
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await expect(page.getByText("Nothing planned", { exact: true })).toBeVisible();
    await shot("plans-empty");
    // The four steps, Review, the Invite screen and invitations.
    await button(page, "New resbite").click();
    await shot("step-what");
    await page.getByLabel("Name", { exact: true }).fill("Picnic in the park");
    await next(page);
    await shot("step-when");
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await shot("step-where");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await shot("step-vibe");
    await next(page);
    await shot("step-review");
    await button(page, "Create preview").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    await shot("invite-screen");
    await button(page, "Invite people").click();
    await expect(heading(page, "Invitations")).toBeVisible();
    await shot("invitations");
    await button(page, "About invitation links").click();
    await expect(heading(page, "Invitation links")).toBeVisible();
    await shot("invitations-about", false);
    await button(page, "Close sheet").click();
    await button(page, "Back").click();
    // My resbites with a card, the event page, its More sheet and Choose people.
    const card = button(page, /^Picnic in the park, /);
    await expect(card).toBeVisible();
    await shot("plans");
    await card.click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await shot("event");
    await button(page, "More actions").click();
    await shot("event-more", false);
    await button(page, "Close sheet").click();
    await button(page, "Choose people").click();
    await shot("people-plan");
    await button(page, "Back").click();
    await button(page, "Back").click();
    await page.getByRole("radio", { name: "Past", exact: true }).click();
    await shot("plans-past");
    // Profile, settings and People & groups, with gluestack keyboard selection.
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await shot("profile");
    await page.getByRole("button", { name: "Your data & privacy", exact: true }).scrollIntoViewIfNeeded();
    await shot("settings");
    await page.getByRole("button", { name: "People & groups", exact: true }).click();
    await page.getByRole("button", { name: "Create a group", exact: true }).click();
    await shot("people");
    await page.getByLabel("Person’s name", { exact: true }).fill("Alex");
    await page.getByLabel("Email or phone", { exact: true }).fill("alex@example.invalid");
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    const checkbox = page.getByRole("checkbox", { name: "Alex, alex@example.invalid", exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("heading", { name: "Selected · 0", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Uncaught Error");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  console.log(
    "PASS: every UX1 screen at 390/320 px, gluestack keyboard selection, no console/page errors. Screenshots: " + out,
  );
} finally {
  await browser.close();
}
