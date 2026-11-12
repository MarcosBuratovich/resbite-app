// Shared browser QA steps for the plan screen (create and edit) and My resbites.
import { expect } from "@playwright/test";

/**
 * Where supabase-js keeps the session: `sb-<the project's first label>-auth-token`, from the URL the app was started
 * with. Start Expo with a fake https EXPO_PUBLIC_SUPABASE_URL and pass the same one to the script; every request to
 * *.supabase.co is answered by the script's fixture, so nothing is sent.
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(process.env.EXPO_PUBLIC_SUPABASE_URL || "https://ewcsgvhuojxdpaspwsrx.supabase.co").hostname.split(".")[0]}-auth-token`;
/**
 * Task 8's two reads, for scripts that aren't about chat: the resbite page reads the series' chat (chat_summary) for its
 * Chat row, and My resbites reads my_chat_overview for the dots and the invitations' announcements. `NO_CHAT_ROW` is a
 * closed chat with no message, the backfilled chat of a resbite nobody wrote in, so the row hides (K-S13);
 * `NO_CHATS` has nothing unread and no announcement. Both are 200s, so no console error and no change on screen.
 * Returns the answer for those two paths, or undefined for any other.
 */
export function noChat(path) {
  if (path === "/rest/v1/rpc/my_chat_overview") return { chats: {}, announcements: {}, names: {} };
  if (path === "/rest/v1/rpc/chat_summary")
    return {
      series_id: "00000000-0000-4000-8000-000000000000",
      plan_id: "00000000-0000-4000-8000-000000000000",
      title: "",
      starts_at: "2000-01-01T00:00:00Z",
      ends_at: null,
      time_zone: "UTC",
      status: "active",
      repeat_weeks: null,
      is_group: false,
      stopped: false,
      closes_at: "2000-01-03T00:00:00Z",
      open: false,
      host: false,
      accepted: 0,
      members: 0,
      going: 0,
      everyone: 0,
      pinned: null,
      last: null,
      names: {},
      muted_chat: false,
      muted_resbite: false,
      last_read_id: null,
      unread: false,
      message_count: 0,
    };
  return undefined;
}
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

// --- My resbites helpers: cards open the resbite page, where the actions live (Invite, Edit, More) ---
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
  await button(page, "Invite").click();
  await expect(page.getByText(notice, { exact: false })).toBeVisible();
  await button(page, "Back").click();
}
/** `choice` is the sheet's button: "Yes, cancel resbite", or for a repeating one "Cancel just this one" / "Cancel this and stop repeating". */
export async function cancelFromList(page, title, choice = "Yes, cancel resbite") {
  await openEvent(page, title);
  await button(page, "More").click();
  await button(page, "Cancel resbite").click();
  await button(page, choice).click();
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
