import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const enabled = process.env.RESBITE_QA_DELETION_ENABLED === "true";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*.supabase.co/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "Preview the design", exact: true })
    .click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Your data & privacy", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review account deletion", exact: true })
    .click();
  await expect(
    page.getByText(
      "You are exploring the design. Preview cannot delete a real account.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Permanently delete account",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveCount(0);
  assert.equal(
    requests.length,
    0,
    "Preview must not request backend data or send OTP/deletion calls",
  );
  await page.screenshot({
    path: "/private/tmp/resbite-deletion-preview.png",
    fullPage: true,
  });
  if (!enabled) {
    await page.goto(`${base}/delete-account`);
    await expect(
      page.getByText(
        /Account deletion is not enabled in this development build/,
      ),
    ).toBeVisible();
    assert.equal(requests.length, 0);
  } else {
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { providers: ["email"] },
      user_metadata: { registration_details_version: 1 },
      created_at: "2026-01-01T00:00:00Z",
    };
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: user.id,
          exp: expires_at,
          role: "authenticated",
        }),
      ).toString("base64url"),
      "local-fixture-only",
    ].join(".");
    const session = {
      access_token: token,
      refresh_token: "fixture",
      token_type: "bearer",
      expires_at,
      expires_in: 3600,
      user,
    };
    await page.evaluate(
      ({ session, user }) => {
        sessionStorage.clear();
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem(
          `resbite.people.v1.${user.id}`,
          JSON.stringify({ groups: [], plans: {}, invitations: [] }),
        );
        sessionStorage.setItem(
          `resbite.drafts.v1.${user.id}`,
          "deletion-fixture-draft",
        );
        sessionStorage.setItem("resbite.pending-invite", "a".repeat(64));
      },
      { session, user },
    );
    await page.unroute("**/*.supabase.co/**");
    let accepted = null,
      requestCount = 0,
      proofCount = 0,
      statusCount = 0,
      otpCount = 0;
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
      if (path === "/auth/v1/otp") {
        otpCount++;
        assert.equal(req.postDataJSON().create_user, false);
        return reply({});
      }
      if (path === "/auth/v1/verify") {
        proofCount++;
        assert.equal(req.postDataJSON().type, "email");
        return reply(session);
      }
      if (path === "/auth/v1/token") {
        proofCount++;
        return reply(session);
      }
      if (path === "/auth/v1/logout") return reply({});
      if (path === "/functions/v1/delete-account") {
        const body = req.postDataJSON();
        if (body.action === "status") {
          statusCount++;
          return accepted
            ? reply({ requestId: body.requestId, status: "queued" })
            : reply({}, 404);
        }
        assert.equal(body.action, "request");
        assert.equal(body.proof, token);
        assert.equal(body.recoveryToken.length, 64);
        const saved = await page.evaluate(
          (id) => JSON.parse(sessionStorage.getItem(`resbite.deletion.${id}`)),
          user.id,
        );
        assert.equal(saved.requestId, body.requestId);
        assert.equal(saved.recoveryToken, body.recoveryToken);
        requestCount++;
        accepted = body;
        return route.abort("failed"); // Committed write, lost reply.
      }
      throw Error(`Unexpected intercepted API ${path}`);
    });
    await page.goto(`${base}/delete-account`);
    await page
      .getByLabel("Current password", { exact: true })
      .fill("fixture-password");
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await page
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, 1);
    assert.equal(proofCount, 1);
    assert.ok(statusCount >= 2);
    const remaining = await page.evaluate(
      (id) => ({
        draft: sessionStorage.getItem(`resbite.drafts.v1.${id}`),
        people: sessionStorage.getItem(`resbite.people.v1.${id}`),
        invite: sessionStorage.getItem("resbite.pending-invite"),
        session: sessionStorage.getItem("sb-ewcsgvhuojxdpaspwsrx-auth-token"),
        receipt: sessionStorage.getItem(`resbite.deletion.${id}`),
      }),
      user.id,
    );
    assert.equal(remaining.draft, null);
    assert.equal(remaining.people, null);
    assert.equal(remaining.invite, null);
    assert.equal(remaining.session, null);
    assert.ok(remaining.receipt);
    await page.reload();
    await page
      .getByRole("button", { name: "Check deletion status", exact: true })
      .click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, 1);
    assert.equal(proofCount, 1);
    assert.ok(statusCount >= 3);
    // Fresh synthetic account session: OTP plus a failed local draft cleanup.
    accepted = null;
    await page.evaluate(
      ({ session, user }) => {
        sessionStorage.clear();
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem(`resbite.drafts.v1.${user.id}`, "retry-draft");
      },
      { session, user },
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Use an email code instead", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Send verification code", exact: true })
      .click();
    await expect(
      page.getByText("Check your email for the verification code.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(otpCount, 1);
    await page
      .getByLabel("Email verification code", { exact: true })
      .fill("123456");
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await page.evaluate(() => {
      const original = Storage.prototype.removeItem;
      let fail = true;
      Storage.prototype.removeItem = function (key) {
        if (fail && key.startsWith("resbite.drafts.v1.")) {
          fail = false;
          throw Error(
            "Fixture cleanup locked. Check deletion status to retry.",
          );
        }
        return original.call(this, key);
      };
    });
    await page
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    await expect(
      page.getByText(
        "Fixture cleanup locked. Check deletion status to retry.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Check deletion status", exact: true })
      .click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, 2);
    assert.equal(proofCount, 2);
    assert.equal(
      await page.evaluate(
        (id) => sessionStorage.getItem(`resbite.drafts.v1.${id}`),
        user.id,
      ),
      null,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `Deletion UI passed: preview/disabled no outbound calls${enabled ? ", enabled synthetic password/OTP, lost reply, local cleanup failure/retry including drafts, restart receipt recovery" : ""}. No real account, email or deletion request.`,
  );
} finally {
  await browser.close();
}
