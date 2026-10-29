// Shared browser QA steps for the plan screen (create and edit) and My resbites.
import { expect } from "@playwright/test";

/** Ignores matches on screens hidden underneath in the stack. */
export const visible = (locator) => locator.filter({ visible: true });
export const heading = (page, name) => visible(page.getByRole("heading", { name, exact: true }));
export const button = (page, name) =>
  visible(page.getByRole("button", { name, exact: typeof name === "string" }));

export async function close(page) {
  await button(page, "Close").click();
}
/**
 * Fills a field that has just appeared (a sheet opening, a screen loading). A fill in its first moments can land on
 * an input that is then redrawn from the form's state, so the text is lost; this fills again until the value holds.
 */
export async function fillSettled(field, value) {
  await expect(async () => {
    await field.fill(value);
    await field.page().waitForTimeout(150);
    await expect(field).toHaveValue(value, { timeout: 100 });
  }).toPass({ timeout: 5000 });
}
/**
 * UX3: the event page asks "Get notified?" the first time an organizer or a Going or Maybe guest opens one
 * while the phone's permission was never answered. Scripts that aren't about reminders answer it up front on
 * the development fake (`__resbiteDevice`): "denied" schedules nothing, reads nothing and never asks.
 * `target` is a page or a browser context.
 */
export async function quietReminders(target) {
  await target.addInitScript(() => {
    globalThis.__resbiteDevice ??= { reminders: [], calendar: [], permission: "denied" };
  });
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
/** Opens the When sheet from the plan screen's When row. */
export async function openWhen(page) {
  await button(page, /^When, /).click();
  await expect(heading(page, "When")).toBeVisible();
}
/** Opens the Where sheet from the plan screen's Where row. */
export async function openWhere(page) {
  await button(page, /^Where, /).click();
  await expect(heading(page, "Where")).toBeVisible();
}
/**
 * Fills the plan screen with what is given: the name, the When sheet (the typed YYYY-MM-DD and HH:mm fields of
 * the web path), the Where sheet and the categories. The start goes in before the end, as the sheet moves the end
 * with the start.
 */
export async function fillPlan(page, { title, date, start, end, place, categories = [] }) {
  if (title !== undefined) await fillSettled(page.getByLabel("Title", { exact: true }), title);
  if (date !== undefined) {
    await openWhen(page);
    await fillSettled(visible(page.getByLabel("Date", { exact: true })), date);
    await fillSettled(visible(page.getByLabel("Start time", { exact: true })), start);
    await fillSettled(visible(page.getByLabel("End time", { exact: true })), end);
    await button(page, "Done").click();
    await expect(heading(page, "When")).toHaveCount(0);
  }
  if (place !== undefined) {
    await openWhere(page);
    await fillSettled(visible(page.getByLabel("Where", { exact: true })), place);
    await button(page, "Done").click();
    await expect(heading(page, "Where")).toHaveCount(0);
  }
  for (const category of categories) await button(page, category).click();
}
/** Fills the plan screen (an idea's name and categories stay) and presses Create; the date defaults to a far one. */
export async function createPlan(page, plan, submit = "Create") {
  await fillPlan(page, { date: "2099-03-01", start: "10:00", end: "11:00", ...plan });
  await button(page, submit).click();
}
/** The It’s on! moment after creating, then "Not now" back to My resbites. */
export async function later(page) {
  await expect(heading(page, "It’s on!")).toBeVisible();
  await button(page, "Not now").click();
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
  await expect(heading(page, "Edit resbite")).toBeVisible();
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
