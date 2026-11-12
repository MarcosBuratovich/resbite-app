import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { AUTH_STORAGE_KEY, quietReminders } from "./qa-helpers.mjs";
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
  phone: "447700900834",
  phone_confirmed_at: "2026-01-01T00:00:00Z",
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
  // Answering Going would otherwise ask "Get notified?" (verify-event covers it).
  await quietReminders(page);
  await page.addInitScript(
    ({ key, session }) => sessionStorage.setItem(key, JSON.stringify(session)),
    { key: AUTH_STORAGE_KEY, session },
  );
  let attendee = { version: 1, response: "pending" },
    writes = 0,
    claims = 0,
    lost = true,
    conflict = false,
    failWithoutCommit = false,
    chatReads = 0;
  const fixturePlan = {
    ...plan,
    owner_id: "33333333-3333-4333-8333-333333333333",
    series_id: "55555555-5555-4555-8555-555555555555",
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
    if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
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
    // An invitee who hasn't answered reads the people counts from the server (plan_people_counts): here, only them.
    if (path === "/rest/v1/rpc/plan_people_counts")
      return reply({ going: attendee.response === "accepted" ? 1 : 0, maybe: attendee.response === "maybe" ? 1 : 0, cant_go: ["declined", "withdrawn"].includes(attendee.response) ? 1 : 0 });
    // Chat plan 2: whether the series is a group (series_is_group); this resbite is a one-off.
    if (path === "/rest/v1/rpc/series_is_group") return reply(false);
    // Task 8: the Chat row. Someone who hasn't answered, or can't go, is not in a one-off's chat (42501, no row); Going
    // or Maybe is, and the row shows.
    if (path === "/rest/v1/rpc/chat_summary") {
      chatReads++;
      if (!["accepted", "maybe"].includes(attendee.response))
        return reply({ code: "42501", message: "Not in this chat", details: null, hint: null }, 403);
      return reply({
        series_id: fixturePlan.series_id,
        plan_id: plan.id,
        title: plan.title,
        starts_at: plan.starts_at,
        ends_at: null,
        time_zone: "UTC",
        status: fixturePlan.status,
        repeat_weeks: null,
        is_group: false,
        stopped: false,
        closes_at: "2099-03-03T15:00:00Z",
        open: fixturePlan.status === "active",
        host: false,
        accepted: 1,
        members: 2,
        going: 2,
        everyone: 2,
        pinned: null,
        last: null,
        names: {},
        muted_chat: false,
        muted_resbite: false,
        last_read_id: null,
        unread: false,
        message_count: 0,
      });
    }
    if (path === "/rest/v1/rpc/my_chat_overview") return reply({ chats: {}, announcements: {}, names: {} });
    // The people list's reads once answered (Going names everyone): no connections and, chat plan 3, nobody blocked.
    if (path === "/rest/v1/rpc/plan_connection_states") return reply({});
    if (path === "/rest/v1/rpc/my_blocks") return reply([]);
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
  await page.goto(`${base}/event?plan=${plan.id}`);
  // An unanswered guest sees the answer control in the bottom bar, and More beside it holding Report or block alone
  // (chat plan 3: the host the byline names, B4 and I-2).
  await expect(page.getByRole("radiogroup", { name: "Your answer", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Maybe", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "Report or block", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to calendar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mute this resbite", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close sheet", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Report or block", exact: true })).toHaveCount(0);
  // Not answered yet: not in the chat, so no Chat row (CH-P14).
  await expect.poll(() => chatReads).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /^Chat\b/ })).toHaveCount(0);
  await page.getByRole("radio", { name: "Going", exact: true }).click();
  await expect(
    page.getByText("Your response is saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(writes, 1);
  // Going shows the reply with Change, and the saved answer brings the Chat row with it: Going is in the chat.
  await expect(page.getByText("You’re going", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chat. No messages yet", exact: true })).toBeVisible();
  attendee = { version: 3, response: "withdrawn" };
  await page.goto(`${base}/event?plan=${plan.id}`);
  // Withdrawn reads You can’t go with Change; the answer sheet holds the control. Can’t go is out of the chat: no row.
  await expect(page.getByText("You can’t go", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Chat\b/ })).toHaveCount(0);
  conflict = true;
  await page.getByRole("button", { name: "Change your answer", exact: true }).click();
  await page.getByRole("radio", { name: "Going", exact: true }).click();
  // The failure is said inside the sheet (the page behind repeats it).
  await expect(
    page.getByTestId("sheet-scroll").getByText(
      "The plan or your response changed. Review the latest details before choosing again.",
      { exact: true },
    ),
  ).toBeVisible();
  // UX3-D7: "Can’t go" on the answer control and the status chip.
  await expect(page.getByRole("radio", { name: "Can’t go", exact: true })).toBeChecked();
  // The invitation shows the plan's own text, not the bundled idea title.
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  await expect(page.getByText("Bring a book", { exact: true })).toBeVisible();
  conflict = false;
  failWithoutCommit = true;
  await page.getByRole("radio", { name: "Going", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry my response", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Can’t go", exact: true })).toBeDisabled();
  // The sheet stays open on a failure; the retry waits on the page under it.
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry my response", exact: true })
    .click();
  await expect(
    page.getByText("Your response is saved.", { exact: true }),
  ).toBeVisible();
  fixturePlan.status = "cancelled";
  await page.reload();
  // A cancelled resbite says so; the reply stays as text with no Change and no way to answer.
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change your answer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Going", exact: true })).toHaveCount(0);
  fixturePlan.status = "active";
  await page.goto(`${base}/invite?token=${"a".repeat(64)}`);
  // The claim lands on the resbite page, where the saved answer reads You’re going.
  await expect(page.getByText("You’re going", { exact: true })).toBeVisible();
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
  await expect(previewPage.getByRole("button", { name: "Data & privacy", exact: true })).toBeVisible();
  // The sample chat is gone (Task 8): no row in the preview's Profile, and no screen at its old address.
  await expect(previewPage.getByRole("button", { name: "Sample conversation", exact: true })).toHaveCount(0);
  await previewPage.goto(`${base}/sample-chat?plan=${plan.id}`);
  await expect(previewPage.getByText("Unmatched Route", { exact: true })).toBeVisible();
  await expect(previewPage.getByText("Sam · fictional", { exact: true })).toHaveCount(0);
  assert.deepEqual(previewRequests, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: lost RSVP reply reconciliation, conflict review (Can’t go), cancellation; the Chat row only once the answer is Going (chat_summary refused before and after Can’t go); no sample chat in Profile or at /sample-chat. All backend requests intercepted.",
  );
} finally {
  await browser.close();
}
