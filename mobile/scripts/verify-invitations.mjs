// GI1 "Invite people": the event's one link. The card shows what guests see before they reply (the area,
// never the exact place, and who invited them); Share sends "<Title>, <date>. RSVP: <link>"; Copy link copies
// it; Turn off this link asks first and shows a new link; the ⓘ sheet; a failed turn-off re-reads the link;
// the link is never kept in browser storage; 320 px with Larger Text. Every Supabase request is intercepted.
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
const codes = ["AAAAAAAAAAAAAAAAAAAAA1", "BBBBBBBBBBBBBBBBBBBBB2", "CCCCCCCCCCCCCCCCCCCCC3"];
const INFO = [
  "Each resbite has one invitation link. Share it anywhere: messages, email or a group chat.",
  "Anyone with the link sees the basics: who invited them, the name, the time, the area, how many are going and the picture.",
  "The exact place and Meeting details show only after they reply.",
  "Turn the link off to stop it working. You’ll get a new link to share.",
  "Turning the link off also stops any older per-person links you shared.",
  "Someone you remove can join again with the link, unless you turn it off.",
];
const linkOf = (code) => new RegExp(`^(resbite://r/|https://[a-z0-9.-]+/r/)${code}$`);

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
    window.fixtureShares = [];
    window.fixtureCopies = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => {
        window.fixtureShares.push(payload);
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.fixtureCopies.push(text);
        },
      },
    });
  }, session);
  const state = { active: 0, links: 0, rotations: 0, failRotate: false, current: { ...plan } };
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
    if (path === "/rest/v1/rpc/plan_link") {
      assert.deepEqual(req.postDataJSON(), { p_plan: plan.id });
      state.links++;
      return reply(codes[state.active]);
    }
    if (path === "/rest/v1/rpc/rotate_plan_link") {
      assert.deepEqual(req.postDataJSON(), { p_plan: plan.id });
      state.rotations++;
      if (state.failRotate) {
        state.failRotate = false;
        // The turn-off happened, but its reply was lost: the screen re-reads the link.
        state.active++;
        return reply({ message: "Lost reply" }, 500);
      }
      state.active++;
      return reply(codes[state.active]);
    }
    return reply({ message: `Unmocked fixture endpoint ${path}` }, 400);
  });
  await page.goto(`${base}/invitations?plan=${plan.id}${largeText ? "&largeText=1" : ""}`);
  if (largeText) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
  return { page, errors, state };
}
const shares = (page) => page.evaluate(() => window.fixtureShares);
const copies = (page) => page.evaluate(() => window.fixtureCopies);

try {
  {
    const { page, errors, state } = await fixture();
    await expect(heading(page, "Invite people")).toBeVisible();
    // The card: what guests see before they reply. The area, never the exact place.
    await expect(page.getByText("Coffee evening", { exact: true })).toBeVisible();
    await expect(page.getByText("Invited by Stephen", { exact: true })).toBeVisible();
    await expect(page.getByText("Near Old Street", { exact: true })).toBeVisible();
    await expect(page.getByText(/Fixture café/)).toHaveCount(0);
    await expect(page.getByText("This is what people see before they reply.", { exact: true })).toBeVisible();
    // One heading on the screen.
    await expect(page.getByRole("heading")).toHaveCount(1);
    // Share: the title, the date in the app's format and the link.
    await button(page, "Share link").click();
    await expect.poll(async () => (await shares(page)).length).toBe(1);
    const [first] = await shares(page);
    const message = first.text ?? first.message;
    const match = /^Coffee evening, Sun 1 Mar, 15:00 – 17:00\. RSVP: (.+)$/.exec(message);
    assert.ok(match, `Share text: ${message}`);
    assert.match(match[1], linkOf(codes[0]));
    // Copy link.
    await button(page, "Copy link").click();
    await expect(page.getByText("Link copied.", { exact: true })).toBeVisible();
    assert.deepEqual(await copies(page), [match[1]]);
    // Turn off this link: Keep changes nothing.
    let asked = "";
    page.once("dialog", (d) => {
      asked = d.message();
      return d.dismiss();
    });
    await button(page, "Turn off this link").click();
    await expect.poll(() => asked).toContain("Turn off this link?");
    assert.ok(
      asked.includes("People with the old link will see that it’s no longer active. You’ll get a new link."),
      asked,
    );
    await page.waitForTimeout(200);
    assert.equal(state.rotations, 0);
    // Turn off: a new link, said on screen and used by Share and Copy.
    page.once("dialog", (d) => d.accept());
    await button(page, "Turn off this link").click();
    await expect(page.getByText("The old link is off. Share this new link.", { exact: true })).toBeVisible();
    assert.equal(state.rotations, 1);
    await button(page, "Copy link").click();
    await expect.poll(async () => (await copies(page)).length).toBe(2);
    assert.match((await copies(page))[1], linkOf(codes[1]));
    await button(page, "Share link").click();
    await expect.poll(async () => (await shares(page)).length).toBe(2);
    assert.match((await shares(page))[1].text, new RegExp(`RSVP: (resbite://r/|https://[a-z0-9.-]+/r/)${codes[1]}$`));
    // A lost turn-off reply says so and re-reads the link that works now.
    const readsBefore = state.links;
    state.failRotate = true;
    page.once("dialog", (d) => d.accept());
    await button(page, "Turn off this link").click();
    await expect(
      page.getByText("Couldn’t confirm the link was turned off. Check your connection and try again.", { exact: true }),
    ).toBeVisible();
    await expect.poll(() => state.links).toBeGreaterThan(readsBefore);
    await button(page, "Copy link").click();
    await expect.poll(async () => (await copies(page)).length).toBe(3);
    assert.match((await copies(page))[2], linkOf(codes[2]));
    // The ⓘ sheet.
    await button(page, "About invitation links").click();
    await expect(heading(page, "Invitation links")).toBeVisible();
    for (const line of INFO) await expect(page.getByText(line, { exact: true })).toBeVisible();
    await button(page, "Close sheet").click();
    await expect(heading(page, "Invitation links")).toHaveCount(0);
    // The link is read from the database, never kept in browser storage.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    for (const code of codes) assert.ok(!stored.includes(code), "The link code is not stored on the device");
    assert.deepEqual(errors, []);
    await page.context().close();
    console.log(
      "PASS: Invite people: the card (area not place, Invited by), Share text with the date and link, Copy link, Turn off with Keep/Turn off and a new link, a lost turn-off re-reads the link, the ⓘ sheet, nothing stored.",
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
    assert.equal(state.links, 0, "No link is read for someone else's event");
    assert.deepEqual(errors, []);
    await page.context().close();
    console.log("PASS: someone else's event shows why there is no link, and reads none.");
  }
  {
    const { page, errors } = await fixture({ width: 320, largeText: true });
    await expect(heading(page, "Invite people")).toBeVisible();
    await expect(button(page, "Turn off this link")).toBeVisible();
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
    for (const name of ["Share link", "Copy link", "Turn off this link", "About invitation links", "Back"]) {
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
