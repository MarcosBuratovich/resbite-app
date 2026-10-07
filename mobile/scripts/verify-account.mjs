import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
await mkdir("/private/tmp/resbite-account", { recursive: true });
async function fixture(
  width,
  access = "approved",
  metadata = { full_name: "Google Fixture" },
) {
  let user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.invalid",
    app_metadata: {},
    user_metadata: metadata,
    created_at: "2026-01-01T00:00:00Z",
    email_confirmed_at: "2026-01-01T00:00:00Z",
  };
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: user.id, exp: expires_at, role: "authenticated" }),
    ).toString("base64url"),
    "fixture-only",
  ].join(".");
  const page = await browser.newPage({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [],
    requests = [],
    writes = [];
  let profile = null,
    failAccess = false,
    loseReply = false,
    claims = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
      errors.push(m.text());
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(
    (session) => {
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem("fixture-seeded", "1");
      }
    },
    {
      user,
      access_token: token,
      refresh_token: "fixture",
      token_type: "bearer",
      expires_at,
      expires_in: 3600,
    },
  );
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    requests.push(path);
    const reply = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status")
      return reply(
        failAccess
          ? { message: "Offline" }
          : { account_id: user.id, status: access },
        failAccess ? 503 : 200,
      );
    if (path === "/rest/v1/profiles") return reply(profile);
    if (path === "/rest/v1/rpc/save_registration_details") {
      const { p_expected, p_details } = req.postDataJSON();
      writes.push(p_details);
      assert.deepEqual(
        p_expected,
        user.user_metadata.registration_details ?? null,
      );
      user = {
        ...user,
        user_metadata: {
          ...user.user_metadata,
          registration_details: p_details,
          registration_details_version: 1,
        },
      };
      if (loseReply) {
        loseReply = false;
        return route.abort("failed");
      }
      return reply({ account_id: user.id, registration_details: p_details });
    }
    if (path === "/rest/v1/rpc/save_profile") {
      profile = { display_name: req.postDataJSON().p_name, avatar_path: null };
      return reply(user.id);
    }
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/rpc/claim_invite") {
      claims++;
      return reply("22222222-2222-4222-8222-222222222222");
    }
    if (path === "/rest/v1/plans")
      return reply({
        id: "22222222-2222-4222-8222-222222222222",
        activity_id: "coffee-together",
        owner_id: "other",
        starts_at: "2099-03-01T15:00:00Z",
        status: "active",
        place_label: "Fixture café",
        version: 1,
      });
    if (path === "/rest/v1/attendees")
      return reply({ version: 1, response: "pending" });
    throw Error(`Unexpected fixture request ${path}`);
  });
  return {
    page,
    errors,
    requests,
    writes,
    user: () => user,
    claims: () => claims,
    access: (next) => (access = next),
    failAccess: (next) => (failAccess = next),
    loseReply: () => (loseReply = true),
    profileReady: () =>
      (profile = { display_name: "Fixture", avatar_path: null }),
  };
}
try {
  for (const width of [320, 390]) {
    const f = await fixture(width),
      { page } = f;
    await page.goto(`${base}/account`);
    await expect(
      page.getByText("Make yourself at home", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Date of birth (optional)", { exact: true })
      .fill("2000-02-29");
    await page
      .getByLabel("Phone number (optional)", { exact: true })
      .fill("+44 7700 900123");
    await page.getByLabel("City (optional)", { exact: true }).fill("London");
    await page.getByText("Outdoors", { exact: true }).click();
    await page.screenshot({
      path: `/private/tmp/resbite-account/details-${width}.png`,
      fullPage: true,
    });
    f.loseReply();
    await page
      .getByRole("button", { name: "Save and continue", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save profile", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("What should we call you?", { exact: true }),
    ).toHaveValue("Google Fixture");
    assert.equal(f.writes.length, 1);
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page.getByText("Account details", { exact: true }).click();
    await expect(
      page.getByLabel("City (optional)", { exact: true }),
    ).toHaveValue("London");
    await page
      .getByRole("button", { name: "Clear optional details", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save account details", exact: true })
      .click();
    await expect(
      page.getByText("Account details saved.", { exact: true }),
    ).toBeVisible();
    assert.deepEqual(f.writes[1], {
      birth_date: null,
      phone: null,
      city: null,
      interests: [],
    });
    await page.reload();
    await expect(
      page.getByText("Account details", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("City (optional)", { exact: true }),
    ).toHaveValue("");
    assert.equal(f.user().user_metadata.full_name, "Google Fixture");
    assert.deepEqual(f.errors, []);
    await page.close();
  }
  const f = await fixture(320, "access_pending"),
    { page } = f;
  f.profileReady();
  const invitation = "a".repeat(64);
  await page.goto(`${base}/invite?token=${invitation}`);
  await expect(
    page.getByText("You’re on your way", { exact: true }),
  ).toBeVisible();
  assert.equal(f.claims(), 0);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
    invitation,
  );
  await page.screenshot({
    path: "/private/tmp/resbite-account/access-pending.png",
    fullPage: true,
  });
  f.failAccess(true);
  await page
    .getByRole("button", { name: "Check account access", exact: true })
    .click();
  await expect(
    page.getByText("Let’s try again", { exact: true }),
  ).toBeVisible();
  assert.equal(f.claims(), 0);
  f.failAccess(false);
  f.access("approved");
  await page
    .getByRole("button", { name: "Check account access", exact: true })
    .click();
  await expect(
    page.getByText("Make yourself at home", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByText("Fixture café", { exact: true })).toBeVisible();
  assert.equal(f.claims(), 1);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
    null,
  );
  assert.deepEqual(f.errors, []);
  await page.close();
  const restored = await fixture(320, "approved", {
    registration_details_version: 1,
  });
  restored.profileReady();
  await restored.page.addInitScript(() => {
    sessionStorage.setItem("resbite.pending-invite", "b".repeat(64));
    window.inviteReadFails = true;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "resbite.pending-invite" && window.inviteReadFails)
        throw Error("Fixture storage unavailable");
      return original.call(this, key);
    };
  });
  await restored.page.goto(`${base}/account`);
  await expect(
    restored.page.getByText("Restoring your invitation", { exact: true }),
  ).toBeVisible();
  await expect(
    restored.page.getByRole("button", {
      name: "Try restoring again",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(restored.claims(), 0);
  await restored.page.evaluate(() => {
    window.inviteReadFails = false;
  });
  await restored.page
    .getByRole("button", { name: "Try restoring again", exact: true })
    .click();
  await expect(
    restored.page.getByText("Fixture café", { exact: true }),
  ).toBeVisible();
  assert.equal(restored.claims(), 1);
  assert.deepEqual(restored.errors, []);
  await restored.page.close();
  console.log(
    "Account onboarding/edit/removal/lost-reply checks passed at 320/390px; pending access, retry, skip and invitation preservation passed. All backend requests intercepted.",
  );
} finally {
  await browser.close();
}
