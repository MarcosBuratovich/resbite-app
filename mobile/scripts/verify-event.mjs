// UX1 event page for both roles. Every Supabase request is intercepted; nothing is sent.
// UX3: Meeting details in all three roles, the Note to guests, Add to calendar and reminders (on the
// development fakes, `__resbiteDevice`), and the "Can’t go" wording.
// Plan 2: the organizer's Invited group (people invited by personal link who haven't answered) with WhatsApp, Messages and
// Remove, and an unanswered invitation's card under Invitations on My resbites.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { inOrder, quietReminders, visible } from "./qa-helpers.mjs";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
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
const hosted = {
  id: "22222222-2222-4222-8222-222222222222",
  activity_id: "coffee-together",
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
  owner_id: user.id,
  starts_at: "2099-03-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Fixture café",
  area: "",
  // The fixture keeps Meeting details on the plan; the stub sends them only to people who may read them.
  note: "Window table",
  status: "active",
  version: 1,
  cover_path: null,
  cover_revision: 0,
  cover_description: "",
  guest_note: "",
  guest_note_at: null,
};
const invited = {
  ...hosted,
  id: "44444444-4444-4444-8444-444444444444",
  title: "Board games",
  owner_id: "33333333-3333-4333-8333-333333333333",
  place_label: "Games room",
  // GI1: the area stands in for the exact place until the invitee answers.
  area: "Near the station",
  note: "Gate code 4512",
  cover_path: "33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/a.jpg",
  cover_revision: 1,
  cover_description: "Two mugs on a window sill",
  guest_note: "Bring a blanket",
  guest_note_at: "2099-02-28T09:41:00Z",
};
const edited = {
  ...hosted,
  id: "55555555-5555-4555-8555-555555555555",
  title: "Picnic",
  description: "",
  place_label: "Park",
  note: "",
};
const closed = { ...invited, id: "66666666-6666-4666-8666-666666666666", title: "Closed games", status: "cancelled" };
// An invitation with no Meeting details: nothing to unlock, so no locked line.
const quiz = {
  ...invited,
  id: "77777777-7777-4777-8777-777777777777",
  title: "Quiz night",
  note: "",
  guest_note: "",
  guest_note_at: null,
  cover_path: null,
  cover_description: "",
};
// The organizer's event with an end, for reminders and the calendar.
const lunch = {
  ...hosted,
  id: "88888888-8888-4888-8888-888888888888",
  title: "Garden lunch",
  description: "",
  place_label: "Rose garden",
  note: "Door code 4521",
  ends_at: "2099-03-01T17:00:00Z",
};
const LOCKED = "Meeting details appear after you answer Going or Maybe.";
// Plan 2: the organizer's personal links for Coffee evening. Pat's code is on this phone (sent on Messages); the
// second number's isn't (the host changed phones); the third has answered, so it isn't in the Invited group.
const PAT = { phone: "447700900222", e164: "+447700900222", name: "Pat Lee", code: "PatCodePatCodePatCode1" };
const UNSTORED = { phone: "447700900333", e164: "+447700900333", label: "+44 7700 900333" };
const CODE_STORE = `resbite.invite-codes.v1.${user.id}`;
const PERSONAL_CODE = /^[A-Za-z0-9_-]{22}$/;
const GET_REMINDERS =
  "Resbite can remind you 1 day and 1 hour before your resbites. Reminders are set on this phone, and only show the name and time.";
