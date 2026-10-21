// Captures every UX1, UX3 and UX4 screen at 390 and 320 px (UX3 and UX4 also with Larger Text at 320 px) with no console or page errors,
// and keeps the gluestack keyboard-selection check. Every Supabase request is aborted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { button, heading, later, next, openEvent, quietReminders } from "./qa-helpers.mjs";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const out = process.env.RESBITE_QA_SHOTS || "/private/tmp/resbite-ui-audit";
await mkdir(out, { recursive: true });
async function addPerson(page, name, address) {
  await page.getByLabel("Person’s name", { exact: true }).fill(name);
  await page.getByLabel("Email or phone", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: `${name}, ${address}`, exact: true })).toBeChecked();
}
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome" });
try {
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    // The event page would otherwise open "Get reminders?" over the capture.
    await quietReminders(page);
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
    // UX3: an end time on When, Meeting details on Where.
    await button(page, "Add an end time").click();
    await expect(page.getByLabel("End date and time (local)", { exact: true })).toBeVisible();
    await shot("step-when-end");
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await page.getByLabel("Meeting details (optional)", { exact: true }).fill("By the big oak near the north gate. Gate code 4512.");
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
    // GI1: the event's one link; preview shows the card and says it can't share.
    await expect(heading(page, "Invite people")).toBeVisible();
    await shot("invitations");
    await button(page, "About invitation links").click();
    await expect(heading(page, "Invitation links")).toBeVisible();
    await shot("invitations-about", false);
    await button(page, "Close sheet").click();
    // Back returns to My resbites.
    for (let i = 0; i < 3 && !(await button(page, /^Picnic in the park, /).isVisible()); i++) {
      await button(page, "Back").click();
      await page.waitForTimeout(300);
    }
    // My resbites with a card, the event page, its More sheet and Choose people.
    const card = button(page, /^Picnic in the park, /);
    await expect(card).toBeVisible();
    await shot("plans");
    await card.click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await shot("event");
    // UX3: the organizer posts a Note to guests; the page shows it with the Meeting details and the device chips.
    await button(page, "Post a note to guests").click();
    await page.getByLabel("Note to guests", { exact: true }).fill("Bring a blanket, we have the drinks covered.");
    await shot("event-note-sheet", false);
    await button(page, "Post").click();
    await expect(page.getByRole("button", { name: "Close sheet" })).toHaveCount(0);
    await expect(page.getByText("Bring a blanket, we have the drinks covered.", { exact: true })).toBeVisible();
    await shot("event-organizer-notes");
    await button(page, "More actions").click();
    await shot("event-more", false);
    await button(page, "Close sheet").click();
    await button(page, "Choose people").click();
    await shot("people-plan");
    await button(page, "Back").click();
    await button(page, "Back").click();
    await page.getByRole("radio", { name: "Past", exact: true }).click();
    await shot("plans-past");
    // UX4 Profile and settings in preview, then People & groups with gluestack keyboard selection.
    await page.getByRole("tab", { name: "Wellness", exact: true }).click();
    await expect(heading(page, "Wellness")).toBeVisible();
    await shot("wellness");
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await expect(heading(page, "Profile")).toBeVisible();
    await shot("profile");
    await button(page, "Notifications").click();
    await expect(heading(page, "Notifications")).toBeVisible();
    await shot("notifications");
    await button(page, "Profile").click();
    await button(page, "Data & privacy").click();
    await expect(heading(page, "Privacy")).toBeVisible();
    await shot("privacy");
    await button(page, "On this device").click();
    await shot("privacy-topic", false);
    await button(page, "Close sheet").click();
    await button(page, "Delete account").click();
    await expect(heading(page, "Delete account")).toBeVisible();
    await shot("delete-account");
    await button(page, "What happens").click();
    await shot("delete-what-happens", false);
    await button(page, "Close sheet").click();
    await button(page, "Privacy").click();
    await button(page, "Profile").click();
    await expect(heading(page, "Profile")).toBeVisible();
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
    // A saved group, then the plan selection with a group row and selected rows, and its sheet.
    await addPerson(page, "Alex", "alex@example.invalid");
    await page.getByLabel("Group name", { exact: true }).fill("Friends");
    await button(page, "Save group").click();
    await expect(button(page, "Edit Friends")).toBeVisible();
    await shot("people-groups");
    await button(page, "Back").click();
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await page.getByRole("radio", { name: "Upcoming", exact: true }).click();
    await button(page, /^Picnic in the park, /).click();
    await button(page, "Choose people").click();
    await button(page, "Add Friends").click();
    await shot("people-plan-selected");
    await button(page, "About people").click();
    await expect(heading(page, "About people")).toBeVisible();
    await shot("people-about", false);
    await button(page, "Close sheet").click();
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // UX4 public screens at 390 and 320 px and with Larger Text at 320 px: landing, introduction,
  // sign-in, the sign-up steps, reset, confirm and the email-link page. Supabase requests are
  // aborted, so the browser's "Failed to load resource" lines are expected on these screens.
  for (const [width, large] of [[390, false], [320, false], [320, true]]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
    const suffix = large ? "large-320" : String(width);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const clipped = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[role=button],[role=link],[role=heading],h1,h2,h3,input,textarea")]
          .filter((el) => !el.closest("[role=tablist],[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.left < -1 || b.right > window.innerWidth + 1;
          })
          .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
      );
    const visit = async (name, title) => {
      await expect(heading(page, title)).toBeVisible();
      assert.ok(await fits(), `${name} fits at ${suffix}`);
      assert.deepEqual(await clipped(), [], `${name} has nothing clipped at ${suffix}`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-${suffix}.png`, fullPage: true });
    };
    const open = async (path) => {
      await page.goto(`${base}${path}${large ? `${path.includes("?") ? "&" : "?"}largeText=1` : ""}`);
      if (large) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    };
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await open("/");
    await visit("landing", "Get together");
    await button(page, "Get started").click();
    await visit("intro", "Little plans");
    await button(page, "I have an account").click();
    await visit("sign-in", "Welcome back");
    await button(page, "Create account").click();
    await visit("sign-up-name", "Your name?");
    await page.getByLabel("Your name", { exact: true }).fill("Alex");
    await button(page, "Next").click();
    await visit("sign-up-about", "About you");
    await button(page, "Skip").click();
    await visit("sign-up-account", "Your account");
    await button(page, "I have an account").click();
    await button(page, "Forgot password?").click();
    await visit("reset", "Reset password");
    await button(page, "Back to sign in").click();
    await button(page, "Need to confirm your email?").click();
    await visit("confirm", "Confirm your email");
    await open("/auth/callback?code=one&code=two");
    await visit("email-link", "Let’s try again");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // UX4 preview screens under Larger Text at 320 px: Profile, Notifications, Privacy, Delete account and Wellness.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const clipped = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[role=button],[role=link],[role=heading],h1,h2,h3,input,textarea")]
          .filter((el) => !el.closest("[role=tablist],[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.left < -1 || b.right > window.innerWidth + 1;
          })
          .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
      );
    const visit = async (name, title) => {
      await expect(heading(page, title)).toBeVisible();
      assert.ok(await fits(), `${name} fits at 320 px under Larger Text`);
      assert.deepEqual(await clipped(), [], `${name} has nothing clipped at 320 px under Larger Text`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-large-320.png`, fullPage: true });
    };
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(`${base}/?largeText=1`);
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "Wellness", exact: true }).click();
    await visit("wellness", "Wellness");
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await visit("profile", "Profile");
    await button(page, "Notifications").click();
    await visit("notifications", "Notifications");
    await button(page, "Profile").click();
    await button(page, "Data & privacy").click();
    await visit("privacy", "Privacy");
    await button(page, "Delete account").click();
    await visit("delete-account", "Delete account");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // Larger Text at 320 px (forced layouts plus scaled text, as in verify-kit): rows, top row and sheets.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    // People now opens from the event page, which would otherwise ask "Get reminders?".
    await quietReminders(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const shot = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      return page.screenshot({ path: `${out}/${name}-large-320.png`, fullPage });
    };
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(`${base}/?largeText=1`);
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Picnic in the park");
    await next(page);
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await next(page);
    await button(page, "Create preview").click();
    await button(page, "Invite people").click();
    // GI1: the preview link screen (card and the note that preview can't share) and its ⓘ sheet.
    await expect(heading(page, "Invite people")).toBeVisible();
    assert.ok(await fits(), "Invite people fits at 320 px under Larger Text");
    await shot("invitations");
    await button(page, "About invitation links").click();
    await shot("invitations-about", false);
    await button(page, "Close sheet").click();
    await button(page, "Back").click();
    await openEvent(page, "Picnic in the park");
    await button(page, "Choose people").click();
    await shot("people-empty");
    assert.ok(await fits(), "People top row fits at 320 px under Larger Text");
    await addPerson(page, "Alex Rivera", "alex@example.invalid");
    await addPerson(page, "Bea", "bea@example.invalid");
    await shot("people-selected");
    await button(page, "About people").click();
    await shot("people-about", false);
    await button(page, "Close sheet").click();
    await button(page, "Save people").click();
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // UX3 under Larger Text at 320 px: When with an end, Where with Meeting details, the organizer's event page.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    await quietReminders(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const shot = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      return page.screenshot({ path: `${out}/${name}-large-320.png`, fullPage });
    };
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(`${base}/?largeText=1`);
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Picnic in the park");
    await next(page);
    await button(page, "Add an end time").click();
    assert.ok(await fits(), "When with an end fits at 320 px under Larger Text");
    await shot("step-when-end");
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await page.getByLabel("Meeting details (optional)", { exact: true }).fill("By the big oak near the north gate. Gate code 4512.");
    assert.ok(await fits(), "Where with Meeting details fits at 320 px under Larger Text");
    await shot("step-where");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await next(page);
    await button(page, "Create preview").click();
    await later(page);
    await openEvent(page, "Picnic in the park");
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await button(page, "Post a note to guests").click();
    await page.getByLabel("Note to guests", { exact: true }).fill("Bring a blanket, we have the drinks covered.");
    await button(page, "Post").click();
    await expect(page.getByRole("button", { name: "Close sheet" })).toHaveCount(0);
    assert.ok(await fits(), "The organizer's event page fits at 320 px under Larger Text");
    await shot("event-organizer-notes");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  console.log(
    "PASS: every UX1, UX3 and UX4 screen at 390/320 px, UX3 and UX4 under Larger Text at 320 px, gluestack keyboard selection, no console/page errors. Screenshots: " + out,
  );
} finally {
  await browser.close();
}
