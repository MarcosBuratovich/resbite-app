// UX1 creation steps in preview: Next with a missing answer, alerts and focus, quick day and
// time chips, jumping from Review, the Invite screen, leaving mid-flow, a restored
// unconfirmed save, recent places, and Larger Text at 320 px. Steps v2: the order, placement
// and sizes from the owner-approved mockup. UX3: the optional end time on When and Meeting
// details on Where. Every Supabase request is aborted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import {
  button,
  card,
  close,
  createFromIdea,
  createSteps,
  heading,
  heightOf,
  inOrder,
  later,
  next,
  quietReminders,
  typeDate,
} from "./qa-helpers.mjs";
const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const shots = "/private/tmp/resbite-steps";
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
async function preview({ width = 390, query = "", time, reducedMotion = "reduce" } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    timezoneId: "Europe/London",
    reducedMotion,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // Opening a card shows the event page, which would otherwise ask "Get reminders?" (verify-event covers it).
  await quietReminders(context);
  if (time) await page.clock.setFixedTime(time);
  // Records which CSS animations start and, every frame, the step body's opacity and transform,
  // to check how steps enter under Reduce Motion.
  await page.addInitScript(() => {
    window.__animations = [];
    document.addEventListener("animationstart", (e) => window.__animations.push(e.animationName), true);
    window.__stepMotion = [];
    const sample = () => {
      const title = document.querySelector('[data-testid="step-scroll"] [role="heading"]');
      if (title) {
        const style = getComputedStyle(title.parentElement);
        const x = new DOMMatrixReadOnly(style.transform).m41;
        window.__stepMotion.push({ title: title.textContent, opacity: Number(style.opacity), x });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
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
    // Steps v2 (owner-approved mockup): the photo first, then the name, then the optional description.
    assert.equal(
      await inOrder(page, [
        button(page, "Add cover photo"),
        page.getByLabel("Name", { exact: true }),
        page.getByLabel("Description (optional)", { exact: true }),
      ]),
      true,
      "What shows the photo, then the name, then the description",
    );
    await expect(page.getByText("Add a photo", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Name your resbite", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("What you’ll do together (optional)", { exact: true })).toBeVisible();
    assert.ok((await heightOf(button(page, "Add cover photo"))) >= 236, "The photo area is about 240 pt tall");
    assert.ok((await heightOf(page.getByLabel("Name", { exact: true }))) >= 76, "The name card is about 78 pt tall");
    assert.ok((await heightOf(button(page, "Next"))) >= 62, "The pill is 62 pt tall");
    assert.ok((await heightOf(button(page, "Close"))) >= 48, "Close is a 48 pt circle");
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Give your resbite a name.");
    await expect(heading(page, "What’s the plan?")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await page.getByLabel("Description (optional)", { exact: true }).fill("Bring a blanket");
    await next(page);
    await expect(heading(page, "When?")).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(0);
    // Under Reduce Motion a step fades in and never slides (spec principle 8). It animates with
    // shared values, never a Reanimated layout animation (a CSS animation on the web): on iPhone
    // those keep the native frame from growing, so controls revealed later can't be tapped.
    const motion = () => page.evaluate(() => window.__stepMotion.filter((m) => m.title === "When?"));
    await expect.poll(async () => (await motion()).some((m) => m.opacity < 1)).toBe(true);
    await expect.poll(async () => (await motion()).at(-1)?.opacity).toBe(1);
    assert.equal((await motion()).every((m) => m.x === 0), true, "No slide under Reduce Motion");
    assert.deepEqual(
      await page.evaluate(() => window.__animations.filter((name) => /^(Fade|Slide)/.test(name))),
      [],
      "Steps use no layout (entering) animations",
    );
    await button(page, "Previous step").click();
    await expect(heading(page, "What’s the plan?")).toBeFocused();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Garden picnic");
    await next(page);
    await next(page);
    await expect(heading(page, "Where?")).toBeFocused();
    // UX3-D5: the note is now private Meeting details, with a lock and one line saying who sees them.
    assert.equal(
      await inOrder(page, [
        page.getByLabel("Meeting place", { exact: true }),
        button(page, "Use my location"),
        page.getByLabel("Meeting details (optional)", { exact: true }),
        page.getByText("Only people who answer Going or Maybe see this.", { exact: true }),
      ]),
      true,
      "Where shows the place, Use my location, then Meeting details and its line",
    );
    await expect(page.getByPlaceholder("Door code, meeting spot… (optional)", { exact: true })).toBeVisible();
    await expect(page.getByLabel("A note for everyone (optional)", { exact: true })).toHaveCount(0);
    assert.ok((await heightOf(button(page, "Use my location"))) >= 70, "Use my location is a 72 pt tile");
    // With no recent places the Recent section is hidden.
    await expect(page.getByText(/^recent$/i)).toHaveCount(0);
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Add a meeting place.");
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await next(page);
    // The Vibe pill reads Review; vibe tiles are about 108 pt.
    await expect(button(page, "Review")).toBeVisible();
    assert.ok(
      (await heightOf(page.getByRole("checkbox", { name: "Natural", exact: true }))) >= 104,
      "Vibe tiles are about 108 pt tall",
    );
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
    // The description is written on What; Review shows it, and tapping it goes back to What.
    await expect(page.getByText("Bring a blanket", { exact: true })).toBeVisible();
    await button(page, "Edit description, Bring a blanket").click();
    await expect(heading(page, "What’s the plan?")).toBeVisible();
    await expect(page.getByLabel("Description (optional)", { exact: true })).toHaveValue("Bring a blanket");
    await button(page, "Done").click();
    await expect(heading(page, "Looks good?")).toBeVisible();
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
    console.log("PASS: Next with a missing answer, alerts, focus on step change, steps v2 order and sizes, the description on What, jump from Review, Invite screen.");
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

  // 1a. Without Reduce Motion a step slides in, from the right going forward and from the left
  //     going back, and never fades: its title stays opaque for VoiceOver focus.
  {
    const page = await preview({ reducedMotion: "no-preference" });
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Slide check");
    await next(page);
    await expect(heading(page, "When?")).toBeVisible();
    const samples = (title) => page.evaluate((t) => window.__stepMotion.filter((m) => m.title === t), title);
    await expect.poll(async () => (await samples("When?")).some((m) => m.x > 0)).toBe(true);
    await expect.poll(async () => (await samples("When?")).at(-1)?.x).toBe(0);
    assert.equal((await samples("When?")).every((m) => m.opacity === 1), true, "A step slides without fading");
    await page.evaluate(() => (window.__stepMotion = []));
    await button(page, "Previous step").click();
    await expect(heading(page, "What’s the plan?")).toBeFocused();
    await expect.poll(async () => (await samples("What’s the plan?")).some((m) => m.x < 0)).toBe(true);
    await expect.poll(async () => (await samples("What’s the plan?")).at(-1)?.x).toBe(0);
    assert.equal((await samples("What’s the plan?")).every((m) => m.opacity === 1), true, "Going back slides without fading");
    await page.context().close();
    console.log("PASS: without Reduce Motion, steps slide in from the right (forward) or left (back) and stay opaque.");
  }

  // 4a. A blank event starts tomorrow at 10:00, not "now + 24 h" at the current minute (iPhone
  //     checks 1 and 6), and Review says so. An untouched new editor is still not dirty and
  //     leaves no draft. Wednesday 7 October 2026 at 22:56 in London.
  {
    const page = await preview({ time: new Date("2026-10-07T22:56:00+01:00") });
    await button(page, "New resbite").click();
    await expect(page.getByRole("progressbar", { name: "Step 1 of 4", exact: true })).toBeVisible();
    await page.waitForTimeout(800); // longer than the 350 ms autosave debounce
    const keys = () =>
      page.evaluate(() => JSON.parse(sessionStorage.getItem("resbite.drafts.v1.preview") ?? "[]").map((d) => d.key));
    assert.deepEqual(await keys(), [], "An untouched new editor leaves no draft");
    let asked = false;
    const onDialog = (dialog) => {
      asked = true;
      void dialog.dismiss();
    };
    page.on("dialog", onDialog);
    await close(page);
    await expect(button(page, "New resbite")).toBeVisible();
    assert.equal(asked, false, "Closing an untouched new editor does not ask to keep a draft");
    page.off("dialog", onDialog);
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Late plan");
    await next(page);
    await expect(heading(page, "When?")).toBeVisible();
    await expect(button(page, "Tomorrow, Thursday 8 October")).toHaveAttribute("aria-selected", "true");
    await expect(button(page, "Thursday 8 October at 10:00")).toHaveAttribute("aria-selected", "true");
    // The pickers are always shown now: there is no separate Pick tile or "Other time" chip.
    await expect(button(page, /^(Pick a day|Other time)/)).toHaveCount(0);
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await next(page);
    await expect(heading(page, "Looks good?")).toBeVisible();
    await expect(button(page, "Edit date and time, Thursday 8 October at 10:00")).toContainText("10:00");
    await page.context().close();
    console.log("PASS: a blank event preselects Tomorrow at 10:00 and Review shows 10:00; untouched, it leaves no draft.");
  }

  // 4. Quick tiles with a fixed clock: Friday 9 October 2026 at 10:30 in London.
  {
    const page = await preview({ time: new Date("2026-10-09T10:30:00+01:00") });
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Brunch");
    await next(page);
    await expect(button(page, "Today, Friday 9 October")).toBeVisible();
    // Picker first (steps v2): the date card, then the day chips, then the time chips, then the zone.
    assert.equal(
      await inOrder(page, [
        page.getByLabel("Date and time (local)", { exact: true }),
        button(page, "Today, Friday 9 October"),
        button(page, "Saturday 10 October at 09:00"),
        page.getByLabel("Times shown in Europe/London", { exact: true }),
      ]),
      true,
      "When shows the date card, the day chips, the time chips, then the zone",
    );
    await expect(page.getByText("London time", { exact: true })).toBeVisible();
    assert.ok((await heightOf(button(page, "Today, Friday 9 October"))) >= 52, "Day chips are 52 pt tall");
    assert.ok((await heightOf(button(page, "Saturday 10 October at 09:00"))) >= 52, "Time chips are 52 pt tall");
    // Tomorrow is Saturday, so the weekend tile is Sunday.
    await expect(button(page, "Sunday 11 October")).toBeVisible();
    await button(page, "Today, Friday 9 October").click();
    await expect(button(page, "Friday 9 October at 10:00")).toBeDisabled();
    await expect(button(page, "Friday 9 October at 13:00")).toBeEnabled();
    await button(page, "Friday 9 October at 13:00").click();
    await expect(page.getByLabel("Date and time (local)", { exact: true })).toHaveValue("2026-10-09 13:00");
    await button(page, "Tomorrow, Saturday 10 October").click();
    await expect(page.getByLabel("Date and time (local)", { exact: true })).toHaveValue("2026-10-10 13:00");
    await expect(button(page, "Saturday 10 October at 09:00")).toBeEnabled();
    await page.context().close();
    console.log("PASS: the date card before the day and time chips, the weekend rule, past times disabled, local YYYY-MM-DD HH:mm value.");
  }

  // 4b. UX3 optional end time (spec "Event details"): empty by default, "+ End time" adds it an hour after the
  //     start, moving the start keeps its length, an end before the start stays on When with the step's
  //     alert, it may end on a later day, Remove clears it, and cards show the range. Friday 9 October 2026.
  {
    const page = await preview({ time: new Date("2026-10-09T10:30:00+01:00") });
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Long lunch");
    await next(page);
    const endField = page.getByLabel("End date and time (local)", { exact: true });
    await expect(endField).toHaveCount(0);
    await expect(page.getByText("Optional. Without it, calendars get a 1-hour event.", { exact: true })).toBeVisible();
    await button(page, "Tomorrow, Saturday 10 October").click();
    await button(page, "Saturday 10 October at 13:00").click();
    assert.ok((await heightOf(button(page, "Add an end time"))) >= 44, "The end chip is a 44 pt target");
    assert.equal(
      await inOrder(page, [
        button(page, "Saturday 10 October at 13:00"),
        button(page, "Add an end time"),
        page.getByText("Optional. Without it, calendars get a 1-hour event.", { exact: true }),
        page.getByLabel("Times shown in Europe/London", { exact: true }),
      ]),
      true,
      "The end comes after the time chips and before the zone",
    );
    await button(page, "Add an end time").click();
    await expect(endField).toHaveValue("2026-10-10 14:00");
    await expect(button(page, "Add an end time")).toHaveCount(0);
    // The 1-hour line explains the missing end, so it goes once there is one.
    await expect(page.getByText("Optional. Without it, calendars get a 1-hour event.", { exact: true })).toHaveCount(0);
    assert.ok((await heightOf(button(page, "Remove end time"))) >= 44, "Remove is a 44 pt target");
    // Moving the start keeps the end's length, from a chip or typed.
    await button(page, "Saturday 10 October at 18:00").click();
    await expect(endField).toHaveValue("2026-10-10 19:00");
    await typeDate(page, "2026-10-10 09:00");
    await expect(endField).toHaveValue("2026-10-10 10:00");
    await endField.fill("2026-10-10 08:30");
    await next(page);
    await expect(heading(page, "When?")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("The end must be after the start.");
    await endField.fill("2026-10-11 01:00");
    await next(page);
    await expect(heading(page, "Where?")).toBeVisible();
    await page.getByLabel("Meeting place", { exact: true }).fill("Old mill");
    await page.getByLabel("Meeting details (optional)", { exact: true }).fill("Door code 4521");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await next(page);
    // Review reads the range, here ending the next day.
    const range = button(page, "Edit date and time, Saturday 10 October, from 09:00 to 01:00 on Sunday 11 October");
    await expect(range).toContainText("09:00 – Sun 11 01:00");
    await range.click();
    await button(page, "Remove end time").click();
    await expect(endField).toHaveCount(0);
    await expect(button(page, "Add an end time")).toBeVisible();
    await expect(page.getByText("Optional. Without it, calendars get a 1-hour event.", { exact: true })).toBeVisible();
    await next(page);
    await expect(button(page, "Edit date and time, Saturday 10 October at 09:00")).toContainText("09:00");
    await button(page, "Edit date and time, Saturday 10 October at 09:00").click();
    await button(page, "Add an end time").click();
    await expect(endField).toHaveValue("2026-10-10 10:00");
    await next(page);
    await button(page, "Create preview").click();
    await later(page);
    await expect(card(page, "Long lunch")).toHaveAttribute("aria-label", /^Long lunch, Saturday 10 October, from 09:00 to 10:00, Old mill, /);
    await expect(card(page, "Long lunch")).toContainText("09:00 – 10:00");
    await page.context().close();
    console.log("PASS: the optional end time: added an hour after the start, keeps its length, checked on When, may end the next day, Remove clears it, cards show the range.");
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
    await expect(page.getByText(/^recent$/i)).toBeVisible();
    assert.ok((await heightOf(button(page, "Use recent place Riverside park"))) >= 60, "Recent places are 64 pt rows");
    await button(page, "Use recent place Riverside park").click();
    await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue("Riverside park");
    await page.context().close();
    console.log("PASS: a saved place is offered as a recent place row.");
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
      ["When?", () => button(page, "Add an end time").click()],
      [
        "Where?",
        async () => {
          await page.getByLabel("Meeting place", { exact: true }).fill("The community garden behind the old library");
          await page.getByLabel("Meeting details (optional)", { exact: true }).fill("Ring the bell by the blue gate");
        },
      ],
      ["What’s the vibe?", () => page.getByRole("checkbox", { name: "Community", exact: true }).click()],
      ["Looks good?"],
    ];
    for (const [title, fill] of steps) {
      await expect(heading(page, title)).toBeVisible();
      if (fill) await fill();
      assert.equal(await fits(), true, `${title} fits 320 px with Larger Text`);
      assert.equal(await inline(), true, `${title} keeps its pill inline under Larger Text`);
      await page.waitForTimeout(300); // let the step's Reduce Motion fade finish before capturing
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
