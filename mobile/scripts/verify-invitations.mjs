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
const plan = {
  id: "22222222-2222-4222-8222-222222222222",
  activity_id: "coffee-together",
  owner_id: user.id,
  starts_at: "2099-03-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Fixture café",
  note: "",
  status: "active",
  version: 1,
};
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ session, plan }) => {
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem(
          `resbite.people.v1.${session.user.id}`,
          JSON.stringify({
            groups: [],
            plans: {
              [plan.id]: [
                {
                  key: "email:alex@example.invalid",
                  name: "Alex",
                  address: "alex@example.invalid",
                  kind: "email",
                },
              ],
            },
          }),
        );
        sessionStorage.setItem("fixture-seeded", "1");
      }
      window.fixtureShares = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (payload) => {
          window.fixtureShares.push(payload);
        },
      });
    },
    { session, plan },
  );
  const creates = [],
    revokes = [];
  let holdCreate = false;
  let releaseCreate;
  let failCreate = true,
    failRevoke = true;
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status")
      return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: "Fixture", avatar_path: null });
    if (path === "/rest/v1/plans")
      return reply(req.headers().accept?.includes("object") ? plan : [plan]);
    if (path === "/rest/v1/attendees") return reply([]);
    if (path === "/rest/v1/rpc/create_invite") {
      const payload = req.postDataJSON();
      creates.push(payload);
      if (holdCreate) {
        holdCreate = false;
        await new Promise((resolve) => {
          releaseCreate = resolve;
        });
      }
      assert.deepEqual(Object.keys(payload).sort(), [
        "p_id",
        "p_plan",
        "p_token",
      ]);
      const journal = await page.evaluate(
        (id) => JSON.parse(sessionStorage.getItem(`resbite.people.v1.${id}`)),
        user.id,
      );
      assert.ok(
        journal.invitations.some(
          (i) => i.id === payload.p_id && i.token === payload.p_token,
        ),
      );
      if (failCreate) {
        failCreate = false;
        return reply({ message: "Lost reply" }, 503);
      }
      return reply(payload.p_id);
    }
    if (path === "/rest/v1/rpc/revoke_invite") {
      revokes.push(req.postDataJSON());
      if (failRevoke) {
        failRevoke = false;
        return reply({ message: "Lost revocation reply" }, 503);
      }
      return reply(null);
    }
    return reply({ message: "Unmocked fixture endpoint" }, 400);
  });
  await page.goto(`${base}/invitations?plan=${plan.id}`);
  await page
    .getByRole("button", { name: "Prepare link for Alex", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry link for Alex", exact: true }),
  ).toBeVisible();
  assert.equal(await page.evaluate(() => window.fixtureShares.length), 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Retry link for Alex", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Share link for Alex", exact: true }),
  ).toBeVisible();
  assert.deepEqual(creates[0], creates[1]);
  assert.equal(await page.evaluate(() => window.fixtureShares.length), 0);
  await page
    .getByRole("button", { name: "Share link for Alex", exact: true })
    .click();
  await expect(
    page.getByText(
      "Share sheet completed. Delivery and RSVP are not confirmed.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(
    (await page.evaluate(() => window.fixtureShares))[0].text,
    `Join my Resbite plan: resbite://invite?token=${creates[0].p_token}`,
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Revoke link for Alex", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retry revocation for Alex",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Share link for Alex", exact: true }),
  ).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Retry revocation for Alex", exact: true })
    .click();
  await expect(page.getByText("Link revoked.", { exact: true })).toBeVisible();
  assert.deepEqual(revokes[0], revokes[1]);
  await page
    .getByRole("button", { name: "Prepare link for Alex", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Share link for Alex", exact: true }),
  ).toBeVisible();
  assert.notEqual(creates.at(-1).p_id, creates[0].p_id);
  await page
    .getByRole("button", { name: "Prepare a separate link", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Share link for Invitation 1",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(creates.at(-1).p_token.length, 64);
  // Returning from selection must re-read local people instead of retaining stale cards.
  await page
    .getByRole("button", { name: "Choose people", exact: true })
    .click();
  await page.getByLabel("Person’s name", { exact: true }).fill("Bea");
  await page
    .getByLabel("Email or phone", { exact: true })
    .fill("bea@example.invalid");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page.getByRole("button", { name: "Save people", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Prepare link for Bea", exact: true }),
  ).toBeVisible();
  const shareCount = await page.evaluate(() => window.fixtureShares.length);
  holdCreate = true;
  await page
    .getByRole("button", { name: "Share link for Invitation 1", exact: true })
    .click();
  await expect.poll(() => typeof releaseCreate).toBe("function");
  await page.getByRole("button", { name: "My resbites", exact: true }).click();
  releaseCreate();
  await expect(
    page.getByRole("heading", { name: "A little invitation.", exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => window.fixtureShares.length),
    shareCount,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: journal before RPC, restart retry identity, explicit mocked Share, revocation recovery, separate links, focus refresh. All Supabase traffic intercepted; no messages sent.",
  );
} finally {
  await browser.close();
}
