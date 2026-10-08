// Shared browser QA steps for the UX1 creation flow and My resbites.
import { expect } from "@playwright/test";

/** Ignores matches on screens hidden underneath in the stack. */
export const visible = (locator) => locator.filter({ visible: true });
export const heading = (page, name) => visible(page.getByRole("heading", { name, exact: true }));
export const button = (page, name) =>
  visible(page.getByRole("button", { name, exact: typeof name === "string" }));

/** The step pill: "Next" going forward ("Review" on Vibe), "Done" when returning to Review. */
export async function next(page) {
  await button(page, /^(Next|Review|Done)$/).click();
}
export async function close(page) {
  await button(page, "Close").click();
}
/** Web QA types dates into "Date and time (local)", the When step's first card ("Choose a day" first while unset). */
export async function typeDate(page, value) {
  const field = visible(page.getByLabel("Date and time (local)", { exact: true }));
  const choose = button(page, "Choose a day");
  await field.or(choose).first().waitFor();
  if (await choose.count()) await choose.click();
  await field.fill(value);
}
/** True when the locators' first matches appear in this order in the DOM (reading and VoiceOver order). */
export async function inOrder(page, locators) {
  const handles = [];
  for (const locator of locators) handles.push(await locator.first().elementHandle());
  return page.evaluate(
    (els) => els.every((el, i) => i === 0 || Boolean(els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)),
    handles,
  );
}
/** The rendered height of a locator's first match, in CSS px (= pt at the test widths). */
export async function heightOf(locator) {
  const box = await locator.first().boundingBox();
  if (!box) throw Error("The element is not rendered");
  return box.height;
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

// --- My resbites helpers: cards open the event page, where the actions now live (UX1) ---
/** A My resbites card, found by its composed label ("{title}, {date}, …"). */
export function card(page, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return visible(page.getByRole("button", { name: new RegExp(`^${escaped}, `) }));
}
export async function openEvent(page, title) {
  await card(page, title).first().click();
  await expect(heading(page, title)).toBeVisible();
}
export async function editEvent(page, title) {
  await openEvent(page, title);
  await button(page, `Edit ${title}`).click();
  await expect(heading(page, "Looks good?")).toBeVisible();
}
export async function inviteFromList(page, title, notice) {
  await openEvent(page, title);
  await button(page, "Invite someone").click();
  await expect(page.getByText(notice, { exact: false })).toBeVisible();
  await button(page, "Back").click();
}
export async function cancelFromList(page, title) {
  await openEvent(page, title);
  await button(page, "More actions").click();
  await button(page, "Cancel event").click();
  await button(page, "Yes, cancel plan").click();
  await expect(page.getByText(/cancelled\.$/)).toBeVisible();
  await button(page, "Back").click();
}
/** Cancelled events leave Upcoming and stay visible under Past with a Cancelled chip (benchmark row 15). */
export async function expectCancelled(page, title) {
  await expect(card(page, title)).toHaveCount(0);
  await page.getByRole("radio", { name: "Past", exact: true }).click();
  await expect(card(page, title)).toHaveAttribute("aria-label", /, Cancelled, /);
  await page.getByRole("radio", { name: "Upcoming", exact: true }).click();
}
export async function choosePeople(page, title) {
  await openEvent(page, title);
  await button(page, "Choose people").click();
}
/** Leaves an unchanged editor (opened from the event page) and returns to My resbites. */
export async function closeToList(page) {
  await close(page);
  await button(page, "Back").click();
}
/** The categories an event shows, for example "Natural · Community", read on its event page. */
export async function expectCategories(page, title, text) {
  await openEvent(page, title);
  for (const label of text.split(" · ")) await expect(visible(page.getByText(label, { exact: true }))).toBeVisible();
  await button(page, "Back").click();
}
