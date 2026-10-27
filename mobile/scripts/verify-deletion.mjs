import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    .getByRole("button", { name: "Data & privacy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Privacy", exact: true }),
  ).toBeVisible();
  // Each topic opens a sheet with today's text, word for word.
  await page.getByRole("button", { name: "On this device", exact: true }).click();
  await expect(
    page.getByText(/^Contacts are read only when you choose them\./),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close sheet", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "About this page", exact: true }).click();
  await expect(
    page.getByText(/^Resbite is in private development\./),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close sheet", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(
    page.getByText("Deletion immediately closes access.", { exact: true }),
  ).toBeVisible();
  // The full warnings, and the former Privacy deletion paragraph, sit in "What happens".
  await page.getByRole("button", { name: "What happens", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What happens", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/^Future plans you organized are cancelled\./),
  ).toBeVisible();
  await expect(
    page.getByText(/^Signing out does not delete your account or shared plans\./),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close sheet", exact: true }),
  ).toHaveCount(0);
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
    path: join(tmpdir(), "resbite-deletion-preview.png"),
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
      phone: "447700900834",
      phone_confirmed_at: "2026-01-01T00:00:00Z",
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
    // The Apple-only case below swaps these: the signed-in account, the token the app sends as
    // Authorization, the proof the worker should receive, and who Apple's sign-in returns.
    let current = user,
      expectedAuthorization = token,
      expectedProof = token,
      appleProof = null;
    const appleNonces = [];
    await page.route("**/*.supabase.co/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const reply = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (path === "/auth/v1/user") return reply(current);
      if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
      if (path === "/rest/v1/rpc/account_access_status")
        return reply({ account_id: current.id, status: "approved" });
      if (path === "/rest/v1/profiles")
        return reply({ id: current.id, display_name: "Fixture", avatar_path: null });
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
        if (new URL(req.url()).searchParams.get("grant_type") === "id_token") {
          // Sign in with Apple's id-token call, from the deletion screen's isolated client.
          const body = req.postDataJSON();
          assert.equal(body.provider, "apple");
          assert.equal(body.id_token, "fixture-apple-identity-token");
          appleNonces.push(body.nonce);
          assert.ok(appleProof, "Apple's sign-in was not expected here");
          return reply(appleProof);
        }
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
        assert.equal(body.proof, expectedProof);
        assert.equal(req.headers().authorization, `Bearer ${expectedAuthorization}`);
        assert.equal(body.recoveryToken.length, 64);
        const saved = await page.evaluate(
          (id) => JSON.parse(sessionStorage.getItem(`resbite.deletion.${id}`)),
          current.id,
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
    // An email account opens on the code (it may never have had a password); the password is one tap away.
    await expect(
      page.getByRole("button", { name: "Send verification code", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Use my password instead", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Send verification code", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Use an email code instead", exact: true }),
    ).toBeVisible();
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
    // The code step is the default: no switch needed.
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
    // GI2-D10: an Apple-only account confirms by signing in with Apple again. Web has no Sign in
    // with Apple, so Apple's native module is stubbed at Expo's module boundary (on web,
    // expo-modules-core reads native modules from ExpoDomWebView.expoModulesProxy): the app's own appleSignInDeps,
    // nonce and id-token call run as on the phone, and the id-token endpoint is intercepted above.
    const jwt = (claims) =>
      [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({ role: "authenticated", exp: expires_at, ...claims })).toString("base64url"),
        "local-fixture-only",
      ].join(".");
    const appleUser = {
      ...user,
      id: "22222222-2222-4222-8222-222222222222",
      email: "fixture-apple@example.invalid",
      app_metadata: { provider: "apple", providers: ["apple"] },
    };
    const appleToken = jwt({ sub: appleUser.id });
    const appleSession = { ...session, access_token: appleToken, user: appleUser };
    const appleProofFor = (account) => ({
      ...appleSession,
      access_token: jwt({
        sub: account.id,
        amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) }],
        app_metadata: account.app_metadata,
      }),
      refresh_token: "fixture-apple-proof",
      user: account,
    });
    accepted = null;
    current = appleUser;
    expectedAuthorization = appleToken;
    await page.addInitScript(() => {
      globalThis.__appleSheet = { result: "cancel", nonces: [] };
      globalThis.ExpoDomWebView = {
        expoModulesProxy: {
          ExpoAppleAuthentication: {
            isAvailableAsync: async () => true,
            addListener() {},
            removeListeners: async () => {},
            requestAsync: async (options) => {
              const sheet = globalThis.__appleSheet;
              sheet.nonces.push(options.nonce);
              if (sheet.result === "cancel")
                throw Object.assign(new Error("Fixture: sheet closed"), {
                  code: "ERR_REQUEST_CANCELED",
                });
              return {
                user: "fixture-apple-user",
                identityToken: "fixture-apple-identity-token",
                authorizationCode: "fixture-apple-code",
                fullName: null,
                email: null,
                realUserStatus: 1,
                state: null,
              };
            },
          },
        },
      };
    });
    await page.evaluate(
      ({ session, user }) => {
        sessionStorage.clear();
        sessionStorage.setItem(
          "sb-ewcsgvhuojxdpaspwsrx-auth-token",
          JSON.stringify(session),
        );
      },
      { session: appleSession, user: appleUser },
    );
    await page.goto(`${base}/delete-account`);
    const appleButton = page.getByRole("button", {
      name: "Continue with Apple",
      exact: true,
    });
    await expect(
      page.getByText("To confirm it’s you, sign in with Apple again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(appleUser.email, { exact: true })).toBeVisible();
    await expect(appleButton).toBeVisible();
    await expect(appleButton).toBeDisabled();
    for (const name of [
      "Permanently delete account",
      "Send verification code",
      "Use an email code instead",
      "Use my password instead",
    ])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await expect(appleButton).toBeEnabled();
    const sheetNonces = () => page.evaluate(() => globalThis.__appleSheet.nonces);
    const appSession = () =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("sb-ewcsgvhuojxdpaspwsrx-auth-token")),
      );
    const before = { proofCount, requestCount };
    // A closed sheet: nothing is requested and nothing is said.
    await appleButton.click();
    await expect.poll(async () => (await sheetNonces()).length).toBe(1);
    await expect(appleButton).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    assert.deepEqual({ proofCount, requestCount }, before);
    // A different Apple ID is refused, and the app stays signed in as the same account.
    appleProof = appleProofFor({
      ...appleUser,
      id: "33333333-3333-4333-8333-333333333333",
    });
    await page.evaluate(() => (globalThis.__appleSheet.result = "ok"));
    await appleButton.click();
    await expect(
      page.getByText("Reauthentication returned a different account.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(requestCount, before.requestCount);
    assert.equal((await appSession()).access_token, appleToken);
    // Apple's sign-in for this account: its fresh session is the proof; the app's own session
    // stays the Authorization, then cleanup signs out as for a password or a code.
    appleProof = appleProofFor(appleUser);
    expectedProof = appleProof.access_token;
    await appleButton.click();
    await expect(
      page.getByText(/Your deletion request is accepted/),
    ).toBeVisible();
    assert.equal(requestCount, before.requestCount + 1);
    assert.equal(proofCount, before.proofCount + 2);
    const nonces = await sheetNonces();
    assert.equal(nonces.length, 3);
    assert.equal(appleNonces.length, 2);
    // Apple's sheet gets the SHA-256 of the one-use nonce Supabase receives.
    assert.equal(
      nonces[2],
      createHash("sha256").update(appleNonces[1]).digest("hex"),
    );
    assert.equal(await appSession(), null);
    assert.ok(
      await page.evaluate(
        (id) => sessionStorage.getItem(`resbite.deletion.${id}`),
        appleUser.id,
      ),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `Deletion UI passed: preview/disabled no outbound calls${enabled ? ", enabled synthetic password/OTP (an email account opens on the code, the password one switch away), lost reply, local cleanup failure/retry including drafts, restart receipt recovery, Apple-only account confirms with Apple (closed sheet quiet, different Apple ID refused with the app session unchanged, isolated proof)" : ""}. No real account, email or deletion request.`,
  );
} finally {
  await browser.close();
}
