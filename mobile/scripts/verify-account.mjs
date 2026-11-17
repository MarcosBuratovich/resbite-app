import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { AUTH_STORAGE_KEY, noChat } from "./qa-helpers.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const shots = join(tmpdir(), "resbite-account");
await mkdir(shots, { recursive: true });
async function fixture(
  width,
  access = "approved",
  metadata = { full_name: "Google Fixture" },
) {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.invalid",
    app_metadata: {},
    user_metadata: metadata,
    created_at: "2026-01-01T00:00:00Z",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    // A confirmed phone keeps these accounts past Add your number (verify-phone covers the gate).
    phone: "447700900834",
    phone_confirmed_at: "2026-01-01T00:00:00Z",
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
    requests = [];
  let profile = null,
    failAccess = false,
    claims = 0,
    // Plan 4: the account has yet to accept the published Terms version (2026-12).
    termsNeeded = false;
  const accepts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
      errors.push(m.text());
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(
    ({ key, session }) => {
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem("fixture-seeded", "1");
      }
    },
    {
      key: AUTH_STORAGE_KEY,
      session: {
        user,
        access_token: token,
        refresh_token: "fixture",
        token_type: "bearer",
        expires_at,
        expires_in: 3600,
      },
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
    if (path === "/rest/v1/rpc/note_app_session")
      return route.fulfill({ status: 204, body: "" });
    if (path === "/rest/v1/rpc/account_access_status")
      return reply(
        failAccess
          ? { message: "Offline" }
          : { account_id: user.id, status: access, terms_version: "2026-12", terms_needed: termsNeeded },
        failAccess ? 503 : 200,
      );
    if (path === "/rest/v1/profiles") return reply(profile);
    if (path === "/rest/v1/rpc/accept_terms") {
      const body = req.postDataJSON();
      accepts.push({ body, claimsBefore: claims });
      if (body.p_terms_version !== "2026-12")
        return reply({ code: "22023", message: "Terms changed" }, 400);
      termsNeeded = false;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/rest/v1/rpc/save_profile") {
      profile = { display_name: req.postDataJSON().p_name, avatar_path: null };
      return reply(user.id);
    }
    if (path === "/rest/v1/activities") return reply([]);
    // Waiting for access lists the account's open-link requests: none here.
    if (path === "/rest/v1/rpc/my_join_requests") return reply([]);
    // Profile reads the Connections row's count of requests: nobody here.
    if (path === "/rest/v1/rpc/my_connections") return reply({ requests: [], connected: [] });
    if (path === "/rest/v1/rpc/claim_invite") {
      claims++;
      return reply("22222222-2222-4222-8222-222222222222");
    }
    if (path === "/rest/v1/plans")
      return reply({
        id: "22222222-2222-4222-8222-222222222222",
        activity_id: "coffee-together",
        title: "Coffee evening",
        description: "Bring a book",
        categories: ["community", "uplifting"],
        owner_id: "other",
        starts_at: "2099-03-01T15:00:00Z",
        status: "active",
        place_label: "Fixture café",
        version: 1,
      });
    if (path === "/rest/v1/attendees")
      return reply({ version: 1, response: "pending" });
    if (path === "/rest/v1/plan_mutes") return reply([]);
    // The resbite page's counts for an invitee who hasn't answered: only them, pending, so none.
    if (path === "/rest/v1/rpc/plan_people_counts") return reply({ going: 0, maybe: 0, cant_go: 0 });
    // Task 8's chat reads: no Chat row, nothing unread (verify-event and review-ui cover them).
    if (noChat(path) !== undefined) return reply(noChat(path));
    throw Error(`Unexpected fixture request ${path}`);
  });
  return {
    page,
    errors,
    requests,
    claims: () => claims,
    accepts: () => accepts,
    termsNeeded: (next) => (termsNeeded = next),
    access: (next) => (access = next),
    failAccess: (next) => (failAccess = next),
    profileReady: () =>
      (profile = { display_name: "Fixture", avatar_path: null }),
  };
}
try {
  for (const width of [320, 390]) {
    const f = await fixture(width),
      { page } = f;
    // No details step on the way in any more (CI-P11): an approved account without a profile goes to Profile,
    // its name taken from the account.
    await page.goto(`${base}/account`);
    await expect(
      page.getByRole("heading", { name: "Profile", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("What should we call you?", { exact: true }),
    ).toHaveValue("Google Fixture");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Your profile is saved.", { exact: true }),
    ).toBeVisible();
    // Plan 4 (D-9): the optional details are gone. The rows are drawn (Notifications), but no Account details row,
    // and nothing ever asks for the dropped write.
    await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Account details", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `${shots}/profile-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      f.requests.includes("/rest/v1/rpc/save_registration_details"),
      false,
    );
    assert.deepEqual(f.errors, []);
    await page.close();
  }
  const f = await fixture(320, "access_pending"),
    { page } = f;
  f.profileReady();
  const invitation = "a".repeat(64);
  await page.goto(`${base}/invite?token=${invitation}`);
  await expect(
    page.getByRole("heading", { name: "Waiting for access", exact: true }),
  ).toBeVisible();
  assert.equal(f.claims(), 0);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
    invitation,
  );
  await page.screenshot({
    path: `${shots}/access-pending.png`,
    fullPage: true,
  });
  f.failAccess(true);
  await page
    .getByRole("button", { name: "Check again", exact: true })
    .click();
  await expect(
    page.getByText("Let’s try again", { exact: true }),
  ).toBeVisible();
  assert.equal(f.claims(), 0);
  f.failAccess(false);
  f.access("approved");
  // Approved with a phone and a profile: straight on to the kept invitation, with no details step between.
  await page
    .getByRole("button", { name: "Check again", exact: true })
    .click();
  // The claim lands on the invitation (GI1: not answered yet, so the exact place waits for a reply).
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  await expect(page.getByText("Exact address after you reply", { exact: true })).toBeVisible();
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
    restored.page.getByRole("heading", { name: "Coffee evening", exact: true }),
  ).toBeVisible();
  assert.equal(restored.claims(), 1);
  assert.deepEqual(restored.errors, []);
  await restored.page.close();
  // Plan 4, Review Focus 5: a kept invitation on an approved account with a profile that has yet to accept the
  // Terms. The accept screen comes first and nothing is claimed before Continue; then the invitation opens.
  for (const width of [320, 390]) {
    const kept = await fixture(width);
    kept.profileReady();
    kept.termsNeeded(true);
    await kept.page.addInitScript((token) => {
      if (!sessionStorage.getItem("fixture-invite-seeded")) {
        sessionStorage.setItem("resbite.pending-invite", token);
        sessionStorage.setItem("fixture-invite-seeded", "1");
      }
    }, "c".repeat(64));
    await kept.page.goto(`${base}/account`);
    await expect(
      kept.page.getByRole("heading", { name: "Please accept our Terms", exact: true }),
    ).toBeVisible();
    await expect(kept.page).toHaveURL(/\/accept-terms$/);
    await kept.page.waitForTimeout(500);
    assert.equal(kept.claims(), 0, "nothing is claimed before the Terms are accepted");
    assert.equal(
      await kept.page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
      "c".repeat(64),
      "the invitation is kept on the accept screen",
    );
    await kept.page
      .getByRole("checkbox", { name: "I’m 18 or over and I accept the Terms of Use.", exact: true })
      .click();
    await kept.page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      kept.page.getByRole("heading", { name: "Coffee evening", exact: true }),
    ).toBeVisible();
    assert.deepEqual(kept.accepts(), [{ body: { p_terms_version: "2026-12" }, claimsBefore: 0 }]);
    assert.equal(kept.claims(), 1);
    assert.equal(
      await kept.page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
      null,
    );
    assert.deepEqual(kept.errors, []);
    await kept.page.close();
  }
  console.log(
    "Account checks passed at 320/390px: Profile first with the account's name and no details step, no Account details row and no details write; pending access, retry and invitation preservation through approval; a kept invitation waits behind Accept your Terms and opens after Continue. All backend requests intercepted.",
  );
} finally {
  await browser.close();
}