/** Brings the page back to the foreground: the event and this phone's reminder state are read again. */
const foreground = (page) =>
  page.evaluate(() => {
    for (const state of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
/** After an InfoSheet closes, wait until its Modal has gone before the next tap. */
const sheetClosed = (page) => expect(page.getByRole("button", { name: "Close sheet", exact: true })).toHaveCount(0);
/** The development fake's reminders for one event, soonest first. */
const remindersFor = (page, planId) =>
  page.evaluate((id) => globalThis.__resbiteDevice.reminders.filter((r) => r.id.includes(id)), planId);
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  // This context isn't about reminders: the permission is answered "denied" up front, so nothing asks.
  await quietReminders(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const init = (s) => {
    sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(s));
    window.open = (url) => {
      if (window.__blockOpen) throw new Error("Fixture: Maps blocked");
      window.__opened = String(url);
      return null;
    };
  };
  await page.addInitScript(init, session);
  // The organizer's phone keeps Pat's personal code; the app's own writes are kept across reloads.
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: CODE_STORE, value: { [hosted.id]: { [PAT.e164]: { code: PAT.code, name: PAT.name, sentVia: "messages" } } } },
  );
  const plans = new Map([
    [hosted.id, { ...hosted }],
    [invited.id, { ...invited }],
    [edited.id, { ...edited }],
    [closed.id, { ...closed }],
    [quiz.id, { ...quiz }],
    [lunch.id, { ...lunch }],
  ]);
  let attendee = { version: 1, response: "pending" };
  let failGuests = false;
  let failNextGuestList = false;
  // An unconfirmed cancel: the RPC fails and so does the read that would confirm it.
  let failCancel = false,
    failPlanRead = false,
    planReads = 0;
  const responses = [];
  const cancels = [];
  const edits = [];
  const editBodies = [];
  const noteBodies = [];
  let failNote = false;
  // GI1: guests the organizer removed, and whether the next removal's reply is lost.
  const removed = new Set();
  const removeBodies = [];
  let failRemove = false;
  // Plan 2: Coffee evening's phone invitations, and the invite and revoke calls the organizer makes.
  const phoneInvites = [
    { phone: PAT.phone, country: "44", answered: false, response: null },
    { phone: UNSTORED.phone, country: "44", answered: false, response: null },
    { phone: "447700900444", country: "44", answered: true, response: "accepted" },
  ];
  const inviteBodies = [];
  const revokeBodies = [];
  // UX3: Meeting details live in their own table, which the database sends only to the organizer and
  // Going or Maybe guests; every invitee may know some exist. The plans row's own note is always "".
  const asRow = (plan) => {
    const insider = plan.owner_id === user.id || ["accepted", "maybe"].includes(attendee.response);
    return {
      ...plan,
      note: "",
      has_meeting_details: Boolean(plan.note),
      plan_meeting_details: insider && plan.note ? { note: plan.note } : null,
    };
  };
  const stub = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles") {
      // My resbites reads its invitations' hosts together.
      if (url.searchParams.get("id")?.startsWith("in."))
        return reply(url.searchParams.get("id").includes(invited.owner_id) ? [{ id: invited.owner_id, display_name: "Jo" }] : []);
      // The invited event's organizer; any other read is the signed-in fixture's own profile.
      if (url.searchParams.get("id") === `eq.${invited.owner_id}`) return reply({ display_name: "Jo" });
      return reply({ id: user.id, display_name: "Fixture", avatar_path: null, avatar_revision: 0 });
    }
    // Cover links are not under test here; the picture falls back while its label stays.
    if (path.startsWith("/storage/v1/object/sign/")) return reply({ message: "Fixture: no signed links" }, 400);
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/plans") {
      planReads++;
      if (failPlanRead) {
        failPlanRead = false;
        return reply({ message: "Fixture: plan read unavailable" }, 500);
      }
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const rows = [...plans.values()].filter((p) => !id || p.id === id).map(asRow);
      return reply(one ? (rows[0] ?? null) : rows);
    }
    if (path === "/rest/v1/attendees") {
      if (one) return reply(attendee);
      // The reminder sync's read of the person's own answers: the one fixture answer, on every invitation.
      if (url.searchParams.get("select") === "plan_id,response")
        return reply(
          [...plans.values()]
            .filter((p) => p.owner_id !== user.id)
            .map((p) => ({ plan_id: p.id, response: attendee.response })),
        );
      // My resbites' read (no plan filter): here, the person's own answer (and its version) on each invitation.
      if (url.searchParams.get("select") === "plan_id,user_id,response,version,profiles(display_name)" && !url.searchParams.has("plan_id"))
        return reply(
          [...plans.values()]
            .filter((p) => p.owner_id !== user.id)
            .map((p) => ({
              plan_id: p.id,
              user_id: user.id,
              response: attendee.response,
              version: attendee.version,
              profiles: { display_name: "Fixture" },
            })),
        );
      // 500, not 503: postgrest-js retries a 503 GET with backoff.
      if (failGuests) return reply({ message: "Fixture: guest list unavailable" }, 500);
      if (failNextGuestList) {
        failNextGuestList = false;
        return reply({ message: "Fixture: guest list unavailable" }, 500);
      }
      const planId = url.searchParams.get("plan_id")?.replace(/^eq\./, "");
      const own = { user_id: user.id, response: attendee.response, profiles: { display_name: "Fixture" } };
      // The server shows an unanswered invitee only their own row (UX-P5).
      return reply(
        planId === hosted.id
          ? [
              { user_id: "g1", response: "accepted", profiles: { display_name: "Alex" } },
              { user_id: "g2", response: "pending", profiles: { display_name: "Bea" } },
              { user_id: "g3", response: "maybe", profiles: { display_name: "Cy" } },
              { user_id: "g4", response: "withdrawn", profiles: { display_name: "Di" } },
            ].filter((row) => !removed.has(row.user_id))
          : attendee.response === "pending"
            ? [own]
            : [own, { user_id: "g1", response: "accepted", profiles: { display_name: "Alex" } }],
      );
    }
    if (path === "/rest/v1/rpc/respond") {
      const body = req.postDataJSON();
      responses.push(body.p_response);
      assert.equal(body.p_version, attendee.version);
      attendee = { version: attendee.version + 1, response: body.p_response };
      return reply(attendee.version);
    }
    if (path === "/rest/v1/rpc/remove_guest") {
      const body = req.postDataJSON();
      removeBodies.push(body);
      if (failRemove) {
        failRemove = false;
        return reply({ message: "Fixture: remove reply lost" }, 500);
      }
      removed.add(body.p_user);
      return reply(null);
    }
    // Plan 2: the organizer's personal links (Coffee evening only; the other events have none).
    if (path === "/rest/v1/rpc/plan_phone_invitations") {
      const body = req.postDataJSON();
      return reply(body.p_plan === hosted.id ? phoneInvites : []);
    }
    if (path === "/rest/v1/rpc/invite_contacts") {
      const body = req.postDataJSON();
      inviteBodies.push(body);
      return reply(body.p_invites.map(({ phone }) => ({ phone, kind: "link" })));
    }
    if (path === "/rest/v1/rpc/revoke_phone_invitation") {
      const body = req.postDataJSON();
      revokeBodies.push(body);
      phoneInvites.splice(phoneInvites.findIndex((i) => i.phone === body.p_phone), 1);
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/rest/v1/rpc/set_guest_note") {
      const body = req.postDataJSON();
      noteBodies.push(body);
      if (failNote) {
        failNote = false;
        return reply({ code: "22023", message: "Fixture: this resbite has ended" }, 400);
      }
      // The note never changes the event's version.
      const plan = plans.get(body.p_plan);
      plan.guest_note = body.p_note;
      plan.guest_note_at = body.p_note ? new Date().toISOString() : null;
      return reply({ guest_note: plan.guest_note, guest_note_at: plan.guest_note_at });
    }
    if (path === "/rest/v1/rpc/change_plan_v3") {
      const body = req.postDataJSON();
      const plan = plans.get(body.p_plan);
      if (body.p_cancel) {
        if (failCancel) {
          failCancel = false;
          failPlanRead = true;
          return reply({ message: "Fixture: cancel reply lost" }, 500);
        }
        cancels.push(body.p_plan);
        plan.status = "cancelled";
        plan.version++;
        return reply(plan.version);
      }
      assert.equal(body.p_version, plan.version);
      edits.push(body.p_plan);
      editBodies.push(body);
      Object.assign(plan, {
        title: body.p_title.trim(),
        description: body.p_description,
        categories: body.p_categories,
        starts_at: body.p_start,
        ends_at: body.p_ends,
        time_zone: body.p_zone,
        place_label: body.p_place.trim(),
        note: body.p_note,
        area: body.p_area ?? plan.area,
        version: plan.version + 1,
      });
      return reply(plan.version);
    }
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  };
  await page.route("**/*.supabase.co/**", stub);

  // Organizer.
  await page.goto(`${base}/event?plan=${hosted.id}`);
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  await expect(page.getByText("Hosting", { exact: true })).toBeVisible();
  await expect(page.getByText("Bring a book", { exact: true })).toBeVisible();
  // The organizer sees the exact place. GI-D3: no Choose people entry (People stays on Profile).
  await expect(page.getByText("Fixture café", { exact: true })).toBeVisible();
  await expect(page.getByText("Exact address after you reply", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite someone", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose people", exact: true })).toHaveCount(0);
  // Guests (UX2): the stack counts Going and Maybe; the sheet groups every answer.
  await page.getByRole("button", { name: "1 going, 1 maybe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Guests", exact: true })).toBeVisible();
  for (const group of ["Going", "Maybe", "Can’t go", "Not answered yet"])
    await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
  await expect(page.getByText("Bea", { exact: true })).toBeVisible();
  await expect(page.getByText("Can’t go now", { exact: true })).toBeVisible();
  // GI1: the organizer removes a guest, after a question; Keep changes nothing.
  for (const name of ["Alex", "Bea", "Cy", "Di"])
    await expect(page.getByRole("button", { name: `Remove ${name}`, exact: true })).toBeVisible();
  let removeAsked = "";
  page.once("dialog", (dialog) => {
    removeAsked = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Remove Bea", exact: true }).click();
  await expect
    .poll(() => removeAsked)
    .toBe("Remove Bea from this resbite? They can join again with the link unless you turn it off.");
  await page.waitForTimeout(200);
  assert.deepEqual(removeBodies, []);
  // A lost reply says so in the sheet; Bea stays listed until a removal is confirmed.
  failRemove = true;
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Remove Bea", exact: true }).click();
  await expect(
    page.getByText("Couldn’t confirm this guest was removed. Check your connection and try again.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Bea", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Remove Bea", exact: true }).click();
  await expect(page.getByText("Bea", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Not answered yet", exact: true })).toHaveCount(0);
  assert.deepEqual(removeBodies, [
    { p_plan: hosted.id, p_user: "g2" },
    { p_plan: hosted.id, p_user: "g2" },
  ]);
  // Plan 2: the Invited group, after the guests: the two who haven't answered, by the name kept on this phone or
  // their number; the one who answered isn't listed. Each row offers WhatsApp and Messages (as Almost there does),
  // the one used last first: Messages for Pat, whose link went that way; WhatsApp for the number with no code here.
  const resend = (app, who) => page.getByRole("button", { name: `Send again on ${app}: ${who}`, exact: true });
  await expect(page.getByRole("heading", { name: "Invited", exact: true })).toBeVisible();
  await expect(page.getByText(PAT.name, { exact: true })).toBeVisible();
  await expect(page.getByText(UNSTORED.label, { exact: true })).toBeVisible();
  await expect(page.getByText("+44 7700 900444", { exact: true })).toHaveCount(0);
  for (const who of [PAT.name, UNSTORED.label])
    for (const app of ["WhatsApp", "Messages"]) await expect(visible(resend(app, who))).toHaveCount(1);
  await expect(visible(page.getByRole("button", { name: "Send again", exact: true }))).toHaveCount(0);
  assert.ok(
    await inOrder(page, [
      page.getByRole("heading", { name: "Maybe", exact: true }),
      page.getByRole("heading", { name: "Invited", exact: true }),
      page.getByText(PAT.name, { exact: true }),
      resend("Messages", PAT.name),
      resend("WhatsApp", PAT.name),
      page.getByText(UNSTORED.label, { exact: true }),
      resend("WhatsApp", UNSTORED.label),
      resend("Messages", UNSTORED.label),
    ]),
    "the Invited group follows the guests, each row's last-used app first",
  );
  // Send again with the code on this phone, by Messages and then by WhatsApp: the same link both ways. Nothing is invited.
  await resend("Messages", PAT.name).click();
  await expect.poll(() => page.evaluate(() => window.__opened ?? null)).toMatch(/^sms:/);
  const patText = decodeURIComponent((await page.evaluate(() => window.__opened)).replace(`sms:${PAT.e164}?body=`, ""));
  assert.match(patText, new RegExp(`^Fixture invited you to Coffee evening, .+\\. Reply here: https://[a-z0-9.-]+/i/${PAT.code}$`));
  await page.evaluate(() => (window.__opened = null));
  await resend("WhatsApp", PAT.name).click();
  await expect.poll(() => page.evaluate(() => window.__opened ?? null)).toMatch(/^whatsapp:/);
  const patWhatsapp = await page.evaluate(() => window.__opened);
  assert.ok(patWhatsapp.startsWith(`whatsapp://send?phone=${PAT.phone}&text=`), patWhatsapp);
  assert.match(decodeURIComponent(patWhatsapp), new RegExp(`/i/${PAT.code}$`));
  assert.deepEqual(inviteBodies, []);
  // Send again without a code on this phone, where WhatsApp won't open: a fresh code for that one number, kept here,
  // then "WhatsApp isn’t installed. Try Messages." with Messages right there, which sends that same new link.
  await page.evaluate(() => {
    window.__opened = null;
    window.__blockOpen = true;
  });
  await resend("WhatsApp", UNSTORED.label).click();
  await expect(page.getByText("WhatsApp isn’t installed. Try Messages.", { exact: true })).toBeVisible();
  await expect(visible(resend("Messages", UNSTORED.label))).toBeEnabled();
  assert.equal(inviteBodies.length, 1);
  const [fresh] = inviteBodies[0].p_invites;
  assert.deepEqual([inviteBodies[0].p_plan, inviteBodies[0].p_invites.length, fresh.phone, fresh.country], [hosted.id, 1, UNSTORED.phone, "44"]);
  assert.match(fresh.code, PERSONAL_CODE);
  await page.evaluate(() => (window.__blockOpen = false));
  await resend("Messages", UNSTORED.label).click();
  await expect.poll(() => page.evaluate(() => window.__opened ?? null)).toMatch(/^sms:/);
  await expect(page.getByText("WhatsApp isn’t installed. Try Messages.", { exact: true })).toHaveCount(0);
  const opened = await page.evaluate(() => window.__opened);
  assert.ok(opened.startsWith(`sms:${UNSTORED.e164}?body=`), opened);
  assert.match(decodeURIComponent(opened), new RegExp(`/i/${fresh.code}$`));
  assert.equal(inviteBodies.length, 1, "Messages sends the code just made, not another one");
  const kept = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), CODE_STORE);
  assert.deepEqual(kept[hosted.id][UNSTORED.e164], { code: fresh.code, name: UNSTORED.label, sentVia: "messages" });
  // Remove asks first, then turns the invitation off; its code leaves this phone.
  let revokeAsked = "";
  page.once("dialog", (dialog) => {
    revokeAsked = dialog.message();
    void dialog.accept();
  });
  await page.getByRole("button", { name: `Remove ${UNSTORED.label}`, exact: true }).click();
  await expect.poll(() => revokeAsked).toBe(`Remove the invitation for ${UNSTORED.label}?`);
  await expect(page.getByText(UNSTORED.label, { exact: true })).toHaveCount(0);
  await expect(page.getByText(PAT.name, { exact: true })).toBeVisible();
  for (const app of ["WhatsApp", "Messages"]) {
    await expect(visible(resend(app, UNSTORED.label))).toHaveCount(0);
    await expect(visible(resend(app, PAT.name))).toHaveCount(1);
  }
  assert.deepEqual(revokeBodies, [{ p_plan: hosted.id, p_phone: UNSTORED.phone }]);
  const left = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), CODE_STORE);
  assert.deepEqual(Object.keys(left[hosted.id]), [PAT.e164]);
  // Open in Maps below starts from nothing opened.
  await page.evaluate(() => (window.__opened = null));
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await sheetClosed(page);
  // The stack still counts Going and Maybe after the reload.
  await expect(page.getByRole("button", { name: "1 going, 1 maybe", exact: true })).toBeVisible();
  // UX3 Meeting details: the organizer sees them, with who else can.
  await expect(page.getByText("Meeting details · only Going & Maybe see this", { exact: true })).toBeVisible();
  await expect(page.getByText("Window table", { exact: true })).toBeVisible();
  await expect(page.getByText(LOCKED, { exact: true })).toHaveCount(0);
  // UX3 Note to guests: posted from a chip, then pinned with ✎ to edit or remove it.
  await expect(page.getByRole("button", { name: "Edit note to guests", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Post a note to guests", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Note to guests", exact: true })).toBeVisible();
  const noteField = page.getByLabel("Note to guests", { exact: true });
  await expect(noteField).toHaveAttribute("placeholder", "Running late, bring a blanket… (optional)");
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove note", exact: true })).toHaveCount(0);
  // Over 280 characters is refused in the sheet, before anything is sent.
  await noteField.fill(`${"x".repeat(281)}`);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText("Keep the note to 280 characters.", { exact: true })).toBeVisible();
  assert.deepEqual(noteBodies, []);
  // A refusal from the database is said in the sheet, which stays open.
  failNote = true;
  await noteField.fill("Running 10 minutes late");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(
    page.getByText("This resbite has ended or was cancelled, so its note can’t change.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await sheetClosed(page);
  await expect(page.getByText("Running 10 minutes late", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Note to guests · \d{1,2}:\d{2}$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Post a note to guests", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit note to guests", exact: true }).click();
  await expect(noteField).toHaveValue("Running 10 minutes late");
  await noteField.fill("Running 15 minutes late");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await sheetClosed(page);
  await expect(page.getByText("Running 15 minutes late", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit note to guests", exact: true }).click();
  await page.getByRole("button", { name: "Remove note", exact: true }).click();
  await sheetClosed(page);
  await expect(page.getByText("Running 15 minutes late", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Post a note to guests", exact: true })).toBeVisible();
  assert.deepEqual(
    noteBodies.map((b) => [b.p_plan, b.p_note]),
    [
      [hosted.id, "Running 10 minutes late"],
      [hosted.id, "Running 10 minutes late"],
      [hosted.id, "Running 15 minutes late"],
      [hosted.id, ""],
    ],
  );
  assert.equal(plans.get(hosted.id).version, 1, "The note never changes the event's version");
  // Open in Maps opens only when tapped, here with the place name.
  assert.equal(await page.evaluate(() => window.__opened ?? null), null);
  const maps = page.getByRole("button", { name: "Open Fixture café in Maps", exact: true });
  await maps.click();
  assert.equal(await page.evaluate(() => window.__opened), "https://maps.apple.com/?q=Fixture%20caf%C3%A9");
  // A failure to open Maps is said, never swallowed; the next successful tap clears it.
  await page.evaluate(() => {
    window.__opened = null;
    window.__blockOpen = true;
  });
  await maps.click();
  await expect(page.getByText("Couldn’t open Maps.", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.__blockOpen = false;
  });
  await maps.click();
  await expect(page.getByText("Couldn’t open Maps.", { exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.__opened), "https://maps.apple.com/?q=Fixture%20caf%C3%A9");
  // Edit opens creation at Review.
  await page.getByRole("button", { name: "Edit Coffee evening", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Looks good?", exact: true })).toBeVisible();
  await expect(visible(page.getByRole("button", { name: "Save", exact: true }))).toBeDisabled();
  await visible(page.getByRole("button", { name: "Close", exact: true })).click();
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  // Do this again: a new draft with the text, place and note, never the date or the idea; it opens at When.
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  // A quick double tap (both taps before the first copy is written) opens exactly one editor.
  await page.getByRole("button", { name: "Do this again", exact: true }).evaluate((tile) => {
    tile.click();
    tile.click();
  });
  await expect(page.getByRole("heading", { name: "When?", exact: true })).toBeVisible();
  await page.waitForTimeout(500); // a second editor would be pushed within this settle time
  await expect(page.getByTestId("step-screen")).toHaveCount(1);
  await expect(page.getByRole("progressbar", { name: "Step 2 of 4", exact: true })).toBeVisible();
  const draft = JSON.parse(
    await page.evaluate((key) => sessionStorage.getItem(key), `resbite.drafts.v1.${user.id}`),
  ).find((d) => d.key === "new");
  assert.deepEqual(
    [draft.title, draft.description, draft.categories, draft.place, draft.note, draft.start, draft.activityId, draft.pending],
    ["Coffee evening", "Bring a book", ["community", "uplifting"], "Fixture café", "Window table", "", null, null],
  );
  // The start is unset, so When says "Choose a day" and no day chip is selected (never a picked-looking
  // date that isn't set). Choosing Tomorrow and a time lets Next go on.
  await expect(visible(page.getByRole("button", { name: "Choose a day", exact: true }))).toBeVisible();
  await expect(visible(page.locator('[role="button"][aria-selected="true"]'))).toHaveCount(0);
  await visible(page.getByRole("button", { name: /^Tomorrow, / })).click();
  await expect(visible(page.getByRole("button", { name: "Choose a day", exact: true }))).toHaveCount(0);
  await visible(page.getByRole("button", { name: / at 18:00$/ })).click();
  await visible(page.getByRole("button", { name: "Next", exact: true })).click();
  await expect(page.getByRole("heading", { name: "Where?", exact: true })).toBeVisible();
  await visible(page.getByRole("button", { name: "Previous step", exact: true })).click();
  await expect(page.getByRole("heading", { name: "When?", exact: true })).toBeVisible();
  await visible(page.getByRole("button", { name: "Previous step", exact: true })).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Coffee evening");
  page.once("dialog", (dialog) => dialog.accept());
  await visible(page.getByRole("button", { name: "Close", exact: true })).click();
  // Doing it again over an unfinished new draft asks first; dismissing keeps the draft.
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  let asked = "";
  page.once("dialog", (dialog) => {
    asked = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Do this again", exact: true }).click();
  await expect.poll(() => asked).toBe("Replace the unfinished resbite draft on this device?");
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  // An unconfirmed cancel keeps what is shown and offers the organizer a refresh that reloads.
  await expect(page.getByRole("button", { name: "Refresh event", exact: true })).toHaveCount(0);
  failCancel = true;
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await page.getByRole("button", { name: "Yes, cancel plan", exact: true }).click();
  const unconfirmed =
    "We couldn’t confirm the cancellation. Check your connection and refresh before trying again.";
  await expect(page.getByText(unconfirmed, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Coffee evening", exact: true })).toBeVisible();
  const readsBeforeRefresh = planReads;
  await page.getByRole("button", { name: "Refresh event", exact: true }).click();
  await expect(page.getByText(unconfirmed, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh event", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  assert.equal(failPlanRead, false);
  assert.ok(planReads > readsBeforeRefresh, "Refresh event reloads the plan");
  assert.deepEqual(cancels, []);
  // Cancel keeps its confirmation and semantics.
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(page.getByText("Cancel this plan for everyone?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yes, cancel plan", exact: true }).click();
  await expect(page.getByText("Your plan is cancelled.", { exact: true })).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Coffee evening", exact: true })).toHaveCount(0);
  assert.deepEqual(cancels, [hosted.id]);
  console.log(
    "PASS: organizer event page: the exact place and no Choose people (GI-D3); guests (GI1: Remove asks first and says they can rejoin by the link, says a lost reply, reloads the list; invitees have no Remove); the Invited group (Plan 2: unanswered only, by stored name or number, WhatsApp and Messages on each row with the last-used first, the stored code either way or a fresh one kept for the other app when WhatsApp won't open, Remove calls revoke_phone_invitation), Open in Maps (and its failure note), Edit at Review, Do this again at When with a replace guard, an unconfirmed cancel with Refresh event, cancel.",
  );

  // UX2-D1: a saved edit returns to its event page with "Changes saved"; Back then leaves for My resbites.
  // Edited from a device in another zone: a title-only edit must keep the event's stored zone and instant.
  const tokyo = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    timezoneId: "Asia/Tokyo",
  });
  await quietReminders(tokyo);
  const tPage = await tokyo.newPage();
  tPage.on("pageerror", (e) => errors.push(e.message));
  await tPage.addInitScript(init, session);
  await tPage.route("**/*.supabase.co/**", stub);
  await tPage.goto(`${base}/event?plan=${edited.id}`);
  await expect(tPage.getByRole("heading", { name: "Picnic", exact: true })).toBeVisible();
  await tPage.getByRole("button", { name: "Edit Picnic", exact: true }).click();
  await expect(tPage.getByRole("heading", { name: "Looks good?", exact: true })).toBeVisible();
  await visible(tPage.getByRole("button", { name: "Edit name, Picnic", exact: true })).click();
  await visible(tPage.getByLabel("Name", { exact: true })).fill("Picnic by the lake");
  await visible(tPage.getByRole("button", { name: "Done", exact: true })).click();
  await expect(tPage.getByRole("heading", { name: "Looks good?", exact: true })).toBeVisible();
  await visible(tPage.getByRole("button", { name: "Save", exact: true })).click();
  await expect(tPage.getByRole("heading", { name: "Picnic by the lake", exact: true })).toBeVisible();
  await expect(tPage.getByText("Changes saved", { exact: true })).toBeVisible();
  await expect(tPage).toHaveURL(new RegExp(`/event\\?plan=${edited.id}`));
  assert.deepEqual(edits, [edited.id]);
  assert.equal(editBodies[0].p_zone, "UTC");
  assert.equal(Date.parse(editBodies[0].p_start), Date.parse(edited.starts_at));
  await tPage.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tPage.getByRole("heading", { name: "My resbites", exact: true })).toBeVisible();
  await expect(tPage.getByText("Changes saved", { exact: true })).toHaveCount(0);
  await tokyo.close();
  console.log("PASS: a saved edit returns to its event page with Changes saved; Back goes to My resbites; a title-only edit from another time zone keeps the stored zone and instant.");

  // An unanswered invitee on a closed event sees the organizer and the closed note, not "Answer to see who’s coming".
  await page.goto(`${base}/event?plan=${closed.id}`);
  await expect(page.getByRole("heading", { name: "Closed games", exact: true })).toBeVisible();
  await expect(
    page.getByText("This plan is cancelled or has already started. Responses are closed.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Jo is organizing", { exact: true })).toBeVisible();
  await expect(page.getByText("Answer to see who’s coming", { exact: true })).toHaveCount(0);
  // Its Meeting details can't be unlocked any more, so the locked line isn't offered.
  await expect(page.getByText(LOCKED, { exact: true })).toHaveCount(0);
  // GI1: the exact place stays hidden (the area shows); no answer can bring it now, so no hint and no Maps.
  await expect(page.getByText("Near the station", { exact: true })).toBeVisible();
  await expect(page.getByText("Games room", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Exact address after you reply", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /in Maps$/ })).toHaveCount(0);

  // An invitation with no Meeting details shows no locked line.
  await page.goto(`${base}/event?plan=${quiz.id}`);
  await expect(page.getByRole("heading", { name: "Quiz night", exact: true })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Your answer", exact: true })).toBeVisible();
  await expect(page.getByText(LOCKED, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Meeting details/)).toHaveCount(0);

  // Invitee. A failed guest read makes the whole event unavailable, never a partial page; Refresh recovers.
  failGuests = true;
  await page.goto(`${base}/event?plan=${invited.id}`);
  await expect(
    page.getByText(
      "This invitation is unavailable, or its details could not be refreshed. Check your connection and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Board games", exact: true })).toHaveCount(0);
  failGuests = false;
  await page.getByRole("button", { name: "Refresh invitation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Board games", exact: true })).toBeVisible();
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();
  // Before answering (UX-P5): the organizer only, never other guests or counts.
  await expect(page.getByText("Answer to see who’s coming", { exact: true })).toBeVisible();
  await expect(page.getByText("Jo is organizing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /going/ })).toHaveCount(0);
  // The organizer's photo description labels the picture.
  await expect(page.getByRole("img", { name: "Two mugs on a window sill", exact: true })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Your answer", exact: true })).toBeVisible();
  // GI1: before answering, the area stands in for the exact place, with the hint and no Open in Maps.
  await expect(page.getByText("Near the station", { exact: true })).toBeVisible();
  await expect(page.getByText("Games room", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Exact address after you reply", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /in Maps$/ })).toHaveCount(0);
  // UX3: the pinned Note to guests is for everyone; only the organizer can change it.
  await expect(page.getByText("Bring a blanket", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Note to guests · /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit note to guests", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Post a note to guests", exact: true })).toHaveCount(0);
  // Before answering, Meeting details are locked (the database doesn't send them) and there's no calendar.
  await expect(page.getByText(LOCKED, { exact: true })).toBeVisible();
  await expect(page.getByText("Gate code 4512", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to calendar", exact: true })).toHaveCount(0);
  const going = page.getByRole("radio", { name: "Going", exact: true });
  const maybe = page.getByRole("radio", { name: "Maybe", exact: true });
  const cant = page.getByRole("radio", { name: "Can’t go", exact: true });
  for (const option of [going, maybe, cant]) await expect(option).not.toBeChecked();
  // The answer saves, but who's coming fails to load: the answer stays, Refresh recovers.
  failNextGuestList = true;
  await maybe.click();
  await expect(page.getByText("Your response is saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Your answer is saved, but who’s coming couldn’t load. Refresh to try again.", { exact: true }),
  ).toBeVisible();
  await expect(maybe).toBeChecked();
  // The answer's confirming read brings the Meeting details, and the exact place with Open in Maps.
  await expect(page.getByText("Meeting details · Games room", { exact: true })).toBeVisible();
  await expect(page.getByText("Games room", { exact: true })).toBeVisible();
  await expect(page.getByText("Near the station", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Exact address after you reply", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Games room in Maps", exact: true })).toBeVisible();
  await expect(page.getByText("Gate code 4512", { exact: true })).toBeVisible();
  await expect(page.getByText(LOCKED, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to calendar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh invitation", exact: true }).click();
  await expect(page.getByRole("button", { name: "1 going, 1 maybe", exact: true })).toBeVisible();
  await expect(page.getByText("Answer to see who’s coming", { exact: true })).toHaveCount(0);
  // GI1: only the organizer can remove guests.
  await page.getByRole("button", { name: "1 going, 1 maybe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Guests", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await sheetClosed(page);
  // Going opens the sample chat and keeps the Meeting details; backing out after Going reads "Can’t go now"
  // and locks them again.
  await going.click();
  await expect(going).toBeChecked();
  await expect(page.getByRole("button", { name: "View sample conversation", exact: true })).toBeVisible();
  await expect(page.getByText("Gate code 4512", { exact: true })).toBeVisible();
  await expect(page.getByText("Games room", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Games room in Maps", exact: true })).toBeVisible();
  await cant.click();
  await expect(cant).toBeChecked();
  await expect(page.getByText("Can’t go now", { exact: true })).toBeVisible();
  // They answered, so the place and Maps stay after Can’t go.
  await expect(page.getByText("Games room", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Games room in Maps", exact: true })).toBeVisible();
  await expect(page.getByText(LOCKED, { exact: true })).toBeVisible();
  await expect(page.getByText("Gate code 4512", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to calendar", exact: true })).toHaveCount(0);
  // After Maybe, Can’t go is a plain decline.
  await maybe.click();
  await expect(maybe).toBeChecked();
  await expect(page.getByText("Gate code 4512", { exact: true })).toBeVisible();
  await cant.click();
  await expect(cant).toBeChecked();
  await expect(page.getByText(LOCKED, { exact: true })).toBeVisible();
  assert.deepEqual(responses, ["maybe", "accepted", "withdrawn", "maybe", "declined"]);
  // GI1 on My resbites: an unanswered invitation's card (Plan 2: under Invitations, from its host) shows the area,
  // never the place (also to VoiceOver); after Going it moves to Upcoming and shows the place.
  attendee = { version: attendee.version, response: "pending" };
  await page.goto(`${base}/plans`);
  await expect(page.getByRole("heading", { name: "Invitations", exact: true })).toBeVisible();
  const invitationCard = page.getByRole("button", { name: /^Jo invited you, Board games, / });
  const boardCard = page.getByRole("button", { name: /^Board games, / });
  await expect(invitationCard).toBeVisible();
  await expect(boardCard).toHaveCount(0);
  await expect(invitationCard).toHaveAttribute("aria-label", /, Near the station, Invited, Not answered/);
  await expect(invitationCard).not.toHaveAttribute("aria-label", /Games room/);
  await expect(invitationCard.getByText("Near the station", { exact: true })).toBeVisible();
  await expect(invitationCard.getByText("Games room", { exact: true })).toHaveCount(0);
  await invitationCard.click();
  await expect(page.getByRole("heading", { name: "Board games", exact: true })).toBeVisible();
  await going.click();
  await expect(going).toBeChecked();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My resbites", exact: true })).toBeVisible();
  await expect(invitationCard).toHaveCount(0);
  await expect(boardCard).toHaveAttribute("aria-label", /, Games room, Invited, Going/);
  await expect(boardCard.getByText("Games room", { exact: true })).toBeVisible();
  await expect(boardCard.getByText("Near the station", { exact: true })).toHaveCount(0);
  await context.close();
  console.log(
    "PASS: invitee: the organizer only before answering, Maybe, the list after answering (and its load failure), Can’t go now after Going, the photo label; the Note to guests; Meeting details locked, shown after Going or Maybe, locked again after Can’t go, and absent when there are none; GI1: the area, Exact address after you reply and no Maps before answering, the place and Maps after, on the event page and its My resbites card (under Invitations until answered, then in Upcoming).",
  );

  // UX3 reminders and Add to calendar, on the development fakes. A fresh context: the phone's permission
  // was never asked for. Times are read in UTC.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", timezoneId: "UTC" });
  const device = await phone.newPage();
  device.on("pageerror", (e) => errors.push(e.message));
  await device.addInitScript(init, session);
  await device.route("**/*.supabase.co/**", stub);
  await device.goto(`${base}/event?plan=${lunch.id}`);
  await expect(device.getByRole("heading", { name: "Garden lunch", exact: true })).toBeVisible();
  // The cover card shows the end.
  await expect(device.getByText("15:00 – 17:00", { exact: true })).toBeVisible();
  // The organizer's first visit asks once, before iPhone's prompt.
  await expect(device.getByRole("heading", { name: "Get reminders?", exact: true })).toBeVisible();
  await expect(device.getByText(GET_REMINDERS, { exact: true })).toBeVisible();
  await device.getByRole("button", { name: "Allow reminders", exact: true }).click();
  await sheetClosed(device);
  assert.equal(await device.evaluate(() => globalThis.__resbiteDevice.permission), "granted");
  const remindersOn = device.getByRole("button", { name: "Reminders on, 1 day and 1 hour before", exact: true });
  await expect(remindersOn).toBeVisible();
  // Two reminders, 1 day and 1 hour before: the name and time only, never the place or Meeting details.
  await expect
    .poll(() => remindersFor(device, lunch.id))
    .toEqual([
      { id: `resbite-reminder:${lunch.id}:1d`, at: "2099-02-28T15:00:00.000Z", body: "Tomorrow at 15:00 · Garden lunch" },
      { id: `resbite-reminder:${lunch.id}:1h`, at: "2099-03-01T14:00:00.000Z", body: "In 1 hour · Garden lunch" },
    ]);
  // Reminders off for this event only, then on again.
  await remindersOn.click();
  await expect(device.getByRole("button", { name: "Reminders off", exact: true })).toBeVisible();
  await expect.poll(() => remindersFor(device, lunch.id)).toEqual([]);
  await device.getByRole("button", { name: "Reminders off", exact: true }).click();
  await expect(remindersOn).toBeVisible();
  await expect.poll(async () => (await remindersFor(device, lunch.id)).length).toBe(2);
  // Add to calendar fills iPhone's form: the name, start and end, the place, no alert, never the Meeting details.
  const calendar = () =>
    device.evaluate(() =>
      globalThis.__resbiteDevice.calendar.map((e) => ({
        ...e,
        startDate: e.startDate.toISOString(),
        endDate: e.endDate.toISOString(),
      })),
    );
  await device.getByRole("button", { name: "Add to calendar", exact: true }).click();
  await expect.poll(async () => (await calendar()).length).toBe(1);
  assert.deepEqual((await calendar())[0], {
    title: "Garden lunch",
    startDate: "2099-03-01T15:00:00.000Z",
    endDate: "2099-03-01T17:00:00.000Z",
    location: "Rose garden",
    notes: "Added from Resbite",
    alarms: [],
  });
  assert.ok(!JSON.stringify(await calendar()).includes("Door code"), "No Meeting details in calendars");
  // The organizer moves it: the chip offers Update calendar, and the reminders move too.
  Object.assign(plans.get(lunch.id), { starts_at: "2099-03-01T16:00:00Z", ends_at: "2099-03-01T18:00:00Z" });
  await foreground(device);
  await expect(device.getByText("16:00 – 18:00", { exact: true })).toBeVisible();
  await device.getByRole("button", { name: "Update calendar", exact: true }).click();
  await expect.poll(async () => (await calendar()).length).toBe(2);
  assert.equal((await calendar())[1].notes, "Updated. Remove the earlier entry from your calendar.");
  assert.equal((await calendar())[1].startDate, "2099-03-01T16:00:00.000Z");
  await expect(device.getByRole("button", { name: "Add to calendar", exact: true })).toBeVisible();
  await expect
    .poll(async () => (await remindersFor(device, lunch.id)).map((r) => r.body))
    .toEqual(["Tomorrow at 16:00 · Garden lunch", "In 1 hour · Garden lunch"]);
  // Controller ruling P10: a form that can't open (before iOS 17) is explained; nothing asks for calendar access.
  await device.evaluate(() => {
    globalThis.__resbiteDevice.calendar.push = () => {
      throw Error("Fixture: the calendar form can't open");
    };
  });
  await device.getByRole("button", { name: "Add to calendar", exact: true }).click();
  await expect(
    device.getByText("We couldn’t open your calendar. Add to calendar needs iOS 17 or later.", { exact: true }),
  ).toBeVisible();
  await device.evaluate(() => delete globalThis.__resbiteDevice.calendar.push);
  // With the permission off, the phone keeps none and the chip leads to Settings (the browser has none).
  await device.evaluate(() => (globalThis.__resbiteDevice.permission = "denied"));
  await foreground(device);
  await expect(device.getByRole("button", { name: "Reminders off", exact: true })).toBeVisible();
  await expect.poll(() => device.evaluate(() => globalThis.__resbiteDevice.reminders.length)).toBe(0);
  await device.getByRole("button", { name: "Reminders off", exact: true }).click();
  await expect(
    device.getByText("Couldn’t open device settings. Please open Settings on your phone.", { exact: true }),
  ).toBeVisible();
  await expect(device.getByRole("heading", { name: "Get reminders?", exact: true })).toHaveCount(0);
  console.log(
    "PASS: organizer: Get reminders? once, two reminders with the name and time only, the per-event switch, Add to calendar without Meeting details, Update calendar after a time change, the iOS 17 note, Settings when the permission is off.",
  );

  // A guest: no sheet before answering; right after Going it asks, without holding up the answer.
  attendee = { version: 1, response: "pending" };
  const guest = await phone.newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.addInitScript(init, session);
  await guest.route("**/*.supabase.co/**", stub);
  await guest.goto(`${base}/event?plan=${invited.id}`);
  await expect(guest.getByRole("heading", { name: "Board games", exact: true })).toBeVisible();
  await expect(guest.getByText(LOCKED, { exact: true })).toBeVisible();
  await guest.waitForTimeout(500); // a sheet would appear within this settle time
  await expect(guest.getByRole("heading", { name: "Get reminders?", exact: true })).toHaveCount(0);
  await guest.getByRole("radio", { name: "Going", exact: true }).click();
  await expect(guest.getByText("Your response is saved.", { exact: true })).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Get reminders?", exact: true })).toBeVisible();
  await guest.getByRole("button", { name: "Not now", exact: true }).click();
  await sheetClosed(guest);
  await expect(guest.getByRole("radio", { name: "Going", exact: true })).toBeChecked();
  await expect(guest.getByText("Gate code 4512", { exact: true })).toBeVisible();
  assert.equal(await guest.evaluate(() => globalThis.__resbiteDevice.permission), "undetermined");
  // "Not now" leaves Reminders off; it isn't asked again; the chip can turn them on.
  await foreground(guest);
  await guest.waitForTimeout(500);
  await expect(guest.getByRole("heading", { name: "Get reminders?", exact: true })).toHaveCount(0);
  await guest.getByRole("button", { name: "Reminders off", exact: true }).click();
  await expect(guest.getByRole("button", { name: "Reminders on, 1 day and 1 hour before", exact: true })).toBeVisible();
  await expect.poll(async () => (await remindersFor(guest, invited.id)).length).toBe(2);
  // Can't go removes the chips and the reminders.
  await guest.getByRole("radio", { name: "Can’t go", exact: true }).click();
  await expect(guest.getByRole("radio", { name: "Can’t go", exact: true })).toBeChecked();
  await expect(guest.getByRole("button", { name: "Add to calendar", exact: true })).toHaveCount(0);
  await expect.poll(() => remindersFor(guest, invited.id)).toEqual([]);
  await phone.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: guest: Get reminders? only after answering Going, Not now leaves Reminders off without asking again, the chip turns them on, Can’t go removes them.",
  );
} finally {
  await browser.close();
}
