// UX1 creation steps in preview: Next with a missing answer, alerts and focus, quick day and
// time tiles, jumping from Review, the Invite screen, leaving mid-flow, a restored
// unconfirmed save, recent places, and Larger Text at 320 px. Every Supabase request is aborted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { button, card, close, createFromIdea, createSteps, heading, later, next, typeDate } from "./qa-helpers.mjs";
const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const shots = "/private/tmp/resbite-steps";
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
async function preview({ width = 390, query = "", time } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    timezoneId: "Europe/London",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  if (time) await page.clock.setFixedTime(time);
  // Records which CSS animations start, to check how steps enter under Reduce Motion.
  await page.addInitScript(() => {
    window.__animations = [];
    document.addEventListener("animationstart", (e) => window.__animations.push(e.animationName), true);
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(`${baseURL}/${query}`);
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "My resbites", exact: true }).click();
  return page;
}
try {
  // 1. Next with a missing answer stays, shows the step's own wording in an alert, and
  //    focus follows every step change. 2. Review parts jump to a step and Done comes back.
  //    3. Create shows the Invite screen.
  {
    const page = await preview();
    await button(page, "New resbite").click();
    await expect(page.getByRole("progressbar", { name: "Step 1 of 4", exact: true })).toBeVisible();
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Give your resbite a name.");
    await expect(heading(page, "What’s the plan?")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await next(page);
    await expect(heading(page, "When?")).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(0);
    // Under Reduce Motion a step fades in and never slides (spec principle 8).
    const animations = () => page.evaluate(() => window.__animations);
    await expect.poll(async () => (await animations()).includes("FadeIn")).toBe(true);
    assert.equal((await animations()).some((name) => name.startsWith("SlideIn")), false, "No slide under Reduce Motion");
    await button(page, "Previous step").click();
    await expect(heading(page, "What’s the plan?")).toBeFocused();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Garden picnic");
    await next(page);
    await next(page);
    await expect(heading(page, "Where?")).toBeFocused();
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Add a meeting place.");
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await next(page);
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Choose one or two categories.");
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Natural", exact: true })).toBeChecked();
    await next(page);
    await expect(heading(page, "Looks good?")).toBeFocused();
    await button(page, "Edit place, Riverside park").click();
    await expect(heading(page, "Where?")).toBeVisible();
    await page.getByLabel("Meeting place", { exact: true }).fill("Old mill");
    await button(page, "Done").click();
    await expect(button(page, "Edit place, Old mill")).toBeVisible();
    // A jump that finds another step incomplete says why instead of moving silently.
    await button(page, /^Edit date and time/).click();
    await typeDate(page, "2099-02-30 12:00");
    await button(page, "Previous step").click();
    await button(page, "Done").click();
    await expect(heading(page, "When?")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Choose a date and time in the future.");
    await typeDate(page, "2099-03-01 12:00");
    await button(page, "Done").click();
    await expect(heading(page, "Looks good?")).toBeVisible();
    await button(page, "Create preview").click();
    await expect(heading(page, "It’s on!")).toBeFocused();
    await button(page, "Invite people").click();
    await expect(page).toHaveURL(/\/invitations\?plan=/);
    // Back from invitations lands on My resbites with the created notice, as Later does.
    await button(page, "Back").click();
    await expect(page.getByText("Preview saved", { exact: true })).toBeVisible();
    await page.context().close();
    console.log("PASS: Next with a missing answer, alerts, focus on step change, jump from Review, Invite screen.");
  }

  // 3b. Opened from an idea (Create → idea → Use idea), Invite people still comes back to My resbites.
  {
    const page = await preview();
    await page.getByRole("tab", { name: "Create", exact: true }).click();
    await button(page, "Coffee together").click();
    await button(page, "Use idea").click();
    await createFromIdea(page, "Riverside park");
    await expect(heading(page, "It’s on!")).toBeVisible();
    await button(page, "Invite people").click();
    await expect(page).toHaveURL(/\/invitations\?plan=/);
    await button(page, "Back").click();
    await expect(page.getByText("Preview saved", { exact: true })).toBeVisible();
    await expect(button(page, "New resbite")).toBeVisible();
    // The saved toast shows once. Browser Back from the editor restores the same URL: no repeat.
    await button(page, "New resbite").click();
    await expect(page.getByRole("progressbar", { name: "Step 1 of 4", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/plans\?created=1/);
    await expect(button(page, "New resbite")).toBeVisible();
    await page.waitForTimeout(800); // a repeated toast would appear within this settle time
    await expect(page.getByText("Preview saved", { exact: true })).toHaveCount(0);
    // Closing an untouched editor from the new button returns without the toast too.
    await button(page, "New resbite").click();
    await expect(page.getByRole("progressbar", { name: "Step 1 of 4", exact: true })).toBeVisible();
    await close(page);
    await expect(button(page, "New resbite")).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByText("Preview saved", { exact: true })).toHaveCount(0);
    // A second save carries a new notice id, so its toast shows again.
    await button(page, "New resbite").click();
    await createSteps(page, { name: "Second save", place: "Park", categories: ["Natural"] });
    await button(page, "Create preview").click();
    await later(page);
    await expect(page.getByText("Preview saved", { exact: true })).toBeVisible();
    await page.context().close();
    console.log("PASS: Invite people from an idea comes back to My resbites with the created notice.");
  }

  // 3c. A cover warning asks for action, so it outlasts leaving the tab; opening a card clears it.
  {
    const page = await preview();
    await button(page, "New resbite").click();
    await createSteps(page, { name: "Cover check", place: "Park", categories: ["Natural"] });
    await button(page, "Create preview").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    await button(page, "Later").click();
    await expect(page.getByText("Preview saved", { exact: true })).toBeVisible();
    // Web preview has no cover journal, so set the outcome the way Later does.
    await page.evaluate(() => {
      history.replaceState(history.state, "", "/plans?created=1&updated=0&cover=failed");
      dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    });
    const warning = page.getByText(/cover photo couldn’t be prepared/);
    await expect(warning).toBeVisible();
    await button(page, "New resbite").click();
    await expect(page.getByRole("progressbar", { name: "Step 1 of 4", exact: true })).toBeVisible();
    await close(page);
    await expect(button(page, "New resbite")).toBeVisible();
    await expect(page.getByText("Preview saved", { exact: true })).toHaveCount(0);
    await expect(warning).toBeVisible();
    await card(page, "Cover check").first().click();
    await button(page, "Back").click();
    await expect(warning).toHaveCount(0);
    await page.context().close();
    console.log("PASS: the saved toast shows once; the cover warning stays until a card is opened.");
  }

  // 4. Quick tiles with a fixed clock: Friday 9 October 2026 at 10:30 in London.
  {
    const page = await preview({ time: new Date("2026-10-09T10:30:00+01:00") });
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Brunch");
    await next(page);
    await expect(button(page, "Today, Friday 9 October")).toBeVisible();
    // Tomorrow is Saturday, so the weekend tile is Sunday.
    await expect(button(page, "Sunday 11 October")).toBeVisible();
    await button(page, "Today, Friday 9 October").click();
    await expect(button(page, "Friday 9 October at 10:00")).toBeDisabled();
    await expect(button(page, "Friday 9 October at 13:00")).toBeEnabled();
    await button(page, "Friday 9 October at 13:00").click();
    await button(page, /^Pick a day/).click();
    await expect(page.getByLabel("Date and time (local)", { exact: true })).toHaveValue("2026-10-09 13:00");
    await button(page, "Tomorrow, Saturday 10 October").click();
    await expect(page.getByLabel("Date and time (local)", { exact: true })).toHaveValue("2026-10-10 13:00");
    await expect(button(page, "Saturday 10 October at 09:00")).toBeEnabled();
    await page.context().close();
    console.log("PASS: quick day tiles, the weekend rule, past times disabled, local YYYY-MM-DD HH:mm value.");
  }

  // 5. Leaving mid-flow runs the existing keep-draft guard; a kept draft resumes at its first missing step.
  {
    const page = await preview();
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Book swap");
    await next(page);
    await next(page);
    await expect(page.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.dismiss());
    await close(page);
    await expect(heading(page, "Where?")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await close(page);
    await button(page, /^Continue draft/).click();
    await expect(heading(page, "Where?")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Step 3 of 4", exact: true })).toBeVisible();
    await page.context().close();
    console.log("PASS: Close runs the keep-draft guard; a kept draft resumes at its first missing step.");
  }

  // 6. A restored unconfirmed save opens at Review, locked, offering Retry save.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*.supabase.co/**", (route) => route.abort());
    await page.addInitScript(() => {
      const id = "33333333-3333-4333-8333-333333333333";
      const details = {
        title: "Old picnic",
        description: "",
        categories: ["natural"],
        starts_at: "2020-01-01T09:00:00.000Z",
        time_zone: "UTC",
        place_label: "Old park",
        note: "",
      };
      sessionStorage.setItem(
        "resbite.drafts.v1.preview",
        JSON.stringify([
          {
            schema: 1,
            scope: "preview",
            key: "new",
            activityId: null,
            requestId: id,
            original: null,
            initial: JSON.stringify(["", "", [], "", "", ""]),
            title: "Old picnic",
            description: "",
            categories: ["natural"],
            start: "2020-01-01 09:00",
            place: "Old park",
            note: "",
            zone: "UTC",
            pending: { id, activityId: null, details },
            updatedAt: new Date().toISOString(),
          },
        ]),
      );
    });
    await page.goto(baseURL);
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await button(page, /^Continue draft/).click();
    await expect(heading(page, "Looks good?")).toBeVisible();
    await expect(button(page, "Retry save")).toBeVisible();
    // The restore status is replaced by the unchanged autosave within a frame, so assert the
    // persistent Review copy instead (amendment P2).
    await expect(
      page.getByText("The fields are held while the save is unconfirmed, so retrying sends exactly the same details.", {
        exact: true,
      }),
    ).toBeVisible();
    await button(page, "Edit name, Old picnic").click();
    await expect(page.getByLabel("Name", { exact: true })).not.toBeEditable();
    // Done returns to Review without re-checking the held (past) time, so Retry save stays reachable.
    await next(page);
    await expect(heading(page, "Looks good?")).toBeVisible();
    await expect(button(page, "Retry save")).toBeVisible();
    await context.close();
    console.log("PASS: a restored unconfirmed save opens at Review with fields locked and Retry save.");
  }

  // 7. Recent places: a saved place is offered next time.
  {
    const page = await preview();
    await button(page, "New resbite").click();
    await createSteps(page, { name: "Picnic", place: "Riverside park", categories: ["Natural"] });
    await button(page, "Create preview").click();
    await later(page);
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Second picnic");
    await next(page);
    await next(page);
    await button(page, "Use recent place Riverside park").click();
    await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue("Riverside park");
    await page.context().close();
    console.log("PASS: a saved place is offered as a recent place chip.");
  }

  // 8. Larger Text at 320 px: every step fits without sideways scrolling and keeps its pill inline.
  {
    const page = await preview({ width: 320, query: "?largeText=1" });
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    const fits = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="step-screen"] *')].every((el) => {
          const box = el.getBoundingClientRect();
          return box.width === 0 || (box.left >= -1 && box.right <= window.innerWidth + 1);
        }),
      );
    const inline = () =>
      page.evaluate(() =>
        document.querySelector('[data-testid="step-scroll"]').contains(document.querySelector('[data-testid="step-primary"]')),
      );
    await button(page, "New resbite").click();
    const steps = [
      ["What’s the plan?", () => page.getByLabel("Name", { exact: true }).fill("A long name for a very relaxed afternoon")],
      ["When?"],
      ["Where?", () => page.getByLabel("Meeting place", { exact: true }).fill("The community garden behind the old library")],
      ["What’s the vibe?", () => page.getByRole("checkbox", { name: "Community", exact: true }).click()],
      ["Looks good?"],
    ];
    for (const [title, fill] of steps) {
      await expect(heading(page, title)).toBeVisible();
      if (fill) await fill();
      assert.equal(await fits(), true, `${title} fits 320 px with Larger Text`);
      assert.equal(await inline(), true, `${title} keeps its pill inline under Larger Text`);
      await page.screenshot({ path: `${shots}/${steps.findIndex((s) => s[0] === title) + 1}-large-320.png`, fullPage: true });
      if (title !== "Looks good?") await next(page);
    }
    await page.context().close();
    console.log("PASS: Larger Text at 320 px on every step: no sideways overflow, inline pill.");
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
