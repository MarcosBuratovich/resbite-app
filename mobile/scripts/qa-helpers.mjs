// Shared browser QA steps for the UX1 creation flow and My resbites.
// Task 7 swaps the list helpers below from the inline card actions to the event page.
import { expect } from "@playwright/test";

/** Ignores matches on screens hidden underneath in the stack. */
export const visible = (locator) => locator.filter({ visible: true });
export const heading = (page, name) => visible(page.getByRole("heading", { name, exact: true }));
export const button = (page, name) =>
  visible(page.getByRole("button", { name, exact: typeof name === "string" }));

/** The step pill: "Next" going forward, "Done" when returning to Review. */
export async function next(page) {
  await button(page, /^(Next|Done)$/).click();
}
export async function close(page) {
  await button(page, "Close").click();
}
/** Web QA types dates into "Date and time (local)", behind the Pick tile. */
export async function typeDate(page, value) {
  await button(page, /^Pick a day/).click();
  await page.getByLabel("Date and time (local)", { exact: true }).fill(value);
}
/** What → When → Where → Vibe → Review for a new event. */
export async function createSteps(page, { name, when, place, note, categories = [] }) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await next(page);
  if (when) await typeDate(page, when);
  await next(page);
  await page.getByLabel("Meeting place", { exact: true }).fill(place);
  if (note) await page.getByLabel("A note for everyone (optional)", { exact: true }).fill(note);
  await next(page);
  for (const category of categories) await page.getByRole("checkbox", { name: category, exact: true }).click();
  await next(page);
  await expect(heading(page, "Looks good?")).toBeVisible();
}
/** An idea opens at Review. Create jumps to the missing place, then Done returns to Review. */
export async function createFromIdea(page, place, submit = "Create preview") {
  await expect(heading(page, "Looks good?")).toBeVisible();
  await button(page, submit).click();
  await expect(page.getByText("Add a meeting place.", { exact: true })).toBeVisible();
  await page.getByLabel("Meeting place", { exact: true }).fill(place);
  await next(page);
  await button(page, submit).click();
}
/** The Invite screen after creating, then "Later" back to My resbites. */
export async function later(page) {
  await expect(heading(page, "It’s on!")).toBeVisible();
  await button(page, "Later").click();
}

// --- My resbites helpers (inline card actions; Task 7 moves them to the event page) ---
export async function editEvent(page, title) {
  await button(page, "Edit plan").first().click();
  await expect(heading(page, "Looks good?")).toBeVisible();
}
export async function inviteFromList(page, title, notice) {
  await button(page, "Invite someone").first().click();
  await expect(page.getByText(notice, { exact: false })).toBeVisible();
}
export async function cancelFromList(page, title) {
  await button(page, "Cancel plan").first().click();
  await button(page, "Yes, cancel plan").click();
}
export async function expectCancelled(page, title) {
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(button(page, "Edit plan")).toHaveCount(0);
}
export async function choosePeople(page, title) {
  await button(page, "Choose people").first().click();
}
/** Leaves an unchanged editor and returns to My resbites. */
export async function closeToList(page) {
  await close(page);
}
/** The categories a card shows, for example "Natural · Community". */
export async function expectCategories(page, title, text) {
  const card = page
    .getByText(title, { exact: true })
    .locator('xpath=ancestor::div[contains(., "YOU’RE ORGANISING")][1]');
  await expect(card.getByText(text, { exact: true })).toBeVisible();
}
