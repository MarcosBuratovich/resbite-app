// "Invite people" (Plan 2 checks the Pick step itself, in verify-contact-invites). Open-link approval moved the
// event's one link (Share, Copy, Turn off) to the event page (verify-event), so this screen has no link section:
// no Event link heading, no Share/Copy/Turn off, and the link is never read. The ⓘ sheet still explains links and
// points to the event page; nothing is kept in browser storage; 320 px with Larger Text. Every Supabase request
// is intercepted.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, heading } from "./qa-helpers.mjs";
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
  phone: "447700900834",
  phone_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
};
const expiry = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
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
  ends_at: "2099-03-01T17:00:00Z",
  time_zone: "Europe/London",
  place_label: "Fixture café, 12 Old Street",
  area: "Near Old Street",
  note: "",
  status: "active",
  version: 1,
  cover_path: null,
  cover_revision: 0,
  cover_description: "",
};
const INFO = [
  "Each resbite has one invitation link. Share it anywhere: messages, email or a group chat.",
  "Anyone with the link sees the basics: who invited them, the name, the time, the area, how many are going and the picture.",
  "The exact place and Meeting details show only after they reply.",
  "The event link, with Share, Copy and Turn off, is on the event page.",
  "Turning the link off also stops any older per-person links you shared.",
  "Answers through the link wait for your approval. You’ll see them in Waiting for you on the event page.",
  "Someone you remove can ask to join again with the link, and you’ll decide.",
];
const LINK_CONTROLS = ["Share link", "Copy link", "Turn off this link"];

async function fixture({ width = 390, largeText = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    timezoneId: "Europe/London",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript((session) => {
    sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session));
  }, session);
  const state = { links: 0, current: { ...plan } };
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: "Stephen", avatar_path: null, avatar_revision: 0 });
    if (path === "/rest/v1/plans")
      return reply(req.headers().accept?.includes("object") ? state.current : [state.current]);
    if (path === "/rest/v1/attendees") return reply([]);
    // The link is read by the event page now: this screen must not ask for it.
    if (path === "/rest/v1/rpc/plan_link" || path === "/rest/v1/rpc/rotate_plan_link") {
      state.links++;
      return reply({ message: "Unexpected link request on Invite people" }, 400);
    }
    return reply({ message: `Unmocked fixture endpoint ${path}` }, 400);
  });
  await page.goto(`${base}/invitations?plan=${plan.id}${largeText ? "&largeText=1" : ""}`);
  if (largeText) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
  return { page, errors, state };
}

try {
  {
    const { page, errors, state } = await fixture();
    await expect(heading(page, "Invite people")).toBeVisible();
    // The Pick step only: no Event link section, no Share, Copy or Turn off, and no link is read.
    await expect(button(page, "Invite 0")).toBeVisible();
    await expect(page.getByRole("heading")).toHaveCount(1);
    await expect(heading(page, "Event link")).toHaveCount(0);
    for (const name of LINK_CONTROLS) await expect(button(page, name)).toHaveCount(0);
    await expect(page.getByText("Anyone can answer with it, and you approve them first.", { exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);
    assert.equal(state.links, 0, "Invite people reads no link");
    // GI1's cover card is gone, and the screen never shows the exact place.
    await expect(page.getByText("This is what people see before they reply.", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Fixture café/)).toHaveCount(0);
    // The ⓘ sheet.
    await button(page, "About invitation links").click();
    await expect(heading(page, "Invitation links")).toBeVisible();
    for (const line of INFO) await expect(page.getByText(line, { exact: true })).toBeVisible();
    await button(page, "Close sheet").click();
    await expect(heading(page, "Invitation links")).toHaveCount(0);
    assert.equal(state.links, 0);
    assert.deepEqual(errors, []);
    await page.context().close();
    console.log(
      "PASS: Invite people has no link section (no Event link heading, no Share, Copy or Turn off, no link read), no card and no exact place; the ⓘ sheet points to the event page and Waiting for you.",
    );
  }
  {
    // Someone else's event, or one that has started: no link, and the reason.
    const { page, errors, state } = await fixture();
    state.current.owner_id = "33333333-3333-4333-8333-333333333333";
    await page.reload();
    await expect(
      page.getByText("Only the organizer can invite people to an upcoming, active resbite.", { exact: true }),
    ).toBeVisible();
    await expect(button(page, "Share link")).toHaveCount(0);
    await expect(heading(page, "Event link")).toHaveCount(0);
    await expect(button(page, /^Invite \d+$/)).toHaveCount(0);
    assert.equal(state.links, 0, "No link is read for someone else's event");
    assert.deepEqual(errors, []);
    await page.context().close();
    console.log("PASS: someone else's event shows why there is no link, and reads none.");
  }
  {
    const { page, errors } = await fixture({ width: 320, largeText: true });
    await expect(heading(page, "Invite people")).toBeVisible();
    await expect(button(page, "Invite 0")).toBeVisible();
    for (const name of LINK_CONTROLS) await expect(button(page, name)).toHaveCount(0);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(fits, "Invite people fits 320 px under Larger Text");
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll("[role=button],[role=heading]")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.left < -1 || b.right > window.innerWidth + 1;
        })
        .map((el) => el.getAttribute("aria-label") || el.textContent),
    );
    assert.deepEqual(clipped, []);
    for (const name of ["About invitation links", "Back", "Add", "Invite 0"]) {
      const box = await button(page, name).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, `${name} is at least 44 pt`);
    }
    assert.deepEqual(errors, []);
    await page.context().close();
    console.log("PASS: Invite people at 320 px with Larger Text: no sideways overflow, 44 pt targets.");
  }
} finally {
  await browser.close();
}
