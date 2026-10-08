// Browser QA against a running Expo server. Every Supabase request is intercepted.
// This does not replace the iPhone picker, keyboard, Dynamic Type or VoiceOver checks.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  button,
  card,
  cancelFromList,
  close,
  editEvent,
  expectCancelled,
  expectCategories,
  heading,
  inviteFromList,
  later,
  next,
  typeDate,
} from "./qa-helpers.mjs";
const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
const newPage = async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
};
try {
  const page = await newPage();
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(baseURL);
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("button", { name: "Coffee together", exact: true }).click();
  await page.getByRole("button", { name: "Use this idea", exact: true }).click();
  // An idea opens at Review (UX-D3). Create jumps to the first missing answer and says why.
  await expect(heading(page, "Looks good?")).toBeVisible();
  await button(page, "Create preview").click();
  await expect(page.getByText("Add a meeting place.", { exact: true })).toBeInViewport();
  await expect(heading(page, "Where?")).toBeFocused();
  await page.getByLabel("Meeting place", { exact: true }).fill("The garden café");
  await page.getByLabel("A note for everyone (optional)", { exact: true }).fill("Meet by the window.");
  await button(page, "Previous step").click();
  await typeDate(page, "2099-02-30 12:00");
  await next(page);
  await expect(page.getByText("Choose a date and time in the future.", { exact: true })).toBeInViewport();
  await page.getByLabel("Date and time (local)", { exact: true }).fill("2099-03-01 12:00");
  await expect(page.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
  await page.goto(baseURL);
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "My resbites", exact: true }).click();
  await button(page, /^Continue draft/).click();
  // A complete restored draft opens at Review.
  await expect(button(page, "Edit place, The garden café")).toBeVisible();
  await expect(page.getByText("Meet by the window.", { exact: true })).toBeVisible();
  await button(page, "Create preview").click();
  await later(page);
  await expect(page.getByText("The garden café", { exact: true })).toBeVisible();
  // Recent places (UX-P6): a successful save remembers its place on this device.
  const recent = () => page.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview"));
  await expect.poll(recent).toBe(JSON.stringify(["The garden café"]));
  await editEvent(page, "Coffee together");
  await expect(button(page, "Save preview")).toBeDisabled();
  await button(page, "Edit place, The garden café").click();
  await page.getByLabel("Meeting place", { exact: true }).fill("The riverside café");
  page.once("dialog", (dialog) => dialog.dismiss());
  await close(page);
  await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue("The riverside café");
  await next(page);
  await button(page, "Save preview").click();
  await expect(page.getByText("The riverside café", { exact: true })).toBeVisible();
  await expect(page.getByText("The garden café", { exact: true })).toHaveCount(0);
  await expect.poll(recent).toBe(JSON.stringify(["The riverside café", "The garden café"]));
  await inviteFromList(page, "Coffee together", "Invitations are disabled in design preview.");
  await cancelFromList(page, "Coffee together");
  await expectCancelled(page, "Coffee together");
  await page.getByRole("tab", { name: "Wellness", exact: true }).click();
  await expect(
    page.getByText("Sample dashboard", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("30 min", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByLabel("What should we call you?", { exact: true })
    .fill("Alex");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Preview name saved.", { exact: true }),
  ).toBeVisible();
  console.log(
    "PASS: preview create/edit/cancel, validation, draft and leave protection, invitation block.",
  );
  await page.context().close();

  {
    const legacy = await newPage();
    await legacy.route("**/*.supabase.co/**", (route) => route.abort());
    // A draft saved before custom events: no title, description or categories anywhere.
    await legacy.addInitScript(() => {
      sessionStorage.setItem(
        "resbite.drafts.v1.preview",
        JSON.stringify([
          {
            schema: 1,
            scope: "preview",
            key: "edit-legacy-1",
            activityId: "coffee-together",
            planId: "legacy-1",
            requestId: "legacy-1",
            original: {
              id: "legacy-1",
              activity_id: "coffee-together",
              starts_at: "2099-03-01T15:00:00Z",
              time_zone: "UTC",
              place_label: "Old café",
              note: "",
              status: "active",
              version: 1,
            },
            initial: "[]",
            start: "2099-03-01 15:00",
            place: "Old café",
            note: "",
            zone: "UTC",
            pending: null,
            updatedAt: new Date().toISOString(),
          },
        ]),
      );
    });
    await legacy.goto(baseURL);
    await legacy.getByText("Preview the design", { exact: true }).click();
    await legacy.getByRole("tab", { name: "My resbites", exact: true }).click();
    await button(legacy, /^Continue draft/).click();
    await button(legacy, "Save preview").click();
    await expect(card(legacy, "Coffee together")).toBeVisible();
    console.log("PASS: legacy preview edit draft restores event fields from its idea.");
    await legacy.context().close();
  }

  // Blank custom event (CE1): a name and one or two categories are required.
  const blank = await newPage();
  await blank.route("**/*.supabase.co/**", (route) => route.abort());
  await blank.goto(baseURL);
  await blank.getByText("Preview the design", { exact: true }).click();
  await blank.getByRole("tab", { name: "My resbites", exact: true }).click();
  // Empty state: an illustration, "Nothing planned" and two tiles.
  await expect(blank.getByText("Nothing planned", { exact: true })).toBeVisible();
  await expect(button(blank, "Start a new resbite")).toBeVisible();
  await expect(button(blank, "Browse ideas")).toBeVisible();
  await blank.getByRole("button", { name: "New resbite", exact: true }).click();
  await next(blank);
  await expect(blank.getByText("Give your resbite a name.", { exact: true })).toBeVisible();
  await blank.getByLabel("Name", { exact: true }).fill("Garden picnic");
  await next(blank);
  await next(blank);
  await blank.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  await next(blank);
  await next(blank);
  await expect(blank.getByText("Choose one or two categories.", { exact: true })).toBeVisible();
  await blank.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await blank.getByRole("checkbox", { name: "Community", exact: true }).click();
  await expect(blank.getByRole("checkbox", { name: "Creative", exact: true })).toBeDisabled();
  await next(blank);
  await button(blank, "Create preview").click();
  await later(blank);
  await expect(blank.getByText("Garden picnic", { exact: true })).toBeVisible();
  await expectCategories(blank, "Garden picnic", "Natural · Community");
  await blank.context().close();
  console.log("PASS: preview blank custom event needs a name and one or two categories.");

  // An untouched editor must not leave a "Continue draft" card behind.
  {
    const noDraft = async (page) => {
      await expect(page.getByRole("button", { name: "New resbite", exact: true })).toBeVisible();
      await page.waitForTimeout(500);
      await expect(page.getByRole("button", { name: /^Continue draft/ })).toHaveCount(0);
    };
    const open = async () => {
      const page = await newPage();
      await page.route("**/*.supabase.co/**", (route) => route.abort());
      await page.goto(baseURL);
      await page.getByText("Preview the design", { exact: true }).click();
      await page.getByRole("tab", { name: "My resbites", exact: true }).click();
      await page.getByRole("button", { name: "New resbite", exact: true }).click();
      await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
      return page;
    };
    const back = (page) => close(page);

    const untouched = await open();
    await untouched.waitForTimeout(1200); // longer than the autosave delay
    await back(untouched);
    await noDraft(untouched);
    await untouched.context().close();
    console.log("PASS: an untouched editor leaves no draft.");

    const reverted = await open();
    await reverted.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await expect(reverted.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
    await reverted.waitForTimeout(600);
    await reverted.getByLabel("Name", { exact: true }).fill("");
    await reverted.waitForTimeout(1200);
    await expect(reverted.getByText("Draft saved on this device.", { exact: true })).toHaveCount(0);
    await back(reverted); // untouched again: no leave prompt expected
    await noDraft(reverted);
    await reverted.context().close();
    console.log("PASS: an edit that is undone removes its stale draft.");

    // Typing and undoing inside the autosave delay must not claim a draft is being saved.
    const quick = await open();
    await quick.getByLabel("Name", { exact: true }).fill("G");
    await quick.getByLabel("Name", { exact: true }).fill("");
    await quick.waitForTimeout(1200);
    await expect(quick.getByText("Saving draft on this device…", { exact: true })).toHaveCount(0);
    await back(quick);
    await noDraft(quick);
    await quick.context().close();
    console.log("PASS: a quick edit-and-undo shows no saving status and leaves no draft.");

    // Leaving right after undoing a saved edit still removes the stale draft.
    const hasty = await open();
    await hasty.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await expect(hasty.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
    await hasty.getByLabel("Name", { exact: true }).fill("");
    await back(hasty);
    await noDraft(hasty);
    await hasty.context().close();
    console.log("PASS: leaving right after undoing an edit removes the stale draft.");

    // A truly empty draft (as older builds could leave) is removed once opened and left untouched.
    const seeded = await open();
    await seeded.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await expect(seeded.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
    await seeded.evaluate(() => {
      const k = "resbite.drafts.v1.preview";
      const all = JSON.parse(sessionStorage.getItem(k));
      sessionStorage.setItem(k, JSON.stringify(all.map((d) => ({ ...d, title: "" }))));
    });
    await seeded.getByLabel("Name", { exact: true }).fill("");
    await seeded.waitForTimeout(100);
    await seeded.reload();
    await seeded.getByText("Preview the design", { exact: true }).click();
    await seeded.getByRole("tab", { name: "My resbites", exact: true }).click();
    await seeded.getByRole("button", { name: /^Continue draft/ }).click();
    await expect(seeded.getByLabel("Name", { exact: true })).toHaveValue("");
    await seeded.waitForTimeout(1200);
    await back(seeded);
    await noDraft(seeded);
    await seeded.context().close();
    console.log("PASS: an empty existing draft is removed when opened and left untouched.");

    const kept = await open();
    await kept.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await expect(kept.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
    kept.once("dialog", (dialog) => dialog.accept());
    await back(kept);
    await expect(kept.getByRole("button", { name: /^Continue draft/ })).toBeVisible();
    await kept.getByRole("button", { name: /^Continue draft/ }).click();
    // A restored incomplete draft opens at its first missing step (Where); go back to What.
    await expect(heading(kept, "Where?")).toBeVisible();
    await button(kept, "Previous step").click();
    await button(kept, "Previous step").click();
    await expect(kept.getByLabel("Name", { exact: true })).toHaveValue("Garden picnic");
    await kept.waitForTimeout(1200);
    // The resumed draft still differs from its baseline, so it is kept when left unchanged.
    kept.once("dialog", (dialog) => dialog.accept());
    await back(kept);
    await expect(kept.getByRole("button", { name: /^Continue draft/ })).toBeVisible();
    await kept.getByRole("button", { name: /^Continue draft/ }).click();
    await button(kept, "Previous step").click();
    await button(kept, "Previous step").click();
    // Returning a restored draft to its baseline removes it.
    await kept.getByLabel("Name", { exact: true }).fill("");
    await kept.waitForTimeout(1200);
    await back(kept);
    await noDraft(kept);
    await kept.context().close();
    console.log("PASS: a kept draft resumes and survives unchanged; reverting it removes the card.");
  }

  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.invalid",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: {},
    user_metadata: { registration_details_version: 1 },
    created_at: "2026-01-01T00:00:00Z",
  };
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" }),
    ).toString("base64url"),
    "local-fixture-only",
  ].join(".");
  const session = {
    access_token: token,
    refresh_token: "local-fixture",
    token_type: "bearer",
    expires_at: expiry,
    expires_in: 3600,
    user,
  };
  for (const scenario of [
    "offline",
    "conflict",
    "refresh",
    "lost_reply",
    "storage_failure",
  ]) {
    const fixture = await newPage();
    let savedPlan = {
      id: "22222222-2222-4222-8222-222222222222",
      activity_id: "coffee-together",
      title: "Coffee evening",
      description: "",
      categories: ["community", "uplifting"],
      owner_id: user.id,
      starts_at: "2099-03-01T15:00:00Z",
      time_zone: "UTC",
      place_label: "Original café",
      note: "Original note",
      status: "active",
      version: 1,
    };
    if (scenario === "storage_failure")
      await fixture.addInitScript(() => {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith("resbite.drafts."))
            throw new Error("Storage unavailable");
          return set.call(this, key, value);
        };
      });
    const writes = [];
    let readFailure = false;
    let planReads = 0;
    let holdNextRead = false;
    let releaseRead;
    let attendeeResponse = "pending";
    const foreground = async () =>
      fixture.evaluate(() => {
        for (const state of ["hidden", "visible"]) {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: state,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });
    await fixture.addInitScript(
      (session) =>
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        ),
      session,
    );
    await fixture.route("**/*.supabase.co/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const reply = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (url.pathname === "/auth/v1/user") return reply(user);
      if (url.pathname === "/rest/v1/rpc/account_access_status")
        return reply({ account_id: user.id, status: "approved" });
      if (url.pathname === "/rest/v1/profiles")
        return reply({
          id: user.id,
          display_name: "Fixture",
          avatar_path: null,
        });
      if (url.pathname === "/rest/v1/activities") return reply([]);
      if (url.pathname === "/rest/v1/attendees")
        return reply(
          scenario === "refresh"
            ? [
                {
                  plan_id: savedPlan.id,
                  user_id: "guest",
                  response: attendeeResponse,
                  profiles: { display_name: "Alex" },
                },
              ]
            : [],
        );
      if (url.pathname === "/rest/v1/plans") {
        planReads++;
        if (holdNextRead) {
          holdNextRead = false;
          const snapshot = { ...savedPlan };
          await new Promise((resolve) => {
            releaseRead = resolve;
          });
          return reply([snapshot]);
        }
        if (readFailure) return reply({ message: "Offline fixture" }, 503);
        return reply(
          request.headers().accept?.includes("object")
            ? savedPlan
            : [savedPlan],
        );
      }
      if (url.pathname === "/rest/v1/rpc/change_plan_v2") {
        const write = request.postDataJSON();
        writes.push(write);
        if (writes.length === 1) {
          if (scenario === "lost_reply") {
            savedPlan = {
              ...savedPlan,
              title: write.p_title,
              description: write.p_description,
              categories: write.p_categories,
              starts_at: write.p_start,
              time_zone: write.p_zone,
              place_label: write.p_place,
              note: write.p_note,
              version: savedPlan.version + 1,
            };
            return reply({ message: "Lost response" }, 503);
          }
          if (scenario === "offline")
            return reply({ message: "Temporary network failure" }, 503);
          savedPlan = {
            ...savedPlan,
            place_label: "Changed elsewhere",
            version: 2,
          };
          return reply(
            { code: "40001", message: "Plan changed; refresh" },
            409,
          );
        }
        assert.equal(write.p_cancel, false);
        assert.equal(write.p_version, savedPlan.version);
        savedPlan = {
          ...savedPlan,
          title: write.p_title,
          description: write.p_description,
          categories: write.p_categories,
          starts_at: write.p_start,
          time_zone: write.p_zone,
          place_label: write.p_place,
          note: write.p_note,
          version: savedPlan.version + 1,
        };
        return reply(savedPlan.version);
      }
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    });
    if (scenario === "refresh") {
      await fixture.goto(`${baseURL}/plans`);
      await expect(
        fixture.getByText("Original café", { exact: true }),
      ).toBeVisible();
      await expect(fixture.getByText("Coffee evening", { exact: true })).toBeVisible();
      await expect(fixture.getByText("1 going", { exact: true })).toHaveCount(0);
      savedPlan = { ...savedPlan, place_label: "Updated while away" };
      attendeeResponse = "accepted";
      await foreground();
      await expect(
        fixture.getByText("Updated while away", { exact: true }),
      ).toBeVisible();
      await expect(fixture.getByText("1 going", { exact: true })).toBeVisible();
      readFailure = true;
      await foreground();
      await expect(
        fixture.getByRole("button", { name: "Refresh plans", exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        fixture.getByText("Updated while away", { exact: true }),
      ).toBeVisible();
      await expect(
        fixture.getByText("Nothing planned", { exact: true }),
      ).toHaveCount(0);
      readFailure = false;
      savedPlan = { ...savedPlan, place_label: "Recovered café" };
      await fixture
        .getByRole("button", { name: "Refresh plans", exact: true })
        .click();
      await expect(
        fixture.getByText("Recovered café", { exact: true }),
      ).toBeVisible();
      await expect(
        fixture.getByRole("button", { name: "Refresh plans", exact: true }),
      ).toHaveCount(0);
      holdNextRead = true;
      await foreground();
      await expect.poll(() => Boolean(releaseRead)).toBe(true);
      savedPlan = { ...savedPlan, place_label: "Newest café" };
      await foreground();
      await expect(
        fixture.getByText("Newest café", { exact: true }),
      ).toBeVisible();
      releaseRead();
      await fixture.waitForTimeout(250);
      await expect(
        fixture.getByText("Newest café", { exact: true }),
      ).toBeVisible();
      await fixture.getByRole("tab", { name: "Create", exact: true }).click();
      const readsBefore = planReads;
      await foreground();
      await fixture.waitForTimeout(250);
      assert.equal(planReads, readsBefore, "Hidden plans tab must not refresh");
      assert.equal(writes.length, 0, "Refresh must not mutate plans");
      console.log(
        "PASS: foreground plan/RSVP refresh, offline retention, retry and hidden-tab cleanup.",
      );
      await fixture.context().close();
      continue;
    }
    await fixture.goto(`${baseURL}/arrange?plan=${savedPlan.id}`);
    // An edit opens at Review (UX-D3); the place part jumps to Where.
    await button(fixture, "Edit place, Original café").click();
    await fixture.getByLabel("Meeting place", { exact: true }).fill("My unsaved café");
    await next(fixture);
    await button(fixture, "Save").click();
    await expect(button(fixture, "Edit place, My unsaved café")).toBeVisible();
    if (scenario === "storage_failure") {
      await expect(
        fixture.getByText("Couldn’t protect this save on your device. Nothing was sent; try again.", { exact: true }),
      ).toBeVisible();
      assert.equal(writes.length, 0);
      await expect(button(fixture, "Edit place, My unsaved café")).toBeVisible();
      await fixture.context().close();
      console.log("PASS: failed local save journal prevents network mutation and retains fields.");
      continue;
    }
    if (scenario === "offline" || scenario === "lost_reply") {
      await expect(button(fixture, "Retry save")).toBeVisible();
      const lockedPlace = async () => {
        await button(fixture, "Edit place, My unsaved café").click();
        await expect(fixture.getByLabel("Meeting place", { exact: true })).toHaveValue("My unsaved café");
        await expect(fixture.getByLabel("Meeting place", { exact: true })).not.toBeEditable();
        await next(fixture);
      };
      await lockedPlace();
      await fixture.reload();
      // A restored unconfirmed save opens at Review with Retry save.
      await expect(button(fixture, "Retry save")).toBeVisible();
      await lockedPlace();
      await button(fixture, "Retry save").click();
      // Review shows the place too, so wait for the editor to close before reading the list.
      await expect(heading(fixture, "Looks good?")).toHaveCount(0);
      await expect(fixture.getByText("My unsaved café", { exact: true })).toBeVisible();
      if (scenario === "lost_reply")
        assert.equal(writes.length, 1, "Committed edit must not be sent again after restart");
      else assert.deepEqual(writes[0], writes[1]);
      assert.equal(
        await fixture.evaluate(() => sessionStorage.getItem("resbite.drafts.v1.11111111-1111-4111-8111-111111111111")),
        null,
      );
    } else {
      await expect(fixture.getByText("Changed elsewhere", { exact: true })).toBeVisible();
      await expect(button(fixture, "Save")).toBeDisabled();
      assert.equal(writes.length, 1);
      await button(fixture, "Use latest saved details").click();
      await button(fixture, "Edit place, Changed elsewhere").click();
      await fixture.getByLabel("Meeting place", { exact: true }).fill("Reviewed café");
      await next(fixture);
      await button(fixture, "Save").click();
      await expect(heading(fixture, "Looks good?")).toHaveCount(0);
      await expect(fixture.getByText("Reviewed café", { exact: true })).toBeVisible();
      assert.equal(writes[1].p_version, 2);
    }
    console.log(
      `PASS: mocked ${scenario} save, retained draft and safe retry.`,
    );
    await fixture.context().close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
