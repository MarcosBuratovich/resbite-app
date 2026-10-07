import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const pendingKey = "resbite.pending-auth-email.v1";
await mkdir("/private/tmp/resbite-confirmation", { recursive: true });
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [], requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/Failed to load resource: the server responded with a status of (400|429)/.test(message.text()))
        errors.push(message.text());
    });
    let resendStatus = 200;
    await page.route("**/*.supabase.co/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push({ path, body: route.request().postDataJSON() });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: path === "/auth/v1/resend" ? resendStatus : path === "/auth/v1/token" ? 400 : 200,
        contentType: "application/json",
        body: JSON.stringify(path === "/auth/v1/resend" && resendStatus === 429
          ? { code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 120 seconds." }
          : path === "/auth/v1/token" ? { code: "flow_state_expired", message: "Invalid flow state" } : {}),
      });
    });
    await page.goto(`${base}/auth?mode=register`);
    await page.locator("input").nth(0).fill("Confirmation Fixture");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("input").nth(0).fill("confirmation@example.invalid");
    await page.locator("input").nth(1).fill("fixture-password");
    await page.getByRole("button", { name: "Create account", exact: true }).dblclick();
    await expect(page.getByText("Check your inbox.", { exact: true })).toBeVisible();
    await expect(page.getByText(/If this address needs confirmation/)).toBeVisible();
    assert.equal(requests.filter((r) => r.path === "/auth/v1/signup").length, 1);
    await expect(page.getByRole("button", { name: "Resend confirmation email", exact: true })).toBeDisabled();
    await page.goto(`${base}/auth`);
    await expect(page.getByText("confirmation@example.invalid", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend confirmation email", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "I’ve confirmed my email", exact: true }).click();
    await expect(page.getByText(/If you have confirmed your email, sign in below/)).toBeVisible();
    assert.equal(requests.filter((r) => r.path === "/auth/v1/user").length, 0);
    // Move only this intercepted fixture's persisted retry deadline into the past.
    await page.evaluate((key) => {
      const pending = JSON.parse(sessionStorage.getItem(key));
      pending.requestedAt = Date.now() - 61_000;
      pending.retryAt = Date.now() - 1000;
      sessionStorage.setItem(key, JSON.stringify(pending));
    }, pendingKey);
    await page.reload();
    await expect(page.getByRole("button", { name: "Resend confirmation email", exact: true })).toBeEnabled();
    resendStatus = 429;
    await page.getByRole("button", { name: "Resend confirmation email", exact: true }).dblclick();
    await expect(page.getByText(/Email requests are temporarily limited/)).toBeVisible();
    assert.equal(requests.filter((r) => r.path === "/auth/v1/resend").length, 1);
    const remaining = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)).retryAt - Date.now(), pendingKey);
    assert.ok(remaining > 115_000 && remaining <= 120_000);
    await page.reload();
    await expect(page.getByRole("button", { name: "Resend confirmation email", exact: true })).toBeDisabled();
    await page.screenshot({ path: `/private/tmp/resbite-confirmation/confirmation-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Use a different email", exact: true }).click();
    await expect(page.getByText("Confirm your email.", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), pendingKey), null);
    await page.locator("input").fill("replacement@example.invalid");
    resendStatus = 200;
    await page.getByRole("button", { name: "Resend confirmation email", exact: true }).click();
    await expect(page.getByText("replacement@example.invalid", { exact: true })).toBeVisible();
    const resend = requests.filter((r) => r.path === "/auth/v1/resend").at(-1);
    assert.equal(resend.body.type, "signup");
    assert.equal(resend.body.email, "replacement@example.invalid");
    assert.equal(typeof resend.body.code_challenge, "string");
    assert.ok(resend.body.code_challenge.length > 20);
    // Clear verifier to simulate opening on a different/reinstalled device.
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) if (key.includes("code-verifier") || key.includes("pkce")) sessionStorage.removeItem(key);
    });
    await page.goto(`${base}/auth/callback?code=fixture-no-verifier`);
    await expect(page.getByText(/This link needs the device where you requested it/)).toBeVisible();
    await page.getByRole("button", { name: "Request confirmation email", exact: true }).click();
    await expect(page.getByText("replacement@example.invalid", { exact: true })).toBeVisible();
    await page.goto(`${base}/auth/callback?code=one&code=two&recovery=1`);
    await expect(page.getByText("This password reset link is incomplete or invalid. Please request a new one.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Request a new reset link", exact: true }).click();
    await expect(page.getByText("Let’s get you back in.", { exact: true })).toBeVisible();
    await page.locator("input").fill("reset@example.invalid");
    await page.getByRole("button", { name: "Send reset link", exact: true }).dblclick();
    await expect(page.getByText(/If this address has an account that can use a password/)).toBeVisible();
    assert.equal(requests.filter((r) => r.path === "/auth/v1/recover").length, 1);
    await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeDisabled();
    await page.goto(`${base}/auth`);
    await expect(page.getByText("Let’s get you back in.", { exact: true })).toBeVisible();
    await expect(page.locator("input")).toHaveValue("reset@example.invalid");
    await page.goto(`${base}/auth/callback?code=fixture-expired-reset&recovery=1`);
    await expect(page.getByText(/We couldn’t open this password reset link/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Request a new reset link", exact: true })).toBeVisible();
    assert.equal(requests.filter((r) => r.path === "/auth/v1/token").length, 1);
    // Provider-side expiry/reuse redirects contain no exchangeable code. They
    // must show a usable recovery screen without issuing a token request.
    for (const recovery of [false, true]) {
      const before = requests.filter((r) => r.path === "/auth/v1/token").length;
      await page.goto(`${base}/auth/callback?error_code=otp_expired${recovery ? "&recovery=1" : ""}`);
      await expect(page.getByText(recovery
        ? /We couldn’t open this password reset link/
        : /We couldn’t confirm this link/)).toBeVisible();
      await expect(page.getByRole("button", { name: recovery ? "Request a new reset link" : "Request confirmation email", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
      await expect(page.getByText("Welcome back.", { exact: true })).toBeVisible();
      assert.equal(requests.filter((r) => r.path === "/auth/v1/token").length, before);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Confirmation fixtures passed at 320/390: restart, neutral responses, duplicate prevention, persisted/server cooldown, PKCE resend, wrong-device guidance, reset destination and privacy cleanup. All backend requests intercepted; no email sent.");
} finally { await browser.close(); }
