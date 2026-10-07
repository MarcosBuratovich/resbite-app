// Browser QA against a running Expo server. Every Supabase request is intercepted.
// This does not replace the iPhone picker, keyboard, Dynamic Type or VoiceOver checks.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
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
  await page
    .getByRole("button", { name: "Explore coffee together", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Let’s make a plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save preview plan", exact: true })
    .click();
  await expect(
    page.getByText("Add a meeting place.", { exact: true }),
  ).toBeInViewport();
  await page
    .getByLabel("Meeting place", { exact: true })
    .fill("The garden café");
  await page
    .getByLabel("A note for everyone (optional)", { exact: true })
    .fill("Meet by the window.");
  await page
    .getByLabel("Date and time (local)", { exact: true })
    .fill("2099-02-30 12:00");
  await page
    .getByRole("button", { name: "Save preview plan", exact: true })
    .click();
  await expect(
    page.getByText("Choose a date and time in the future.", { exact: true }),
  ).toBeInViewport();
  await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue(
    "The garden café",
  );
  await page
    .getByLabel("Date and time (local)", { exact: true })
    .fill("2099-03-01 12:00");
  await expect(
    page.getByText("Draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.goto(baseURL);
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "My resbites", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue draft", exact: true })
    .click();
  await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue(
    "The garden café",
  );
  await expect(
    page.getByLabel("A note for everyone (optional)", { exact: true }),
  ).toHaveValue("Meet by the window.");
  await page
    .getByRole("button", { name: "Save preview plan", exact: true })
    .click();
  await expect(
    page.getByText("The garden café", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue(
    "The garden café",
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Meeting place", { exact: true })
    .fill("The riverside café");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "My resbites", exact: true }).click();
  await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue(
    "The riverside café",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("The riverside café", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("The garden café", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Invite someone", exact: true })
    .click();
  await expect(
    page.getByText("Invitations are disabled in design preview.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Yes, cancel plan", exact: true })
    .click();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit plan", exact: true }),
  ).toHaveCount(0);
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
    await legacy.getByRole("button", { name: "Continue draft", exact: true }).click();
    await legacy.getByRole("button", { name: "Save changes", exact: true }).click();
    // Scoped to the plan card: the same idea name also appears under Discover.
    await expect(
      legacy
        .getByText("YOU’RE ORGANISING", { exact: true })
        .locator("xpath=following-sibling::*[1]"),
    ).toHaveText("Coffee together");
    console.log("PASS: legacy preview edit draft restores event fields from its idea.");
    await legacy.context().close();
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
      await expect(
        fixture.getByText("Alex · pending", { exact: true }),
      ).toBeVisible();
      savedPlan = { ...savedPlan, place_label: "Updated while away" };
      attendeeResponse = "accepted";
      await foreground();
      await expect(
        fixture.getByText("Updated while away", { exact: true }),
      ).toBeVisible();
      await expect(
        fixture.getByText("Alex · accepted", { exact: true }),
      ).toBeVisible();
      readFailure = true;
      await foreground();
      await expect(
        fixture.getByRole("button", { name: "Refresh plans", exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        fixture.getByText("Updated while away", { exact: true }),
      ).toBeVisible();
      await expect(
        fixture.getByText("Make room for a first plan.", { exact: true }),
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
      await fixture.getByRole("tab", { name: "Discover", exact: true }).click();
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
    await expect(
      fixture.getByLabel("Meeting place", { exact: true }),
    ).toHaveValue("Original café");
    await fixture
      .getByLabel("Meeting place", { exact: true })
      .fill("My unsaved café");
    await fixture
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      fixture.getByLabel("Meeting place", { exact: true }),
    ).toHaveValue("My unsaved café");
    if (scenario === "storage_failure") {
      await expect(
        fixture.getByText(
          "Couldn’t protect this save on your device. Nothing was sent; try again.",
          { exact: true },
        ),
      ).toBeVisible();
      assert.equal(writes.length, 0);
      await expect(
        fixture.getByLabel("Meeting place", { exact: true }),
      ).toHaveValue("My unsaved café");
      await fixture.context().close();
      console.log(
        "PASS: failed local save journal prevents network mutation and retains fields.",
      );
      continue;
    }
    if (scenario === "offline" || scenario === "lost_reply") {
      await expect(
        fixture.getByRole("button", { name: "Retry save", exact: true }),
      ).toBeVisible();
      await expect(
        fixture.getByLabel("Meeting place", { exact: true }),
      ).not.toBeEditable();
      await fixture.reload();
      await expect(
        fixture.getByLabel("Meeting place", { exact: true }),
      ).toHaveValue("My unsaved café");
      await expect(
        fixture.getByLabel("Meeting place", { exact: true }),
      ).not.toBeEditable();
      await fixture
        .getByRole("button", { name: "Retry save", exact: true })
        .click();
      await expect(
        fixture.getByText("My unsaved café", { exact: true }),
      ).toBeVisible();
      if (scenario === "lost_reply")
        assert.equal(
          writes.length,
          1,
          "Committed edit must not be sent again after restart",
        );
      else assert.deepEqual(writes[0], writes[1]);
      assert.equal(
        await fixture.evaluate(() =>
          sessionStorage.getItem(
            "resbite.drafts.v1.11111111-1111-4111-8111-111111111111",
          ),
        ),
        null,
      );
    } else {
      await expect(
        fixture.getByText("Changed elsewhere", { exact: true }),
      ).toBeVisible();
      await expect(
        fixture.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();
      assert.equal(writes.length, 1);
      await fixture
        .getByRole("button", { name: "Use latest saved details", exact: true })
        .click();
      await expect(
        fixture.getByLabel("Meeting place", { exact: true }),
      ).toHaveValue("Changed elsewhere");
      await fixture
        .getByLabel("Meeting place", { exact: true })
        .fill("Reviewed café");
      await fixture
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        fixture.getByText("Reviewed café", { exact: true }),
      ).toBeVisible();
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
