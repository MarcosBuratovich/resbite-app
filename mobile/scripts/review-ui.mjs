// Captures every UX1, UX3 and UX4 screen at 390 and 320 px (UX3 and UX4 also with Larger Text at 320 px) with no console or page errors,
// and keeps the gluestack keyboard-selection check. Every Supabase request is aborted, except in the GI1, GI2 and phone blocks at the
// end, where requests are answered by a local stub: a signed-in organizer's Invite people (Plan 2: the Pick step with three numbers,
// one On Resbite, and Almost there; GI1's Event link below), the Guests sheet with Remove and the Invited group, and My resbites
// with an Invitations card; a signed-out guest's account screen, its Code and Name steps and a dead link (GI2); and phone sign-up,
// its code, phone sign-in, About you, and Add your number with its "taken" refusal, the offer to bring in a web-only account and
// that offer's code step.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { button, heading, later, next, openEvent, quietReminders, visible } from "./qa-helpers.mjs";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const out = process.env.RESBITE_QA_SHOTS || join(tmpdir(), "resbite-ui-audit");
await mkdir(out, { recursive: true });
async function addPerson(page, name, address) {
  await page.getByLabel("Person’s name", { exact: true }).fill(name);
  await page.getByLabel("Email or phone", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: `${name}, ${address}`, exact: true })).toBeChecked();
}
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome" });
try {
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    // The event page would otherwise open "Get reminders?" over the capture.
    await quietReminders(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // Sheets are modal overlays: capture the viewport (a full-page capture resizes it and loses them).
    // Sheets fade in and out even under Reduce Motion, so let the fade finish before capturing.
    const shot = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      return page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage });
    };
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(base);
    await page.getByText("Preview the design", { exact: true }).click();
    await expect(heading(page, "Create")).toBeVisible();
    await shot("create");
    // Idea detail, and an idea opening at Review.
    await page.getByRole("button", { name: "Coffee together", exact: true }).click();
    await expect(heading(page, "Coffee together")).toBeVisible();
    await shot("idea");
    await button(page, "Use idea").click();
    await expect(heading(page, "Looks good?")).toBeVisible();
    await shot("review-idea");
    await button(page, "Close").click();
    await button(page, "Back").click();
    // My resbites, empty.
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await expect(page.getByText("Nothing planned", { exact: true })).toBeVisible();
    await shot("plans-empty");
    // The four steps, Review, the Invite screen and invitations.
    await button(page, "New resbite").click();
    await shot("step-what");
    await page.getByLabel("Name", { exact: true }).fill("Picnic in the park");
    await next(page);
    await shot("step-when");
    // UX3: an end time on When, Meeting details on Where.
    await button(page, "Add an end time").click();
    await expect(page.getByLabel("End date and time (local)", { exact: true })).toBeVisible();
    await shot("step-when-end");
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await page.getByLabel("Meeting details (optional)", { exact: true }).fill("By the big oak near the north gate. Gate code 4512.");
    await shot("step-where");
    // GI1: the optional Area, shown before people reply.
    await page.getByLabel("Area, shown before people reply", { exact: true }).fill("Near the north gate, Victoria Park");
    assert.ok(await fits(), `step-where-area-${width} fits at ${width} px`);
    await shot("step-where-area");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await shot("step-vibe");
    await next(page);
    await shot("step-review");
    await button(page, "Create preview").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    await shot("invite-screen");
    await button(page, "Invite people").click();
    // Plan 2: preview shows the Pick step and says it can't invite; GI1's Event link section is left out.
    await expect(heading(page, "Invite people")).toBeVisible();
    await shot("invitations");
    await button(page, "About invitation links").click();
    await expect(heading(page, "Invitation links")).toBeVisible();
    await shot("invitations-about", false);
    await button(page, "Close sheet").click();
    // Back returns to My resbites.
    for (let i = 0; i < 3 && !(await button(page, /^Picnic in the park, /).isVisible()); i++) {
      await button(page, "Back").click();
      await page.waitForTimeout(300);
    }
    // My resbites with a card, the event page and its More sheet (GI-D3: no Choose people on the event page).
    const card = button(page, /^Picnic in the park, /);
    await expect(card).toBeVisible();
    await shot("plans");
    await card.click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await shot("event");
    // UX3: the organizer posts a Note to guests; the page shows it with the Meeting details and the device chips.
    await button(page, "Post a note to guests").click();
    await page.getByLabel("Note to guests", { exact: true }).fill("Bring a blanket, we have the drinks covered.");
    await shot("event-note-sheet", false);
    await button(page, "Post").click();
    await expect(page.getByRole("button", { name: "Close sheet" })).toHaveCount(0);
    await expect(page.getByText("Bring a blanket, we have the drinks covered.", { exact: true })).toBeVisible();
    await shot("event-organizer-notes");
    await button(page, "More actions").click();
    await shot("event-more", false);
    await button(page, "Close sheet").click();
    await expect(page.getByRole("button", { name: "Close sheet" })).toHaveCount(0);
    await expect(button(page, "Choose people")).toHaveCount(0);
    await button(page, "Back").click();
    await page.getByRole("radio", { name: "Past", exact: true }).click();
    await shot("plans-past");
    // UX4 Profile and settings in preview, then People & groups with gluestack keyboard selection.
    await page.getByRole("tab", { name: "Wellness", exact: true }).click();
    await expect(heading(page, "Wellness")).toBeVisible();
    await shot("wellness");
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await expect(heading(page, "Profile")).toBeVisible();
    await shot("profile");
    await button(page, "Notifications").click();
    await expect(heading(page, "Notifications")).toBeVisible();
    await shot("notifications");
    await button(page, "Profile").click();
    await button(page, "Data & privacy").click();
    await expect(heading(page, "Privacy")).toBeVisible();
    await shot("privacy");
    await button(page, "On this device").click();
    await shot("privacy-topic", false);
    await button(page, "Close sheet").click();
    await button(page, "Delete account").click();
    await expect(heading(page, "Delete account")).toBeVisible();
    await shot("delete-account");
    await button(page, "What happens").click();
    await shot("delete-what-happens", false);
    await button(page, "Close sheet").click();
    await button(page, "Privacy").click();
    await button(page, "Profile").click();
    await expect(heading(page, "Profile")).toBeVisible();
    await page.getByRole("button", { name: "People & groups", exact: true }).click();
    await page.getByRole("button", { name: "Create a group", exact: true }).click();
    await shot("people");
    await page.getByLabel("Person’s name", { exact: true }).fill("Alex");
    await page.getByLabel("Email or phone", { exact: true }).fill("alex@example.invalid");
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    const checkbox = page.getByRole("checkbox", { name: "Alex, alex@example.invalid", exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("heading", { name: "Selected · 0", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Uncaught Error");
    // A saved group, and the About people sheet.
    await addPerson(page, "Alex", "alex@example.invalid");
    await page.getByLabel("Group name", { exact: true }).fill("Friends");
    await button(page, "Save group").click();
    await expect(button(page, "Edit Friends")).toBeVisible();
    await shot("people-groups");
    await button(page, "About people").click();
    await expect(heading(page, "About people")).toBeVisible();
    await shot("people-about", false);
    await button(page, "Close sheet").click();
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // UX4 public screens at 390 and 320 px and with Larger Text at 320 px: landing, introduction,
  // email sign-in, reset, confirm and the email-link page (sign-up by phone is captured in the phone block).
  // Supabase requests are aborted, so the browser's "Failed to load resource" lines are expected on these screens.
  for (const [width, large] of [[390, false], [320, false], [320, true]]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
    const suffix = large ? "large-320" : String(width);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const clipped = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[role=button],[role=link],[role=heading],h1,h2,h3,input,textarea")]
          .filter((el) => !el.closest("[role=tablist],[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.left < -1 || b.right > window.innerWidth + 1;
          })
          .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
      );
    const visit = async (name, title) => {
      await expect(heading(page, title)).toBeVisible();
      assert.ok(await fits(), `${name} fits at ${suffix}`);
      assert.deepEqual(await clipped(), [], `${name} has nothing clipped at ${suffix}`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-${suffix}.png`, fullPage: true });
    };
    const open = async (path) => {
      await page.goto(`${base}${path}${large ? `${path.includes("?") ? "&" : "?"}largeText=1` : ""}`);
      if (large) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    };
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await open("/");
    await visit("landing", "Get together");
    await button(page, "Get started").click();
    await visit("intro", "Little plans");
    await button(page, "I have an account").click();
    await visit("sign-in", "Welcome back");
    await button(page, "Forgot password?").click();
    await visit("reset", "Reset password");
    await button(page, "Back to sign in").click();
    await button(page, "Need to confirm your email?").click();
    await visit("confirm", "Confirm your email");
    await open("/auth/callback?code=one&code=two");
    await visit("email-link", "Let’s try again");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // UX4 preview screens under Larger Text at 320 px: Profile, Notifications, Privacy, Delete account and Wellness.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const clipped = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[role=button],[role=link],[role=heading],h1,h2,h3,input,textarea")]
          .filter((el) => !el.closest("[role=tablist],[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.left < -1 || b.right > window.innerWidth + 1;
          })
          .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
      );
    const visit = async (name, title) => {
      await expect(heading(page, title)).toBeVisible();
      assert.ok(await fits(), `${name} fits at 320 px under Larger Text`);
      assert.deepEqual(await clipped(), [], `${name} has nothing clipped at 320 px under Larger Text`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-large-320.png`, fullPage: true });
    };
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(`${base}/?largeText=1`);
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "Wellness", exact: true }).click();
    await visit("wellness", "Wellness");
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await visit("profile", "Profile");
    await button(page, "Notifications").click();
    await visit("notifications", "Notifications");
    await button(page, "Profile").click();
    await button(page, "Data & privacy").click();
    await visit("privacy", "Privacy");
    await button(page, "Delete account").click();
    await visit("delete-account", "Delete account");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // Larger Text at 320 px (forced layouts plus scaled text, as in verify-kit): rows, top row and sheets.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    // The event page would otherwise ask "Get reminders?".
    await quietReminders(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const shot = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      return page.screenshot({ path: `${out}/${name}-large-320.png`, fullPage });
    };
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(`${base}/?largeText=1`);
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Picnic in the park");
    await next(page);
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await next(page);
    await button(page, "Create preview").click();
    await button(page, "Invite people").click();
    // The preview's Invite people (the Pick step and the note that preview can't invite) and its ⓘ sheet.
    await expect(heading(page, "Invite people")).toBeVisible();
    assert.ok(await fits(), "Invite people fits at 320 px under Larger Text");
    await shot("invitations");
    await button(page, "About invitation links").click();
    await shot("invitations-about", false);
    await button(page, "Close sheet").click();
    await button(page, "Back").click();
    // People opens from Profile (GI-D3: not from the event page).
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "People & groups", exact: true }).click();
    await page.getByRole("button", { name: "Create a group", exact: true }).click();
    await shot("people-empty");
    assert.ok(await fits(), "People top row fits at 320 px under Larger Text");
    await addPerson(page, "Alex Rivera", "alex@example.invalid");
    await addPerson(page, "Bea", "bea@example.invalid");
    await shot("people-selected");
    await button(page, "About people").click();
    await shot("people-about", false);
    await button(page, "Close sheet").click();
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // UX3 under Larger Text at 320 px: When with an end, Where with Meeting details, the organizer's event page.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    await quietReminders(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const shot = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      return page.screenshot({ path: `${out}/${name}-large-320.png`, fullPage });
    };
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(`${base}/?largeText=1`);
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Picnic in the park");
    await next(page);
    await button(page, "Add an end time").click();
    assert.ok(await fits(), "When with an end fits at 320 px under Larger Text");
    await shot("step-when-end");
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await page.getByLabel("Meeting details (optional)", { exact: true }).fill("By the big oak near the north gate. Gate code 4512.");
    await page.getByLabel("Area, shown before people reply", { exact: true }).fill("Near the north gate, Victoria Park");
    assert.ok(await fits(), "Where with Meeting details and an Area fits at 320 px under Larger Text");
    await shot("step-where");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await next(page);
    await button(page, "Create preview").click();
    await later(page);
    await openEvent(page, "Picnic in the park");
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await button(page, "Post a note to guests").click();
    await page.getByLabel("Note to guests", { exact: true }).fill("Bring a blanket, we have the drinks covered.");
    await button(page, "Post").click();
    await expect(page.getByRole("button", { name: "Close sheet" })).toHaveCount(0);
    assert.ok(await fits(), "The organizer's event page fits at 320 px under Larger Text");
    await shot("event-organizer-notes");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // Signed in as the organizer against a local stub, at 390 and 320 px and under Larger Text at 320 px, with nothing
  // wider than the screen or clipped: Invite people's Pick step with three numbers (one On Resbite) and GI1's Event
  // link below, Almost there, the Guests sheet with Remove and the Invited group, and My resbites with an Invitations
  // card. The browser can't read phone contacts, so the numbers are added with "Add a number".
  for (const [width, large] of [[390, false], [320, false], [320, true]]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce", timezoneId: "Europe/London" });
    await quietReminders(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const suffix = large ? "large-320" : String(width);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const clipped = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[role=button],[role=checkbox],[role=heading],h1,h2,h3,input,textarea")]
          .filter((el) => !el.closest("[role=tablist],[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.left < -1 || b.right > window.innerWidth + 1;
          })
          .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
      );
    // Captured first, so a failure leaves the picture of what is wrong.
    const shot = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-${suffix}.png`, fullPage });
      assert.ok(await fits(), `${name} fits at ${suffix}`);
      assert.deepEqual(await clipped(), [], `${name} has nothing clipped at ${suffix}`);
    };
    const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", phone: "447700900834", phone_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: { registration_details_version: 1 }, created_at: "2026-01-01T00:00:00Z" };
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const jwt = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
      "local-fixture-only",
    ].join(".");
    const session = { access_token: jwt, refresh_token: "local-fixture", token_type: "bearer", expires_at: expiry, expires_in: 3600, user };
    const plan = {
      id: "22222222-2222-4222-8222-222222222222",
      activity_id: null,
      title: "Film club: Paris, Texas",
      description: "",
      categories: ["creative", "community"],
      owner_id: user.id,
      starts_at: "2099-10-23T18:30:00Z",
      ends_at: "2099-10-23T21:00:00Z",
      time_zone: "Europe/London",
      place_label: "Flat 3, 12 Old Street",
      area: "Near Old Street",
      note: "",
      status: "active",
      version: 1,
      cover_path: null,
      cover_revision: 0,
      cover_description: "",
      guest_note: "",
      guest_note_at: null,
    };
    const guests = [
      { user_id: "g1", response: "accepted", profiles: { display_name: "Alex Rivera" } },
      { user_id: "g2", response: "accepted", profiles: { display_name: "Bea" } },
      { user_id: "g3", response: "maybe", profiles: { display_name: "Cy" } },
      { user_id: "g4", response: "pending", profiles: { display_name: "Di" } },
    ];
    // Jo's invitation to the organizer, not answered yet: a card under Invitations on My resbites.
    const jo = "33333333-3333-4333-8333-333333333333";
    const invitation = { ...plan, id: "44444444-4444-4444-8444-444444444444", title: "Board games at the café", owner_id: jo, place_label: "Games room", area: "Near the station", starts_at: "2099-10-24T18:00:00Z", ends_at: null };
    // Three numbers to invite: Ana is on Resbite (invited in the app); Ben and Cy get personal links.
    const people = [
      ["Ana Rivera-Castellanos", "07700 900123", "447700900123"],
      ["Ben Okafor", "07700 900456", "447700900456"],
      ["Cy Lindqvist", "07700 900789", "447700900789"],
    ];
    const links = new Map();
    await page.addInitScript((session) => {
      sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session));
      // WhatsApp and Messages open with window.open on the web; nothing leaves the page.
      window.open = () => null;
    }, session);
    await page.route("**/*.supabase.co/**", (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const one = req.headers().accept?.includes("object");
      const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/auth/v1/user") return reply(user);
      if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
      if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
      if (path === "/rest/v1/profiles") {
        if (url.searchParams.get("id")?.startsWith("in.")) return reply([{ id: jo, display_name: "Jo" }]);
        return reply({ id: user.id, display_name: "Stephen", avatar_path: null, avatar_revision: 0 });
      }
      if (path === "/rest/v1/activities") return reply([]);
      if (path === "/rest/v1/plans") {
        const rows = [plan, invitation].filter((p) => !id || p.id === id).map((p) => ({ ...p, plan_meeting_details: null }));
        return reply(one ? rows[0] : rows);
      }
      if (path === "/rest/v1/attendees") {
        if (one) return reply(null);
        // My resbites: the organizer's guests and their own row on Jo's invitation.
        if (!url.searchParams.has("plan_id"))
          return reply([
            ...guests.map((g) => ({ ...g, plan_id: plan.id, version: 1 })),
            { plan_id: invitation.id, user_id: user.id, response: "pending", version: 1, profiles: { display_name: "Stephen" } },
          ]);
        return reply(url.searchParams.get("plan_id") === `eq.${plan.id}` ? guests : []);
      }
      if (path === "/rest/v1/rpc/plan_link") return reply("AbCdEfGhIjKlMnOpQrStUv");
      if (path === "/rest/v1/rpc/contacts_on_resbite") return reply(req.postDataJSON().p_phones.filter((p) => p === people[0][2]));
      if (path === "/rest/v1/rpc/invite_contacts")
        return reply(
          req.postDataJSON().p_invites.map(({ phone, country }) => {
            if (phone === people[0][2]) return { phone, kind: "app" };
            links.set(phone, { phone, country, answered: false, response: null });
            return { phone, kind: "link" };
          }),
        );
      if (path === "/rest/v1/rpc/plan_phone_invitations") return reply([...links.values()]);
      return reply({ message: `Unexpected ${path}` }, 400);
    });
    const open = async (path) => {
      await page.goto(`${base}${path}${large ? `${path.includes("?") ? "&" : "?"}largeText=1` : ""}`);
      if (large) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    };
    await open(`/invitations?plan=${plan.id}`);
    await expect(heading(page, "Invite people")).toBeVisible();
    await expect(button(page, "Turn off this link")).toBeEnabled();
    // Privacy: the screen never shows the exact place.
    await expect(page.getByText("Flat 3, 12 Old Street")).toHaveCount(0);
    await shot("invite-people-empty");
    // The Pick step with three numbers picked, one On Resbite.
    for (const [name, number] of people) {
      await page.getByLabel("Name (optional)", { exact: true }).fill(name);
      await page.getByLabel("Phone number", { exact: true }).fill(number);
      await button(page, "Add").click();
    }
    await expect(page.getByRole("checkbox", { name: "Ana Rivera-Castellanos, +44 7700 900123, On Resbite", exact: true })).toBeVisible();
    await expect(button(page, "Invite 3")).toBeEnabled();
    // The screen scrolls inside the app: capture its top (the picked list) and its end (GI1's Event link).
    await heading(page, "Invite people").scrollIntoViewIfNeeded();
    await shot("invite-people");
    await button(page, "Turn off this link").scrollIntoViewIfNeeded();
    await shot("invite-people-end");
    // Almost there: Ana in the app; Ben and Cy with WhatsApp and Messages, Ben's already sent.
    await button(page, "Invite 3").click();
    await expect(heading(page, "Almost there")).toBeVisible();
    await button(page, "WhatsApp: Ben Okafor").click();
    await expect(page.getByText("Sent on WhatsApp", { exact: true })).toBeVisible();
    await shot("invite-people-almost");
    await open(`/event?plan=${plan.id}`);
    await expect(heading(page, "Film club: Paris, Texas")).toBeVisible();
    await button(page, "2 going, 1 maybe").click();
    await expect(heading(page, "Guests")).toBeVisible();
    await expect(button(page, "Remove Alex Rivera")).toBeVisible();
    await shot("event-guests-remove", false);
    // The Invited group, below the guests: Send again and Remove for each personal link.
    await heading(page, "Invited").scrollIntoViewIfNeeded();
    await expect(button(page, "Remove Cy Lindqvist")).toBeVisible();
    await expect(visible(page.getByRole("button", { name: "Send again", exact: true }))).toHaveCount(2);
    await shot("event-guests-invited", false);
    // My resbites with Jo's invitation under Invitations.
    await open("/plans");
    await expect(heading(page, "Invitations")).toBeVisible();
    await expect(button(page, /^Jo invited you, Board games at the café, /)).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Your answer to Board games at the café", exact: true })).toBeVisible();
    await shot("plans-invitations");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  // GI2, a signed-out guest against a local stub: the account screen unticked and ticked, the Code step, the Name
  // step and a dead link, at 390 and 320 px and under Larger Text at 320 px, with nothing wider than the screen.
  for (const [width, large] of [[390, false], [320, false], [320, true]]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce", timezoneId: "Europe/London" });
    await quietReminders(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const suffix = large ? "large-320" : String(width);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const clipped = (target = page) =>
      target.evaluate(() =>
        [...document.querySelectorAll("[role=button],[role=checkbox],[role=heading],h1,h2,h3,input,textarea")]
          .filter((el) => !el.closest("[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.left < -1 || b.right > window.innerWidth + 1;
          })
          .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
      );
    const visit = async (name, title) => {
      await expect(heading(page, title)).toBeVisible();
      assert.ok(await fits(), `${name} fits at ${suffix}`);
      assert.deepEqual(await clipped(), [], `${name} has nothing clipped at ${suffix}`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-${suffix}.png`, fullPage: true });
      // Larger Text moves the footer into the scroll: capture its end too.
      if (large) {
        await page.mouse.move(width / 2, 400);
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/${name}-${suffix}-end.png` });
      }
    };
    // A confirmed phone: the Name step follows the code (without one, Add your number would, as verify-phone checks).
    const user = { id: "66666666-6666-4666-8666-666666666666", aud: "authenticated", role: "authenticated", email: "guest@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", phone: "447700900835", phone_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const jwt = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
      "local-fixture-only",
    ].join(".");
    let signedIn = false;
    await page.route("**/*.supabase.co/**", (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/rest/v1/rpc/invitation_page")
        return reply(
          req.postDataJSON().p_code === "DeadDeadDeadDeadDead_8"
            ? { state: "inactive" }
            : { state: "open", host: "Stephen", title: "Film club: Paris, Texas", starts_at: "2099-10-23T18:30:00Z", time_zone: "Europe/London" },
        );
      if (path === "/rest/v1/rpc/note_link_open") return route.fulfill({ status: 204, body: "" });
      if (path === "/auth/v1/otp") return reply({});
      if (path === "/auth/v1/verify") {
        signedIn = true;
        return reply({ access_token: jwt, refresh_token: "local-fixture", token_type: "bearer", expires_at: expiry, expires_in: 3600, user });
      }
      if (path === "/auth/v1/user") return signedIn ? reply(user) : reply({ message: "No session" }, 401);
      if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "access_pending" });
      if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
      return reply({ message: `Unexpected ${path}` }, 400);
    });
    const open = async (path) => {
      await page.goto(`${base}${path}${large ? "&largeText=1" : ""}`);
      if (large) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    };
    await open("/invite?code=GuestGuestGuestGuest_5");
    await expect(page.getByText("Stephen invited you", { exact: true })).toBeVisible();
    await expect(button(page, "Continue with email")).toBeDisabled();
    await visit("guest-unticked", "Create your account to reply");
    await page.getByRole("checkbox", { name: "I’m 18 or over", exact: true }).click();
    await expect(button(page, "Continue with email")).toBeEnabled();
    await visit("guest-ticked", "Create your account to reply");
    await button(page, "Continue with email").click();
    await page.getByLabel("Email", { exact: true }).fill("guest@example.invalid");
    await button(page, "Send code").click();
    await visit("guest-code", "Check your email");
    await page.getByLabel("6-digit code", { exact: true }).fill("123456");
    await visit("guest-name", "What’s your name?");
    await page.close();
    if (errors.length) throw Error(errors.join("\n"));
    // A dead link, signed out.
    const dead = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    dead.on("pageerror", (e) => errors.push(e.message));
    dead.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await dead.route("**/*.supabase.co/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/rest/v1/rpc/invitation_page")
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "inactive" }) });
      if (path === "/rest/v1/rpc/note_link_open") return route.fulfill({ status: 204, body: "" });
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "No session" }) });
    });
    await dead.goto(`${base}/invite?code=DeadDeadDeadDeadDead_8${large ? "&largeText=1" : ""}`);
    if (large) await dead.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await expect(heading(dead, "This invitation is no longer active.")).toBeVisible();
    await expect(button(dead, "Go to Resbite")).toBeVisible();
    assert.ok(await dead.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `guest-inactive fits at ${suffix}`);
    assert.deepEqual(await clipped(dead), [], `guest-inactive has nothing clipped at ${suffix}`);
    await dead.waitForTimeout(500);
    await dead.screenshot({ path: `${out}/guest-inactive-${suffix}.png`, fullPage: true });
    if (errors.length) throw Error(errors.join("\n"));
    await dead.close();
  }
  // Phone accounts against a local stub, at 390 and 320 px and under Larger Text at 320 px, with nothing wider than the
  // screen: sign-up's number step with the 18+ tick and its code step, phone sign-in, About you, and Add your number
  // with its "taken" refusal. Stored phones are digits-only, as in auth.users.
  for (const [width, large] of [[390, false], [320, false], [320, true]]) {
    const suffix = large ? "large-320" : String(width);
    const errors = [];
    const taken = "+447700900111";
    /** A page signed in as `user` (or signed out), its Supabase requests answered here. */
    const phonePage = async (user = null, status = "access_pending") => {
      // en-GB: the number field reads local numbers as GB, as on a GB phone.
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", locale: "en-GB", timezoneId: "Europe/London" });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        // The taken number's 422 is the refusal under capture.
        if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 422/.test(m.text())) errors.push(m.text());
      });
      if (user) {
        const expiry = Math.floor(Date.now() / 1000) + 3600;
        const jwt = [
          Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
          Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
          "local-fixture-only",
        ].join(".");
        const session = { access_token: jwt, refresh_token: "local-fixture", token_type: "bearer", expires_at: expiry, expires_in: 3600, user };
        await page.addInitScript((session) => sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session)), session);
      }
      await page.route("**/*.supabase.co/**", (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        const reply = (body, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
        if (path === "/auth/v1/otp") return reply({});
        if (path === "/auth/v1/user" && user && req.method() === "GET") return reply(user);
        if (path === "/auth/v1/user" && user && req.method() === "PUT")
          return req.postDataJSON().phone === taken
            ? reply({ code: 422, error_code: "phone_exists", msg: "A user with this phone number has already been registered" }, 422)
            : reply({ ...user, new_phone: req.postDataJSON().phone.slice(1) });
        if (path === "/rest/v1/rpc/account_access_status" && user) return reply({ account_id: user.id, status });
        if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
        if (path === "/rest/v1/profiles") return reply({ id: user.id, display_name: "Stephen", avatar_path: null, avatar_revision: 0 });
        errors.push(`Unexpected ${req.method()} ${path}`);
        return reply({ message: `Unexpected ${path}` }, 400);
      });
      return page;
    };
    const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const clipped = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll("[role=button],[role=checkbox],[role=heading],h1,h2,h3,input,textarea")]
          .filter((el) => !el.closest("[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.left < -1 || b.right > window.innerWidth + 1;
          })
          .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
      );
    const open = async (page, path) => {
      await page.goto(`${base}${path}${large ? `${path.includes("?") ? "&" : "?"}largeText=1` : ""}`);
      if (large) await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    };
    const visit = async (page, name, title) => {
      await expect(heading(page, title)).toBeVisible();
      assert.ok(await fits(page), `${name} fits at ${suffix}`);
      assert.deepEqual(await clipped(page), [], `${name} has nothing clipped at ${suffix}`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-${suffix}.png`, fullPage: true });
      // Larger Text moves the footer into the scroll: capture its end too.
      if (large) {
        await page.mouse.move(width / 2, 400);
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/${name}-${suffix}-end.png` });
      }
    };
    // Sign-up: the number with the tick given, then the code step. Sign-in has no tick.
    const signedOut = await phonePage();
    await open(signedOut, "/auth/phone");
    await signedOut.getByLabel("Mobile number", { exact: true }).fill("07700 900834");
    await signedOut.getByRole("checkbox", { name: "I’m 18 or over", exact: true }).click();
    await expect(button(signedOut, "Send code")).toBeEnabled();
    await visit(signedOut, "phone-signup", "Your number");
    await button(signedOut, "Send code").click();
    await expect(signedOut.getByText("We sent a 6-digit code to +44 7700 900834.", { exact: true })).toBeVisible();
    await visit(signedOut, "phone-code", "Enter the code");
    await open(signedOut, "/auth/phone?intent=signin");
    await expect(signedOut.getByRole("checkbox")).toHaveCount(0);
    await visit(signedOut, "phone-signin", "Sign in");
    await signedOut.context().close();
    // About you: a verified number and no name yet.
    const nameless = await phonePage({
      id: "77777777-7777-4777-8777-777777777777", aud: "authenticated", role: "authenticated", email: "",
      phone: "447700900834", phone_confirmed_at: "2026-10-27T09:00:00Z",
      app_metadata: { provider: "phone", providers: ["phone"] }, user_metadata: {}, created_at: "2026-10-27T09:00:00Z",
    });
    await open(nameless, "/");
    await visit(nameless, "about-you", "About you");
    await nameless.context().close();
    // Add your number: an approved email account without a phone, then a number another account holds.
    const phoneless = await phonePage(
      {
        id: "88888888-8888-4888-8888-888888888888", aud: "authenticated", role: "authenticated", email: "stephen@example.invalid",
        email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { display_name: "Stephen" }, created_at: "2026-01-01T00:00:00Z",
      },
      "approved",
    );
    await open(phoneless, "/");
    await visit(phoneless, "add-phone", "Add your number");
    await phoneless.getByLabel("Mobile number", { exact: true }).fill("07700 900111");
    await button(phoneless, "Send code").click();
    await expect(
      phoneless.getByText(
        "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help.",
        { exact: true },
      ),
    ).toBeVisible();
    // Plan 2: the offer to bring in the web-only account that holds it, with its own Send code above the screen's.
    await expect(
      phoneless.getByText("This number answered an invitation on the web. Confirm it with a code to bring its resbites here.", { exact: true }),
    ).toBeVisible();
    await expect(button(phoneless, "Change number")).toBeVisible();
    await expect(button(phoneless, "Sign out")).toBeVisible();
    await visit(phoneless, "add-phone-taken", "Add your number");
    // The offer's code step (the code goes to the web account; verify-contact-invites checks the fold itself).
    await button(phoneless, "Send code").first().click();
    await expect(phoneless.getByText("We sent a 6-digit code to +44 7700 900111.", { exact: true })).toBeVisible();
    await visit(phoneless, "add-phone-fold-code", "Enter the code");
    await phoneless.context().close();
    if (errors.length) throw Error(errors.join("\n"));
  }
  console.log(
    "PASS: every UX1, UX3 and UX4 screen at 390/320 px, UX3 and UX4 under Larger Text at 320 px, the Where step with an Area, Invite people (Pick with three numbers and On Resbite, Almost there, GI1's Event link), the Guests sheet with Remove and the Invited group, My resbites with an Invitations card (390/320 and Larger Text at 320 px, nothing wider than the screen or clipped), GI2's guest account screen unticked and ticked, its Code and Name steps and a dead link, and phone sign-up (number with the tick, code), phone sign-in, About you, and Add your number with its taken-number refusal, the fold offer and its code step (390/320 and Larger Text at 320 px, nothing wider than the screen or clipped), gluestack keyboard selection, no console/page errors. Screenshots: " + out,
  );
} finally {
  await browser.close();
}
