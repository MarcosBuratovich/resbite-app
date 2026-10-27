import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.addInitScript(() => {
    window.__notificationPrompts = 0;
    if (window.Notification)
      window.Notification.requestPermission = async () => {
        window.__notificationPrompts++;
        throw Error("Unexpected notification prompt");
      };
  });
  await page.goto(process.env.RESBITE_QA_URL || "http://localhost:8081");
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  // UX3: reminders are set on this phone, with a real switch. Plan 4: the Updates card is "Not active yet" in preview.
  await expect(page.getByText("Updates", { exact: true })).toBeVisible();
  await expect(page.getByText("Not active yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Design preview", { exact: true })).toBeVisible();
  const reminders = page.getByRole("switch", { name: "Event reminders", exact: true });
  await expect(reminders).toBeChecked();
  await expect(
    page.getByText("1 day and 1 hour before resbites you’re going to, or might. Set on this phone.", { exact: true }),
  ).toBeVisible();
  const box = await reminders.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 320, "The switch fits at 320px");
  await reminders.click();
  await expect(reminders).not.toBeChecked();
  // It's kept on this phone: leaving and coming back keeps it off.
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Event reminders", exact: true })).not.toBeChecked();
  await page.getByRole("switch", { name: "Event reminders", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Event reminders", exact: true })).toBeChecked();
  await page
    .getByRole("button", { name: "About notifications", exact: true })
    .click();
  await expect(
    page.getByText(
      "This build does not send plan or RSVP notifications. Open My resbites to check the latest details and responses.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Reminders are set on this phone when you answer Going or Maybe, or organize a resbite. If an organizer changes the time and you don’t open Resbite before the old reminder, it may still arrive at the old time.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close sheet", exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "Preview does not read or request notification permission, or send notifications.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open device settings", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check again", exact: true }),
  ).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.__notificationPrompts), 0);
  await page
    .getByRole("button", { name: "Open My resbites", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "My resbites",
      exact: true,
    }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Notifications preview at 320px: the Event reminders switch (kept on this phone), the Updates card not active yet, the About sheet; no permission prompts or backend calls.",
  );

  // Plan 4: signed in, Notification settings' Updates card shows the real state and its one button. Expo web
  // has no push, so a script sets the card's state on the development fake (`__resbiteDevice.updates`, read on
  // web only). "Not active yet" is what the build shows with no seam at all.
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.invalid",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    phone: "447700900834",
    phone_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: {},
    user_metadata: { registration_details_version: 1 },
    created_at: "2026-01-01T00:00:00Z",
  };
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
    "local-fixture-only",
  ].join(".");
  const session = {
    access_token: jwt,
    refresh_token: "local-fixture",
    token_type: "bearer",
    expires_at: expiry,
    expires_in: 3600,
    user,
  };
  const TURN_ON = "Turn on notifications";
  const states = [
    { name: "no seam", updates: undefined, chip: "Not active yet", button: null },
    { name: "web build", updates: { delivery: true, permission: "granted", push: "disabled" }, chip: "Not active yet", button: null },
    { name: "not asked", updates: { delivery: true, permission: "undetermined", push: "permission-off" }, chip: "Not asked yet", button: TURN_ON },
    { name: "checking permission", updates: { delivery: true, permission: null, push: "registered" }, chip: "Checking…", button: null },
    { name: "checking account", updates: { delivery: true, permission: "granted", push: null }, chip: "Checking…", button: null },
    { name: "on", updates: { delivery: true, permission: "granted", push: "registered" }, chip: "On", button: null },
    { name: "off in Settings", updates: { delivery: true, permission: "denied", push: "permission-off" }, chip: "Off in Settings", button: "Open device settings" },
    { name: "not set up", updates: { delivery: true, permission: "granted", push: "failed" }, chip: "Not set up yet", button: "Try setting up notifications again" },
  ];
  const actions = ["Open device settings", TURN_ON, "Try setting up notifications again"];
  for (const width of [390, 320]) {
    for (const state of states) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const signedIn = await context.newPage();
      const failures = [];
      signedIn.on("pageerror", (e) => failures.push(e.message));
      await signedIn.addInitScript(
        ({ session, updates }) => {
          sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session));
          globalThis.__resbiteDevice = { reminders: [], calendar: [], permission: "undetermined", updates };
        },
        { session, updates: state.updates },
      );
      await signedIn.route("**/*.supabase.co/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        const reply = (body) =>
          route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        if (path === "/auth/v1/user") return reply(user);
        if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
        if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
        if (path === "/rest/v1/profiles")
          return reply({ id: user.id, display_name: "Stephen", avatar_path: null, avatar_revision: 0 });
        if (path === "/rest/v1/plans" || path === "/rest/v1/attendees") return reply([]);
        return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: path }) });
      });
      await signedIn.goto(`${process.env.RESBITE_QA_URL || "http://localhost:8081"}/notifications`);
      const at = `${state.name} at ${width}px`;
      await expect(signedIn.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
      await expect(signedIn.getByText("Updates", { exact: true })).toBeVisible();
      await expect(signedIn.getByText(state.chip, { exact: true }), at).toBeVisible();
      // The card's one button, and no other action.
      for (const name of actions) {
        const found = signedIn.getByRole("button", { name, exact: true });
        if (name === state.button) {
          await expect(found, at).toHaveCount(1);
          const box = await found.boundingBox();
          assert.ok(box && box.height >= 44 && box.width >= 44, `${at}: ${name} is at least 44pt (${box?.width}x${box?.height})`);
          assert.ok(box.x >= 0 && box.x + box.width <= width, `${at}: ${name} fits the screen`);
        } else await expect(found, at).toHaveCount(0);
      }
      // The reminders switch is unchanged and still reachable.
      await expect(signedIn.getByRole("switch", { name: "Event reminders", exact: true }), at).toBeVisible();
      const text = await signedIn.locator("body").innerText();
      assert.ok(!text.includes("000000"), `${at}: no 000000 on the screen`);
      if (state.button === TURN_ON) {
        // Web's fake asks and allows; the card stays as set (the seam holds the state).
        await signedIn.getByRole("button", { name: TURN_ON, exact: true }).click();
        await expect.poll(() => signedIn.evaluate(() => globalThis.__resbiteDevice.permission)).toBe("granted");
      }
      assert.deepEqual(failures, [], at);
      await context.close();
    }
  }
  console.log(
    "PASS: Updates card signed in at 390px and 320px: Not active yet (no seam, and the web build), Not asked yet with Turn on notifications, Checking… (permission or account), On, Off in Settings with one Settings button, Not set up yet with Try again; each button 44pt and on screen; no 000000.",
  );
} finally {
  await browser.close();
}
