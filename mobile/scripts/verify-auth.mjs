import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 400/.test(message.text()))
      errors.push(message.text());
  });
  const requests = [];
  await page.route("**/*.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      status: path === "/auth/v1/token" ? 400 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        path === "/auth/v1/token"
          ? {
              code: "invalid_credentials",
              message: "Invalid login credentials",
            }
          : {},
      ),
    });
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "Let’s get together", exact: true })
    .click();
  await expect(
    page.getByText("Introduction 1 of 3", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Already have an account? Sign in",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Enter a valid email address.", { exact: true }),
  ).toBeVisible();
  assert.equal(requests.length, 0);
  const inputs = page.locator("input");
  await inputs.nth(0).fill("fixture@example.invalid");
  await inputs.nth(1).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).dblclick();
  await expect(
    page.getByText("Invalid login credentials", { exact: true }),
  ).toBeVisible();
  assert.equal(requests.filter((x) => x === "/auth/v1/token").length, 1);
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByText(
      "If this address has an account that can use a password, check its inbox and spam folder for a reset email.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(requests.filter((x) => x === "/auth/v1/recover").length, 1);
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(page.getByText("Welcome back.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "New to Resbite? Create an account",
      exact: true,
    })
    .click();
  await page.locator("input").nth(0).fill("Fixture");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("input").nth(0).fill("signup-fixture@example.invalid");
  await page.locator("input").nth(1).fill("fixture-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText(
      "If this address needs confirmation, check its inbox and spam folder for a Resbite email. If you already have an account, sign in or reset your password.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(requests.filter((x) => x === "/auth/v1/signup").length, 1);
  await page
    .getByRole("button", {
      name: "Already have an account? Sign in",
      exact: true,
    })
    .click();
  await page.locator("input").nth(1).fill("fixture-password");
  // Leave while a login response is in flight; its error must not change the previous page.
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByText("Preview the design", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(600);
  await expect(
    page.getByText("Invalid login credentials", { exact: true }),
  ).toHaveCount(0);
  await page.goto(`${base}/auth/callback?code=one&code=two`);
  await expect(
    page.getByText(
      "This confirmation link is incomplete or invalid. Please request a new one.",
      { exact: true },
    ),
  ).toBeVisible();
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
  let updates = 0;
  await page.unroute("**/*.supabase.co/**");
  await page.route("**/*.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === "/auth/v1/token")
      body = {
        access_token: "fixture-token",
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      };
    else if (path === "/auth/v1/user") {
      body = user;
      if (route.request().method() === "PUT") {
        updates++;
        await new Promise((r) => setTimeout(r, 300));
      }
    } else if (path === "/rest/v1/profiles")
      body = { id: user.id, display_name: "Fixture", photo_path: null };
    else if (path === "/rest/v1/rpc/account_access_status")
      body = { account_id: user.id, status: "approved" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.evaluate(() =>
    sessionStorage.setItem(
      "sb-ewcsgvhuojxdpaspwsrx-auth-token-code-verifier",
      JSON.stringify("fixture-verifier/recovery"),
    ),
  );
  await page.goto(`${base}/auth/callback?code=fixture-code&recovery=1`);
  await expect(
    page.getByText("Choose a new password.", { exact: true }),
  ).toBeVisible();
  await page.locator("input").fill("new-fixture-password");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .dblclick();
  await expect(page).toHaveURL(/\/discover$/);
  assert.equal(updates, 1);
  assert.deepEqual(errors, []);
  console.log(
    "Auth fixtures passed: registration, validation, single-flight login, stale response, reset return, malformed callback and recovery password save; all backend requests intercepted.",
  );
} finally {
  await browser.close();
}
