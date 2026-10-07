// All Supabase calls are intercepted; no catalogue publication, users or plans are created.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

const additions = JSON.parse(
  await readFile(
    new URL("../content/activity-additions.json", import.meta.url),
    "utf8",
  ),
);

const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [],
  unexpected = [];
const user = {
  id: "84000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "catalogue@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { registration_details_version: 1 },
  app_metadata: {},
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
  "fixture",
].join(".");
const session = {
  access_token: token,
  refresh_token: "fixture",
  expires_at: expiry,
  expires_in: 3600,
  token_type: "bearer",
  user,
};
const live = {
  id: "coffee-together",
  title: "Published coffee",
  categories: ["community", "uplifting"],
  description: "Reviewed server description.",
  artwork_key: "coffee-together",
  source_ids: ["fixture"],
  published: true,
  duration_minutes: 45,
  tips: ["Reviewed server tip."],
};
const foreground = async (page) =>
  page.evaluate(() => {
    for (const state of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
async function fixture(width = 390, preview = false) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
  });
  const page = await context.newPage();
  const state = {
    rows: [],
    offline: false,
    reads: 0,
    hold: false,
    release: undefined,
  };
  page.on("pageerror", (error) => errors.push(error.message));
  if (!preview)
    await page.addInitScript((session) => {
      if (!sessionStorage.getItem("catalogue-seeded")) {
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem("catalogue-seeded", "1");
      }
    }, session);
  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (preview) {
      unexpected.push(`Preview backend ${url.pathname}`);
      return route.abort();
    }
    if (url.pathname === "/auth/v1/user") return reply(user);
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204 });
    if (url.pathname === "/rest/v1/rpc/account_access_status")
      return reply({ account_id: user.id, status: "approved" });
    if (url.pathname === "/rest/v1/profiles")
      return reply({
        id: user.id,
        display_name: "Catalogue tester",
        avatar_path: null,
      });
    if (url.pathname === "/rest/v1/activities") {
      assert.equal(request.method(), "GET");
      assert.equal(url.searchParams.get("published"), "eq.true");
      state.reads++;
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const rows = state.rows.filter((row) => !id || row.id === id);
      if (state.hold) {
        state.hold = false;
        await new Promise((resolve) => {
          state.release = resolve;
        });
        return reply(rows).catch(() => {});
      }
      if (state.offline) return reply({ message: "Offline fixture" }, 503);
      return reply(rows);
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  return { page, state, close: () => context.close() };
}
try {
  await mkdir("/private/tmp/resbite-catalogue", { recursive: true });
  for (const width of [320, 390]) {
    const f = await fixture(width);
    await f.page.goto(`${baseURL}/discover`);
    await expect(
      f.page.getByText("No activities are available yet. Check again soon."),
    ).toBeVisible();
    await expect(
      f.page.getByRole("button", { name: "Coffee together", exact: true }),
    ).toHaveCount(0);
    await f.page.screenshot({
      path: `/private/tmp/resbite-catalogue/empty-${width}.png`,
      fullPage: true,
    });
    f.state.offline = true;
    await f.page
      .getByRole("button", { name: "Check for activities", exact: true })
      .click();
    await expect(
      f.page.getByText(
        "We couldn’t load the activities. Check your connection and try again.",
      ),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      f.page.getByText("No activities are available yet. Check again soon."),
    ).toHaveCount(0);
    f.state.offline = false;
    f.state.rows = [live];
    await f.page
      .getByRole("button", { name: "Try activities again", exact: true })
      .click();
    await f.page
      .getByRole("button", { name: "Published coffee", exact: true })
      .click();
    await expect(
      f.page.getByText("Reviewed server description.", { exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByText("Reviewed server tip.", { exact: true }),
    ).toBeVisible();
    await expect(f.page.getByText("45 minutes", { exact: true })).toBeVisible();
    await expect(
      f.page.getByText("Activity content approved for the owner-only beta.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        f.page
          .getByRole("img", { name: "Published coffee", exact: true })
          .evaluate((node) => {
            // React Native Web deliberately hides its accessibility-only img;
            // the parent paints the visible image as a background.
            for (
              let element = node.parentElement;
              element;
              element = element.parentElement
            )
              if (Number(getComputedStyle(element).opacity) < 0.99)
                return false;
            return true;
          }),
      )
      .toBe(true);
    await f.page.screenshot({
      path: `/private/tmp/resbite-catalogue/detail-${width}.png`,
      fullPage: true,
    });
    await f.page
      .getByRole("button", { name: "Let’s make a plan", exact: true })
      .click();
    await expect(
      f.page.getByLabel("Meeting place", { exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByRole("heading", { name: "Published coffee", exact: true }),
    ).toBeVisible();
    f.state.rows = [];
    await foreground(f.page);
    await expect(
      f.page.getByText("Activity unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByRole("button", { name: "Save plan", exact: true }),
    ).toHaveCount(0);
    await f.page.goto(`${baseURL}/activity/painting`);
    await expect(
      f.page.getByText("Activity unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByRole("button", { name: "Let’s make a plan", exact: true }),
    ).toHaveCount(0);
    await f.page.goto(`${baseURL}/arrange?activity=painting`);
    await expect(
      f.page.getByText("Activity unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      f.page.getByLabel("Meeting place", { exact: true }),
    ).toHaveCount(0);
    await f.close();
  }
  const delayed = await fixture();
  delayed.state.rows = [live];
  delayed.state.hold = true;
  await delayed.page.goto(`${baseURL}/discover`);
  await expect.poll(() => Boolean(delayed.state.release)).toBe(true);
  await delayed.page.getByRole("tab", { name: "Profile", exact: true }).click();
  delayed.state.release();
  await expect(
    delayed.page.getByLabel("What should we call you?", { exact: true }),
  ).toBeVisible();
  delayed.state.rows = [];
  await delayed.page
    .getByRole("tab", { name: "Discover", exact: true })
    .click();
  await expect(
    delayed.page.getByText(
      "No activities are available yet. Check again soon.",
    ),
  ).toBeVisible();
  await expect(
    delayed.page.getByRole("button", { name: "Published coffee", exact: true }),
  ).toHaveCount(0);
  await delayed.close();
  const preview = await fixture(390, true);
  await preview.page.goto(baseURL);
  await preview.page.getByText("Preview the design", { exact: true }).click();
  await expect(
    preview.page.getByText("11 ideas", { exact: true }),
  ).toBeVisible();
  await preview.page
    .getByRole("button", { name: "Explore coffee together", exact: true })
    .click();
  await expect(
    preview.page.getByText(
      "Activity content approved for the owner-only beta.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    preview.page.getByRole("button", {
      name: "Let’s make a plan",
      exact: true,
    }),
  ).toBeVisible();
  await preview.page
    .getByRole("button", { name: "Discover", exact: true })
    .click();
  for (const item of additions) {
    await preview.page
      .getByLabel("Search activities", { exact: true })
      .fill(item.title);
    await expect(
      preview.page.getByText("1 ideas", { exact: true }),
    ).toBeVisible();
    await preview.page
      .getByRole("button", { name: item.title, exact: true })
      .click();
    await expect(
      preview.page.getByRole("heading", { name: item.title, exact: true }),
    ).toBeVisible();
    await expect(
      preview.page.getByText(item.description, { exact: true }),
    ).toBeVisible();
    for (const tip of item.tips)
      await expect(preview.page.getByText(tip, { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        preview.page
          .getByRole("img", { name: item.title, exact: true })
          .evaluate((image) => image.complete && image.naturalWidth === 1536),
      )
      .toBe(true);
    await preview.page
      .getByRole("button", { name: "Let’s make a plan", exact: true })
      .click();
    await preview.page
      .getByLabel("Meeting place", { exact: true })
      .fill(`Fixture place for ${item.title}`);
    await preview.page
      .getByRole("button", { name: "Save preview plan", exact: true })
      .click();
    await expect(
      preview.page.getByRole("heading", { name: item.title, exact: true }),
    ).toBeVisible();
    await expect(
      preview.page.getByText(`Fixture place for ${item.title}`, {
        exact: true,
      }),
    ).toBeVisible();
    await preview.page
      .getByRole("button", { name: "Edit plan", exact: true })
      .first()
      .click();
    await expect(
      preview.page.getByRole("heading", { name: item.title, exact: true }),
    ).toBeVisible();
    await expect(
      preview.page.getByLabel("Meeting place", { exact: true }),
    ).toHaveValue(`Fixture place for ${item.title}`);
    await preview.page
      .getByRole("button", { name: "My resbites", exact: true })
      .click();
    await preview.page
      .getByRole("tab", { name: "Discover", exact: true })
      .click();
  }
  await preview.page.getByLabel("Search activities", { exact: true }).fill("");
  await expect(
    preview.page.getByText("11 ideas", { exact: true }),
  ).toBeVisible();
  await preview.close();
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: published-only live catalogue, empty/offline/retry, server detail/new plan, unpublish/deep-link gates and focus cancellation at 320/390; network-free Preview includes 11 ideas with all 3 additions searchable, illustrated and preserved in saved plans/editing.",
  );
} finally {
  await browser.close();
}
