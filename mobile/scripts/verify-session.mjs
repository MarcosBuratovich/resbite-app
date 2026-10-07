import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};
const expires_at = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({ sub: user.id, exp: expires_at, role: "authenticated" }),
  ).toString("base64url"),
  "local-fixture-only",
].join(".");
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ user, token, expires_at }) => {
      sessionStorage.setItem(
        "sb-ewcsgvhuojxdpaspwsrx-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture",
          token_type: "bearer",
          expires_at,
          expires_in: 3600,
          user,
        }),
      );
      sessionStorage.setItem(
        `resbite.people.v1.${user.id}`,
        JSON.stringify({ groups: [], plans: {}, invitations: [] }),
      );
      sessionStorage.setItem("resbite.pending-invite", "a".repeat(64));
      sessionStorage.setItem(
        `resbite.drafts.v1.${user.id}`,
        "retained-fixture",
      );
    },
    { user, token, expires_at },
  );
  let attempts = 0;
  await page.route("**/*.supabase.co/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: "Fixture", photo_path: null });
    if (path === "/auth/v1/logout") {
      attempts++;
      return attempts === 1
        ? reply({ message: "Sign-out unavailable fixture" }, 422)
        : reply({});
    }
    return reply({ message: "Unexpected fixture endpoint" }, 400);
  });
  await page.goto(`${base}/profile`);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText(
      "You are signed out on this device, but server sign-out could not be confirmed. Other sessions may still be active. Sign in again to manage your account.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(attempts, 1);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
    null,
  );
  assert.equal(
    await page.evaluate(
      (id) => sessionStorage.getItem(`resbite.people.v1.${id}`),
      user.id,
    ),
    null,
  );
  assert.equal(
    await page.evaluate(
      (id) => sessionStorage.getItem(`resbite.drafts.v1.${id}`),
      user.id,
    ),
    "retained-fixture",
  );
  await expect(
    page.getByText("Preview the design", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss sign-out notice", exact: true }).click();
  // A fresh fixture session verifies successful cleanup independently of the failed remote logout.
  await page.goto(`${base}/profile`);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("Preview the design", { exact: true }),
  ).toBeVisible();
  assert.equal(attempts, 2);
  assert.deepEqual(errors, []);
  console.log(
    "Session fixture passed: remote sign-out failure remains visible after local session removal, independent success works, local groups/invite cleared and account drafts retained; no live auth requests.",
  );
} finally {
  await browser.close();
}
