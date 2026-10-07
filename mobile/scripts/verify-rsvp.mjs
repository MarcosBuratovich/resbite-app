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
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
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
    (session) =>
      sessionStorage.setItem(
        "sb-ewcsgvhuojxdpaspwsrx-auth-token",
        JSON.stringify(session),
      ),
    session,
  );
  let attendee = { version: 1, response: "pending" },
    writes = 0,
    claims = 0,
    lost = true,
    conflict = false,
    failWithoutCommit = false;
  const fixturePlan = {
    ...plan,
    owner_id: "33333333-3333-4333-8333-333333333333",
  };
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
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: "Fixture" });
    if (path === "/rest/v1/plans")
      return reply(
        req.headers().accept?.includes("object") ? fixturePlan : [fixturePlan],
      );
    if (path === "/rest/v1/attendees")
      return reply(
        req.headers().accept?.includes("object")
          ? attendee
          : [{ ...attendee, plan_id: plan.id, user_id: user.id }],
      );
    if (path === "/rest/v1/rpc/claim_invite") {
      claims++;
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("resbite.pending-invite"),
        ),
        "a".repeat(64),
      );
      return reply(plan.id);
    }
    if (path === "/rest/v1/rpc/respond") {
      writes++;
      if (failWithoutCommit) {
        failWithoutCommit = false;
        return reply({ message: "Offline" }, 503);
      }
      const body = req.postDataJSON();
      assert.equal(body.p_version, attendee.version);
      attendee = {
        version: attendee.version + 1,
        response: conflict ? "declined" : body.p_response,
      };
      if (lost) {
        lost = false;
        return reply({ message: "Lost response" }, 503);
      }
      return reply(attendee.version);
    }
    return reply({ message: "Unexpected intercepted endpoint" }, 400);
  });
  await page.goto(`${base}/sample-chat?plan=${plan.id}`);
  await expect(
    page.getByText(
      "The sample is available after an accepted RSVP for a future, active plan.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Sam · fictional", { exact: true })).toHaveCount(
    0,
  );
  await page.goto(`${base}/invite?plan=${plan.id}`);
  await page
    .getByRole("button", { name: "I’ll be there", exact: true })
    .click();
  await expect(
    page.getByText("Your response is saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(writes, 1);
  await page
    .getByRole("button", { name: "View sample conversation", exact: true })
    .click();
  await expect(
    page.getByText("Sam · fictional", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  attendee = { version: 3, response: "withdrawn" };
  await page.reload();
  await expect(
    page.getByText(
      "The sample is available after an accepted RSVP for a future, active plan.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Sam · fictional", { exact: true })).toHaveCount(
    0,
  );
  await page.goto(`${base}/invite?plan=${plan.id}`);
  conflict = true;
  await page
    .getByRole("button", { name: "I’ll be there", exact: true })
    .click();
  await expect(
    page.getByText(
      "The plan or your response changed. Review the latest details before choosing again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Your response: declined", { exact: true }),
  ).toBeVisible();
  // The invitation shows the plan's own text, not the bundled idea title.
  await expect(page.getByText("Coffee evening", { exact: true })).toBeVisible();
  await expect(page.getByText("Bring a book", { exact: true })).toBeVisible();
  conflict = false;
  failWithoutCommit = true;
  await page
    .getByRole("button", { name: "I’ll be there", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry my response", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Can’t make it", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry my response", exact: true })
    .click();
  await expect(
    page.getByText("Your response is saved.", { exact: true }),
  ).toBeVisible();
  fixturePlan.status = "cancelled";
  await page
    .getByRole("button", { name: "Refresh invitation", exact: true })
    .click();
  await expect(
    page.getByText(
      "This plan is cancelled or has already started. Responses are closed.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "I’ll be there", exact: true }),
  ).toHaveCount(0);
  fixturePlan.status = "active";
  await page.goto(`${base}/invite?token=${"a".repeat(64)}`);
  await expect(
    page.getByRole("button", { name: "View sample conversation", exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
    null,
  );
  const claimsBeforeMalformed = claims;
  await page.evaluate(() =>
    sessionStorage.setItem("resbite.pending-invite", "b".repeat(64)),
  );
  await page.goto(`${base}/invite?token=malformed`);
  await expect(
    page.getByText("This invitation link is incomplete.", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.pending-invite")),
    "b".repeat(64),
  );
  assert.equal(claims, claimsBeforeMalformed);
  assert.equal(writes, 4);
  const previewPage = await browser.newPage({
    viewport: { width: 390, height: 640 },
  });
  previewPage.on("pageerror", (e) => errors.push(e.message));
  const previewRequests = [];
  await previewPage.route("**/*.supabase.co/**", (route) => {
    previewRequests.push(
      route.request().method() + " " + new URL(route.request().url()).pathname,
    );
    return route.abort();
  });
  await previewPage.goto(base);
  await previewPage.getByText("Preview the design", { exact: true }).click();
  await previewPage.getByRole("tab", { name: "Profile", exact: true }).click();
  await previewPage
    .getByRole("button", { name: "Explore sample conversation", exact: true })
    .click();
  await expect(
    previewPage.getByText("Sam · fictional", { exact: true }),
  ).toBeVisible();
  await expect(previewPage.getByRole("textbox")).toHaveCount(0);
  await previewPage
    .getByText("End of fictional sample. There is nothing to send.", {
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await expect(
    previewPage.getByText("Fictional · read-only · design preview", {
      exact: true,
    }),
  ).toBeInViewport();
  await expect(
    previewPage.getByRole("heading", {
      name: "Sample conversation",
      exact: true,
    }),
  ).toBeInViewport();
  assert.deepEqual(previewRequests, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: lost RSVP reply reconciliation, conflict review, cancellation, accepted-only fictional sample with no composer. All backend requests intercepted.",
  );
} finally {
  await browser.close();
}
