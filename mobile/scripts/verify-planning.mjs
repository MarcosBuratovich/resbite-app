// Browser QA against a running Expo server: the plan screen (one screen that creates and edits a
// resbite), its When and Where sheets, the create journal and My resbites. Every Supabase request is
// intercepted. This does not replace the iPhone picker, keyboard, Dynamic Type or VoiceOver checks.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  AUTH_STORAGE_KEY,
  button,
  card,
  cancelFromList,
  close,
  createPlan,
  editEvent,
  expectCancelled,
  expectCategories,
  fillPlan,
  fillSettled,
  heading,
  heightOf,
  inOrder,
  inviteFromList,
  later,
  noChat,
  openWhen,
  openWhere,
  quietReminders,
  visible,
} from "./qa-helpers.mjs";
const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
const newPage = async (options = {}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...options,
  });
  // Saves land on the event page, which would otherwise ask "Get notified?" (verify-event covers it).
  await quietReminders(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
};
// UX3: a plans row as the server sends it. Meeting details come from their own table, embedded only for
// people allowed to read them (here, the organizer); the row's own note column is always empty.
const row = (plan) => ({
  ...plan,
  note: "",
  has_meeting_details: Boolean(plan.note),
  plan_meeting_details: plan.note ? { note: plan.note } : null,
});
const ERROR_RED = "rgb(163, 49, 66)";
const dayLabel = (date) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(",", "");
/** A preview session on a fresh page: the design preview with no network at all. */
async function previewPage(options) {
  const page = await newPage(options);
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(baseURL);
  await page.getByText("Preview the design", { exact: true }).click();
  return page;
}
/** A PNG drawn in the page, for the cover chooser. */
async function syntheticPng(page, width, height) {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#81b29a";
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height],
  );
  return Buffer.from(base64, "base64");
}
/** My resbites → the "New resbite" button → a blank plan screen. */
async function newResbite(page) {
  await page.getByRole("tab", { name: "My resbites", exact: true }).click();
  await page.getByRole("button", { name: "New resbite", exact: true }).click();
  await expect(heading(page, "New resbite")).toBeVisible();
}

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
/** A time as the server writes it back (`+00:00`), never the app's `.000Z`: the fixture must not hide the difference. */
const serverTime = (iso) => (iso ? new Date(iso).toISOString().replace(/\.\d{3}Z$/, "+00:00") : iso);
const planOf = (overrides = {}) => ({
  id: "22222222-2222-4222-8222-222222222222",
  activity_id: null,
  title: "Coffee evening",
  description: "",
  categories: ["community", "uplifting"],
  owner_id: user.id,
  starts_at: "2099-03-01T15:00:00+00:00",
  ends_at: null,
  time_zone: "UTC",
  place_label: "Original café",
  place_tbd: false,
  repeat_weeks: null,
  series_id: "",
  repeats_from: null,
  area: "",
  note: "",
  guest_note: "",
  status: "active",
  version: 1,
  ...overrides,
});
const planFromCreate = (write) =>
  planOf({
    id: write.p_id,
    activity_id: write.p_activity,
    title: write.p_title,
    description: write.p_description,
    categories: write.p_categories,
    starts_at: serverTime(write.p_start),
    ends_at: serverTime(write.p_ends),
    time_zone: write.p_zone,
    place_label: write.p_place,
    place_tbd: write.p_place_tbd,
    repeat_weeks: write.p_repeat_weeks,
    note: write.p_note,
    area: write.p_area ?? "",
  });
const planFromChange = (plan, write) => ({
  ...plan,
  title: write.p_title,
  description: write.p_description,
  categories: write.p_categories,
  starts_at: serverTime(write.p_start),
  ends_at: serverTime(write.p_ends),
  time_zone: write.p_zone,
  place_label: write.p_place,
  place_tbd: write.p_place_tbd,
  repeat_weeks: write.p_repeat_weeks,
  note: write.p_note,
  area: write.p_area ?? plan.area,
  version: plan.version + 1,
});

/**
 * A signed-in page whose every Supabase request is answered here. `state.plans` is the server's plans;
 * `state.creates` and `state.changes` are the writes it received; `state.holdCreate` makes create_plan_v4 store
 * the plan and then never reply (a lost reply); `state.unexpected` collects any request nobody planned for.
 */
async function signedInPage({ plans = [], guests = [], failJournal = false, ...options } = {}) {
  const page = await newPage({ timezoneId: "UTC", ...options });
  const state = {
    plans: [...plans],
    creates: [],
    changes: [],
    unexpected: [],
    holdCreate: false,
    dropFirstCreate: false,
    planReads: 0,
    guestReads: 0,
    // The next create lands on the server and its reply is lost (a network failure): the outcome is unknown.
    loseNextReply: false,
    // Someone else's save that lands just before the next change: that change then meets a 40001.
    conflictNextChange: null,
  };
  if (failJournal)
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("resbite.create-journal.")) throw new Error("Storage unavailable");
        return set.call(this, key, value);
      };
    });
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: AUTH_STORAGE_KEY, value: session },
  );
  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/v1/user") return reply(user);
    if (url.pathname === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
    if (url.pathname === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (url.pathname === "/rest/v1/profiles") return reply({ id: user.id, display_name: "Fixture", avatar_path: null });
    if (url.pathname === "/rest/v1/activities") return reply([]);
    if (url.pathname === "/rest/v1/attendees") {
      state.guestReads++;
      return reply(guests);
    }
    if (url.pathname === "/rest/v1/plans") {
      state.planReads++;
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      if (request.headers().accept?.includes("object")) {
        const found = state.plans.find((p) => p.id === id);
        return found ? reply(row(found)) : reply({ message: "No rows" }, 406);
      }
      return reply(state.plans.map(row));
    }
    if (url.pathname === "/rest/v1/rpc/create_plan_v4") {
      const write = request.postDataJSON();
      state.creates.push(write);
      // The first create never lands and never answers; later ones land.
      if (state.dropFirstCreate && state.creates.length === 1) return new Promise(() => {});
      state.plans.push(planFromCreate(write));
      if (state.loseNextReply) {
        state.loseNextReply = false;
        return route.abort();
      }
      if (state.holdCreate) return new Promise(() => {});
      return reply(null);
    }
    if (url.pathname === "/rest/v1/rpc/change_plan_v4") {
      const write = request.postDataJSON();
      state.changes.push(write);
      const at = state.plans.findIndex((p) => p.id === write.p_plan);
      if (state.conflictNextChange) {
        state.plans[at] = { ...state.plans[at], ...state.conflictNextChange, version: state.plans[at].version + 1 };
        state.conflictNextChange = null;
        return reply({ code: "40001", message: "Plan changed; refresh" }, 409);
      }
      assert.equal(write.p_version, state.plans[at].version);
      state.plans[at] = planFromChange(state.plans[at], write);
      return reply(state.plans[at].version);
    }
    if (url.pathname === "/rest/v1/rpc/set_guest_note") return reply(null);
    // The organizer's event page lists their personal links and requests; My resbites reads its own.
    if (url.pathname === "/rest/v1/rpc/plan_phone_invitations") return reply([]);
    if (url.pathname === "/rest/v1/rpc/plan_join_requests" || url.pathname === "/rest/v1/rpc/my_join_requests") return reply([]);
    if (url.pathname === "/rest/v1/rpc/plan_link") return reply("AbCdEfGhIjKlMnOpQrStUv");
    // The resbite page reads the person's muted series; none here.
    if (url.pathname === "/rest/v1/plan_mutes") return reply([]);
    // The resbite page's connection states and the links its guests sent (verify-connections and verify-circle cover
    // them): none here.
    if (url.pathname === "/rest/v1/rpc/plan_connection_states") return reply({});
    // Chat plan 3's blocks, read beside the states: nobody blocked (verify-event and verify-chat cover them).
    if (url.pathname === "/rest/v1/rpc/my_blocks") return reply([]);
    if (url.pathname === "/rest/v1/rpc/plan_brought_invitations") return reply([]);
    // Task 8's chat reads: no Chat row, nothing unread (verify-event and review-ui cover them).
    if (noChat(url.pathname) !== undefined) return reply(noChat(url.pathname));
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return reply({ message: "Unexpected fixture request" }, 404);
  });
  return { page, state };
}
const journalKey = `resbite.create-journal.v1.${user.id}`;

try {
  // 1. From an idea: the title is filled and When is empty; Create names what is missing and reddens both
  // rows; the When and Where sheets keep Done off until they are complete; the plan is created.
  {
    const page = await previewPage();
    // A later resbite already on the list, so "on top" means something.
    await newResbite(page);
    await createPlan(page, {
      title: "Garden picnic",
      date: "2099-04-05",
      start: "10:00",
      end: "12:00",
      place: "Riverside park",
      categories: ["Natural"],
    });
    await later(page);
    await page.getByRole("tab", { name: "Create", exact: true }).click();
    await expect(page.getByText("Or start from an idea", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Coffee together", exact: true }).click();
    await page.getByRole("button", { name: "Use idea", exact: true }).click();
    await expect(heading(page, "New resbite")).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Coffee together");
    await expect(button(page, "When, Add a date and time")).toBeVisible();
    await expect(button(page, "Where, Add a place")).toBeVisible();
    await button(page, "Create").click();
    await expect(page.getByText("Two things are missing: a date and time, and a place.", { exact: true })).toBeVisible();
    for (const [name, message] of [
      ["When, Add a date and time", "Add a date and time"],
      ["Where, Add a place", "Add a place or choose “To be decided”"],
    ]) {
      const target = button(page, name);
      assert.equal(await target.evaluate((el) => getComputedStyle(el).borderTopColor), ERROR_RED, `${name} is red`);
      // The When row's placeholder reads the same as its message; the message comes first.
      await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
    }
    // The When sheet: Done waits for the date, the start and the end.
    await openWhen(page);
    const done = button(page, "Done");
    await expect(done).toBeDisabled();
    await fillSettled(visible(page.getByLabel("Date", { exact: true })), "2099-03-01");
    await expect(done).toBeDisabled();
    await fillSettled(visible(page.getByLabel("Start time", { exact: true })), "10:00");
    await expect(done).toBeDisabled();
    await fillSettled(visible(page.getByLabel("End time", { exact: true })), "11:00");
    await expect(done).toBeEnabled();
    await button(page, "3 h").click();
    await expect(visible(page.getByLabel("End time", { exact: true }))).toHaveValue("13:00");
    await expect(button(page, "3 h")).toHaveAttribute("aria-selected", "true");
    // The chat's closing line is a one-off's (P2-Q2, chat plan 2's Decision 8): it shows while the resbite doesn't
    // repeat, and hides once it repeats, when no closing time exists.
    const chatCloses = visible(page.getByText("The chat closes 48 hours after the end time.", { exact: true }));
    await expect(page.getByRole("radio", { name: "Doesn’t repeat", exact: true })).toBeChecked();
    await expect(chatCloses).toBeVisible();
    await page.getByRole("radio", { name: "Every week", exact: true }).click();
    await expect(chatCloses).toHaveCount(0);
    await page.getByRole("radio", { name: "Every 2 weeks", exact: true }).click();
    await expect(chatCloses).toHaveCount(0);
    await page.getByRole("radio", { name: "Doesn’t repeat", exact: true }).click();
    await expect(chatCloses).toBeVisible();
    await page.getByRole("radio", { name: "Every week", exact: true }).click();
    await expect(chatCloses).toHaveCount(0);
    await done.click();
    await expect(heading(page, "When")).toHaveCount(0);
    await expect(button(page, /^When, .* · 10:00 to 13:00, Every week$/)).toBeVisible();
    // The Where sheet: Done waits for a place, or for To be decided.
    await openWhere(page);
    await expect(button(page, "Done")).toBeDisabled();
    await page.getByRole("radio", { name: "To be decided", exact: true }).click();
    await expect(button(page, "Done")).toBeEnabled();
    // A chosen radio stays chosen when it is tapped again.
    await page.getByRole("radio", { name: "To be decided", exact: true }).click();
    await expect(page.getByRole("radio", { name: "To be decided", exact: true })).toBeChecked();
    await button(page, "Done").click();
    await expect(button(page, "Where, To be decided")).toBeVisible();
    await button(page, "Create").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    await expect(page.getByText("Place to be decided", { exact: true })).toBeVisible();
    await expect(visible(page.getByText(/ · Every week$/)).first()).toBeVisible();
    // The card says the repeat aloud too, after the date and times.
    await expect(page.getByLabel(/from 10:00 to 13:00, Every week$/)).toHaveCount(1);
    await button(page, "Not now").click();
    await expect(heading(page, "My resbites")).toBeVisible();
    await expect(card(page, "Coffee together").first()).toBeVisible();
    assert.equal(await card(page, "Coffee together").count(), 1);
    assert.ok(await inOrder(page, [card(page, "Coffee together"), card(page, "Garden picnic")]), "The earlier resbite is on top");
    console.log("PASS: from an idea, Create names the missing date and place and reddens both rows; the When sheet needs date, start and end (3 h, Every week), and shows The chat closes 48 hours after the end time. only while it doesn’t repeat; Where accepts To be decided; It’s on! ends in Every week and the resbite is on My resbites.");

    // Edit in the same session: the first screen after creating is the same plan screen with Save.
    await editEvent(page, "Coffee together");
    // Save is never disabled.
    await expect(button(page, "Save")).toBeEnabled();
    await fillSettled(page.getByLabel("Title", { exact: true }), "Coffee together, late");
    await button(page, "Save").click();
    await expect(page.getByText("Preview changes saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(card(page, "Coffee together, late")).toBeVisible();
    await inviteFromList(page, "Coffee together, late", "Invitations are disabled in design preview.");
    // It repeats every week, so the sheet asks which to cancel.
    await cancelFromList(page, "Coffee together, late", "Cancel just this one");
    await expectCancelled(page, "Coffee together, late");
    await page.getByRole("tab", { name: "Wellness", exact: true }).click();
    await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "About sample data", exact: true }).click();
    await expect(
      page.getByText(
        "These are example numbers for design review. They do not track your activity or measure health.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close sheet", exact: true }).click();
    await expect(page.getByText("30 min", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.getByLabel("What should we call you?", { exact: true }).fill("Alex");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Preview name saved.", { exact: true })).toBeVisible();
    console.log("PASS: preview edit, invitation block, cancel and the Wellness and Profile tabs.");
    await page.context().close();
  }

  // 2. Start from scratch (signed in): Create names four things; the create call carries the new v4 fields.
  {
    const { page, state } = await signedInPage();
    await page.goto(`${baseURL}/plans`);
    await expect(heading(page, "My resbites")).toBeVisible();
    await page.getByRole("tab", { name: "Create", exact: true }).click();
    await expect(heading(page, "What do you want to do?")).toBeVisible();
    await page.getByRole("button", { name: "Start from scratch", exact: true }).click();
    await expect(heading(page, "New resbite")).toBeVisible();
    await button(page, "Create").click();
    await expect(
      page.getByText("Four things are missing: a name, a date and time, a place, and one or two categories.", { exact: true }),
    ).toBeVisible();
    assert.equal(state.creates.length, 0, "A refused Create sends nothing");
    // The fields' small labels show above them, hidden from assistive tech (each field is already named by its label).
    for (const label of ["Title", "Description (optional)", "Note to guests (optional)"]) {
      const shown = visible(page.getByText(label, { exact: true }));
      await expect(shown).toBeVisible();
      await expect(shown).toHaveAttribute("aria-hidden", "true");
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(1);
    }
    assert.ok(
      await inOrder(page, [visible(page.getByText("Title", { exact: true })), page.getByLabel("Title", { exact: true })]),
      "The label sits above its field",
    );
    // A start in the past: the When row says so in its own words, the line counts it, and nothing is sent.
    await fillPlan(page, {
      title: "Garden picnic",
      date: "2020-04-05",
      start: "10:00",
      end: "12:00",
      place: "Riverside park",
      categories: ["Natural", "Community"],
    });
    await expect(button(page, "Creative")).toHaveAttribute("aria-disabled", "true");
    await button(page, "Create").click();
    await expect(page.getByText("One thing is missing: a date and time.", { exact: true })).toBeVisible();
    await expect(page.getByText("Choose a date and time in the future.", { exact: true })).toBeVisible();
    assert.equal(
      await button(page, /^When, /).evaluate((el) => getComputedStyle(el).borderTopColor),
      ERROR_RED,
      "The past When row is red",
    );
    assert.equal(state.creates.length, 0, "A past start sends nothing");
    await fillPlan(page, { date: "2099-04-05", start: "10:00", end: "12:00" });
    await expect(page.getByText("Choose a date and time in the future.", { exact: true })).toHaveCount(0);
    await button(page, "Create").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    assert.equal(state.creates.length, 1);
    const [write] = state.creates;
    assert.equal(write.p_title, "Garden picnic");
    assert.equal(write.p_place, "Riverside park");
    assert.equal(write.p_place_tbd, false);
    assert.equal(write.p_repeat_weeks, null);
    assert.equal(write.p_start, "2099-04-05T10:00:00.000Z");
    assert.equal(write.p_ends, "2099-04-05T12:00:00.000Z");
    assert.deepEqual(write.p_categories, ["natural", "community"]);
    assert.equal(write.p_activity, null);
    await later(page);
    await expect(card(page, "Garden picnic")).toBeVisible();
    await expectCategories(page, "Garden picnic", "Natural · Community");
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), journalKey), null, "The journal is cleared");
    assert.deepEqual(state.unexpected, []);
    console.log("PASS: from scratch, Create names four missing things; a past start reddens When with Choose a date and time in the future. and sends nothing; the create_plan_v4 call carries p_place_tbd false, p_repeat_weeks null and an ends_at.");
    await page.context().close();
  }

  // 3. The next-day end: 22:00 to 02:00 shows the end's own date.
  {
    const page = await previewPage();
    await newResbite(page);
    await fillPlan(page, { date: "2099-04-05", start: "22:00", end: "02:00" });
    await expect(button(page, `When, ${dayLabel("2099-04-05")} · 22:00 to ${dayLabel("2099-04-06")} 02:00`)).toBeVisible();
    console.log("PASS: an end earlier than the start is the next day, and the When row shows the end's date.");
    await page.context().close();
  }

  // 4. The discard sheet: after a keystroke, Keep editing keeps the text and Discard leaves; with no change the X leaves.
  {
    const page = await previewPage();
    await newResbite(page);
    await close(page);
    await expect(heading(page, "My resbites")).toBeVisible();
    await expect(heading(page, "Discard this resbite?")).toHaveCount(0);
    await newResbite(page);
    const name = page.getByLabel("Title", { exact: true });
    await fillSettled(name, "Garden picnic");
    await close(page);
    await expect(heading(page, "Discard this resbite?")).toBeVisible();
    await expect(page.getByText("Your resbite isn’t created yet. If you close it now, what you entered will be lost.", { exact: true })).toBeVisible();
    await button(page, "Keep editing").click();
    await expect(heading(page, "Discard this resbite?")).toHaveCount(0);
    await expect(name).toHaveValue("Garden picnic");
    await close(page);
    await expect(heading(page, "Discard this resbite?")).toBeVisible();
    await button(page, "Discard").click();
    await expect(heading(page, "New resbite")).toHaveCount(0);
    await expect(heading(page, "My resbites")).toBeVisible();
    // A chosen photo is something entered too: closing asks before it is lost.
    await newResbite(page);
    const chooser = page.waitForEvent("filechooser");
    await button(page, "Add cover photo").click();
    await (await chooser).setFiles({ name: "cover.png", mimeType: "image/png", buffer: await syntheticPng(page, 640, 480) });
    await expect(page.getByText("Preview cover stays in memory. Nothing is uploaded.", { exact: true })).toBeVisible();
    await close(page);
    await expect(heading(page, "Discard this resbite?")).toBeVisible();
    await button(page, "Discard").click();
    await expect(heading(page, "My resbites")).toBeVisible();
    console.log("PASS: the discard sheet appears after a keystroke or a chosen photo, Keep editing keeps the text, Discard leaves; an untouched screen leaves at once.");
    await page.context().close();
  }

  // 5. A video-call link refuses Create, with the message under the field.
  {
    const page = await previewPage();
    await newResbite(page);
    await fillPlan(page, {
      title: "Garden picnic",
      date: "2099-04-05",
      start: "10:00",
      end: "12:00",
      place: "Riverside park",
      categories: ["Natural"],
    });
    const description = page.getByLabel("Description (optional)", { exact: true });
    await fillSettled(description, "Join us on https://zoom.us/j/123456789");
    await button(page, "Create").click();
    const refusal = page.getByText("Resbite is for meeting in person. Take out the video-call link.", { exact: true });
    await expect(refusal).toBeVisible();
    await expect(heading(page, "It’s on!")).toHaveCount(0);
    assert.ok(await inOrder(page, [description, refusal]), "The message sits under the description");
    await fillSettled(description, "Bring a blanket");
    await expect(refusal).toHaveCount(0);
    await button(page, "Create").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    console.log("PASS: a video-call link in the description refuses Create with the message under the field.");
    await page.context().close();
  }

  // 6. Edit (signed in): the banner, the button's label, and a resbite without an end.
  {
    const plan = planOf();
    const guests = [
      { plan_id: plan.id, user_id: "guest-1", response: "accepted", version: 1, profiles: { display_name: "Alex" } },
      { plan_id: plan.id, user_id: "guest-2", response: "pending", version: 1, profiles: { display_name: "Sam" } },
      { plan_id: plan.id, user_id: "guest-3", response: "declined", version: 1, profiles: { display_name: "Kim" } },
    ];
    const { page, state } = await signedInPage({ plans: [plan], guests });
    await page.goto(`${baseURL}/arrange?plan=${plan.id}`);
    await expect(heading(page, "Edit resbite")).toBeVisible();
    await expect(page.getByText("2 people will be told about changes to the date, time or place.", { exact: true })).toBeVisible();
    // A resbite made before ends existed: Save is enabled, and tapping it names the When row and waits.
    await expect(button(page, "Save")).toBeEnabled();
    await button(page, "Save").click();
    await expect(page.getByText("One thing is missing: a date and time.", { exact: true })).toBeVisible();
    await expect(page.getByText("Add a date and time", { exact: true }).first()).toBeVisible();
    assert.equal(state.changes.length, 0);
    await fillSettled(page.getByLabel("Title", { exact: true }), "Coffee morning");
    await openWhen(page);
    await expect(visible(page.getByLabel("Start time", { exact: true }))).toHaveValue("15:00");
    await expect(visible(page.getByLabel("End time", { exact: true }))).toHaveValue("");
    await expect(button(page, "Done")).toBeDisabled();
    await button(page, "1 h").click();
    await expect(visible(page.getByLabel("End time", { exact: true }))).toHaveValue("16:00");
    await button(page, "Done").click();
    // The end is a time change: guests are told.
    await expect(button(page, "Save and notify 2 people")).toBeVisible();
    await button(page, "Save and notify 2 people").click();
    await expect(heading(page, "Coffee morning")).toBeVisible();
    assert.equal(state.changes.length, 1);
    assert.equal(state.changes[0].p_title, "Coffee morning");
    assert.equal(state.changes[0].p_ends, "2099-03-01T16:00:00.000Z");
    assert.equal(state.changes[0].p_start, "2099-03-01T15:00:00.000Z");
    assert.equal(state.changes[0].p_version, 1);
    // Unchanged, its times as the server writes them (+00:00): the button reads Save, and Save goes back to the
    // event page without writing.
    await button(page, "Edit Coffee morning").click();
    await expect(heading(page, "Edit resbite")).toBeVisible();
    await expect(button(page, /^Save and notify/)).toHaveCount(0);
    await button(page, "Save").click();
    await expect(heading(page, "Edit resbite")).toHaveCount(0);
    await expect(heading(page, "Coffee morning")).toBeVisible();
    assert.equal(state.changes.length, 1, "An unchanged Save writes nothing");
    // A change to the name alone does not tell anyone: the button stays Save.
    await button(page, "Edit Coffee morning").click();
    await fillSettled(page.getByLabel("Title", { exact: true }), "Coffee afternoon");
    await expect(button(page, "Save")).toBeEnabled();
    await expect(button(page, /^Save and notify/)).toHaveCount(0);
    assert.deepEqual(state.unexpected, []);
    console.log("PASS: edit shows the banner 2 people will be told…; Save is never disabled: a resbite without an end reads Add a date and time until an end is set, an unchanged Save writes nothing; a time change reads Save and notify 2 people, a title change reads Save.");
    await page.context().close();
  }

  // 6b. An edit that meets a newer save: the newer details are shown with a message, nothing is lost silently,
  // and the change made again saves against the newer version.
  {
    const plan = planOf({ ends_at: "2099-03-01T16:00:00+00:00" });
    const { page, state } = await signedInPage({ plans: [plan] });
    state.conflictNextChange = { title: "Coffee at the bakery", place_label: "The bakery" };
    await page.goto(`${baseURL}/arrange?plan=${plan.id}`);
    await expect(heading(page, "Edit resbite")).toBeVisible();
    const title = page.getByLabel("Title", { exact: true });
    await expect(title).toHaveValue("Coffee evening");
    await fillSettled(title, "Coffee by the river");
    await button(page, "Save").click();
    await expect(
      page.getByText("The saved details changed and are shown now. Make your change again.", { exact: true }),
    ).toBeVisible();
    await expect(title).toHaveValue("Coffee at the bakery");
    await expect(button(page, "Where, The bakery")).toBeVisible();
    assert.equal(state.changes.length, 1);
    assert.equal(state.changes[0].p_version, 1);
    // The guests are read again with the newer details (the load read once; the reset reads again).
    await expect.poll(() => state.guestReads).toBe(2);
    // The screen now holds version 2 and nothing unsaved: the X would leave at once. The change, made again, saves.
    await fillSettled(title, "Coffee by the river");
    await button(page, "Save").click();
    await expect(heading(page, "Coffee by the river")).toBeVisible();
    assert.equal(state.changes.length, 2);
    assert.equal(state.changes[1].p_version, 2, "The second Save goes against the newer version");
    assert.equal(state.changes[1].p_place, "The bakery", "It keeps the newer place");
    assert.equal(state.plans[0].version, 3);
    assert.deepEqual(state.unexpected, []);
    console.log("PASS: an edit that meets a 40001 shows the newer title and place with The saved details changed and are shown now. Make your change again.; the change made again saves against version 2.");
    await page.context().close();
  }

  // 7. The journal (signed in): a create whose reply never arrives is finished by reading, never by creating twice.
  {
    const { page, state } = await signedInPage();
    state.holdCreate = true;
    await page.goto(`${baseURL}/plans`);
    await expect(heading(page, "My resbites")).toBeVisible();
    await page.getByRole("tab", { name: "Create", exact: true }).click();
    await page.getByRole("button", { name: "Start from scratch", exact: true }).click();
    await createPlan(page, {
      title: "Garden picnic",
      date: "2099-04-05",
      start: "10:00",
      end: "12:00",
      place: "Riverside park",
      categories: ["Natural"],
    });
    await expect.poll(() => state.creates.length).toBe(1);
    const entry = JSON.parse(await page.evaluate((k) => sessionStorage.getItem(k), journalKey));
    assert.equal(entry.write.id, state.creates[0].p_id, "The journal holds the request that was sent");
    // The reply never arrives; the page is reloaded (the app is closed and opened again).
    state.holdCreate = false;
    const readsBefore = state.planReads;
    await page.goto(baseURL);
    // The app opens on the Create tab; the reconcile runs there, before My resbites is ever opened.
    await expect(heading(page, "What do you want to do?")).toBeVisible();
    await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), journalKey)).toBe(null);
    assert.ok(state.planReads > readsBefore, "The reconcile read the plan while the Create tab was showing");
    assert.equal(state.creates.length, 1, "The reconcile read found the plan: no second create_plan_v4");
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await expect(heading(page, "My resbites")).toBeVisible();
    await expect(page.getByText("Garden picnic is created.", { exact: true })).toBeVisible();
    await expect(card(page, "Garden picnic")).toBeVisible();
    assert.equal(state.creates.length, 1, "Still one create_plan_v4 call in total");
    assert.deepEqual(state.unexpected, []);
    await page.context().close();
    console.log("PASS: a create_plan_v4 reply that never arrives, then a reload: the reconcile read finds the plan, one create_plan_v4 call in total, and My resbites says “Garden picnic is created.”");
  }
  // The re-send path: the first create never landed, so the list read at focus finds nothing; the reconcile sends the
  // create itself, and My resbites reads the list again to show the tile.
  {
    const { page, state } = await signedInPage();
    state.dropFirstCreate = true;
    await page.goto(`${baseURL}/plans`);
    await expect(heading(page, "My resbites")).toBeVisible();
    await page.getByRole("tab", { name: "Create", exact: true }).click();
    await page.getByRole("button", { name: "Start from scratch", exact: true }).click();
    await createPlan(page, {
      title: "Garden picnic",
      date: "2099-04-05",
      start: "10:00",
      end: "12:00",
      place: "Riverside park",
      categories: ["Natural"],
    });
    await expect.poll(() => state.creates.length).toBe(1);
    assert.equal(state.plans.length, 0, "The first create never landed");
    await page.goto(baseURL);
    await expect(heading(page, "What do you want to do?")).toBeVisible();
    // The reconcile re-sends the create from the Create tab, before My resbites is opened.
    await expect.poll(() => state.creates.length).toBe(2);
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await expect(heading(page, "My resbites")).toBeVisible();
    await expect(page.getByText("Garden picnic is created.", { exact: true })).toBeVisible();
    await expect(card(page, "Garden picnic")).toBeVisible();
    assert.equal(state.creates.length, 2, "The held create and the reconcile's own");
    assert.equal(state.creates[1].p_id, state.creates[0].p_id, "The reconcile re-sends the same plan");
    assert.equal(state.plans.length, 1);
    await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), journalKey)).toBe(null);
    assert.deepEqual(state.unexpected, []);
    await page.context().close();
    console.log("PASS: a create that never landed is re-sent once by the reconcile, and My resbites shows the notice and the tile (two create_plan_v4 calls in total).");
  }
  {
    const { page, state } = await signedInPage({ failJournal: true });
    await page.goto(`${baseURL}/plans`);
    await page.getByRole("tab", { name: "Create", exact: true }).click();
    await page.getByRole("button", { name: "Start from scratch", exact: true }).click();
    await createPlan(page, {
      title: "Garden picnic",
      date: "2099-04-05",
      start: "10:00",
      end: "12:00",
      place: "Riverside park",
      categories: ["Natural"],
    });
    await expect(
      page.getByText("Couldn’t protect this save on your device. Nothing was sent; try again.", { exact: true }),
    ).toBeVisible();
    assert.equal(state.creates.length, 0, "A create that could not be journaled is not sent");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Garden picnic");
    await expect(button(page, "Where, Riverside park")).toBeVisible();
    assert.deepEqual(state.unexpected, []);
    await page.context().close();
    console.log("PASS: a failed journal write sends no create, shows the error and keeps the fields.");
  }

  // 7b. An unknown outcome locks the form: read-only fields, the footer line, and Create finds out.
  {
    const { page, state } = await signedInPage();
    state.loseNextReply = true;
    await page.goto(`${baseURL}/arrange`);
    await expect(heading(page, "New resbite")).toBeVisible();
    await createPlan(page, {
      title: "Garden picnic",
      date: "2099-04-05",
      start: "10:00",
      end: "12:00",
      place: "Riverside park",
      categories: ["Natural"],
    });
    const uncertain = "Your resbite may already be created. Check your connection and tap Create to find out.";
    await expect(page.getByText(uncertain, { exact: true })).toBeVisible();
    assert.equal(state.creates.length, 1);
    await expect(page.getByLabel("Title", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Description (optional)", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Note to guests (optional)", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: /^When, / })).toBeDisabled();
    await expect(button(page, "Where, Riverside park")).toBeDisabled();
    await expect(button(page, "Natural")).toBeDisabled();
    await expect(button(page, "Create")).toBeEnabled();
    // Create again: the reconcile reads, finds the plan and never creates twice.
    await button(page, "Create").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    assert.equal(state.creates.length, 1, "The retry read the plan: no second create_plan_v4");
    await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), journalKey)).toBe(null);
    assert.deepEqual(state.unexpected, []);
    await page.context().close();
    console.log("PASS: a create whose reply is lost locks the fields (title, description, note, When, Where, categories read-only), shows Your resbite may already be created…, and Create again reads the plan and ends in It’s on! with one create_plan_v4 call.");
  }

  // 8. Accessibility: the missing line is a live region; focus lands on the first red row.
  {
    const page = await previewPage();
    await newResbite(page);
    await button(page, "Create").click();
    const line = page.getByText("Four things are missing: a name, a date and time, a place, and one or two categories.", { exact: true });
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute("aria-live", "polite");
    await expect(page.getByText("Add a name", { exact: true })).toBeFocused();
    // With a name, the first red row is When.
    await fillSettled(page.getByLabel("Title", { exact: true }), "Garden picnic");
    await button(page, "Create").click();
    await expect(page.getByText("Three things are missing: a date and time, a place, and one or two categories.", { exact: true })).toBeVisible();
    await expect(button(page, "When, Add a date and time")).toBeFocused();
    // With a date and time, it is Where.
    await fillPlan(page, { date: "2099-04-05", start: "10:00", end: "12:00" });
    await button(page, "Create").click();
    await expect(button(page, "Where, Add a place")).toBeFocused();
    console.log("PASS: the missing line has aria-live and focus lands on the first red row (name, then When, then Where).");
    await page.context().close();
  }

  // Plan 4: the organizer is asked "Get notified?" once, after creating an event, and not again after Not now; saved places are remembered.
  // This context leaves the phone's permission unanswered (the others answer it up front, quietReminders).
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const asked = await context.newPage();
    asked.on("pageerror", (error) => errors.push(error.message));
    await asked.route("**/*.supabase.co/**", (route) => route.abort());
    await asked.goto(baseURL);
    await asked.getByText("Preview the design", { exact: true }).click();
    const askTitle = asked.getByRole("heading", { name: "Get notified?", exact: true });
    const create = async (place) => {
      await asked.getByRole("tab", { name: "Create", exact: true }).click();
      await asked.getByRole("button", { name: "Coffee together", exact: true }).click();
      await asked.getByRole("button", { name: "Use idea", exact: true }).click();
      await createPlan(asked, { place });
      await later(asked);
    };
    await create("The garden café");
    // Recent places (UX-P6): a successful save remembers its place on this device.
    const recent = () => asked.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview"));
    await expect.poll(recent).toBe(JSON.stringify(["The garden café"]));
    await expect(askTitle).toBeVisible();
    await expect(
      asked.getByText(
        "Resbite can tell you when people answer or ask to join, when a resbite changes or gets a note, and before it starts.",
        { exact: true },
      ),
    ).toBeVisible();
    for (const name of ["Turn on notifications", "Not now"]) {
      const target = asked.getByRole("button", { name, exact: true });
      await expect(target).toBeVisible();
      assert.ok((await heightOf(target)) >= 44, `${name} is at least 44pt`);
    }
    assert.ok(!(await asked.locator("body").innerText()).includes("000000"), "No 000000 in the ask");
    await asked.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(askTitle).toHaveCount(0);
    assert.equal(await asked.evaluate(() => globalThis.__resbiteDevice.permission), "undetermined");
    // A second event does not bring it back, and its place joins the recent ones.
    await create("The park");
    await expect(heading(asked, "My resbites")).toBeVisible();
    await expect.poll(recent).toBe(JSON.stringify(["The park", "The garden café"]));
    await asked.waitForTimeout(600); // the ask would appear within this settle time
    await expect(askTitle).toHaveCount(0);
    await context.close();
    console.log("PASS: the organizer is asked Get notified? once after creating an event (copy, 44pt buttons), and not again after Not now; saved places are remembered.");
  }

  // The foreground refresh of My resbites: offline retention, retry and the hidden tab.
  {
    const plan = planOf();
    const fixture = await newPage();
    let savedPlan = plan;
    let readFailure = false;
    let planReads = 0;
    let holdNextRead = false;
    let releaseRead;
    let attendeeResponse = "pending";
    const foreground = async () =>
      fixture.evaluate(() => {
        for (const state of ["hidden", "visible"]) {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: state,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });
    await fixture.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
      key: AUTH_STORAGE_KEY,
      value: session,
    });
    await fixture.route("**/*.supabase.co/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const reply = (body, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/auth/v1/user") return reply(user);
      if (url.pathname === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
      if (url.pathname === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
      if (url.pathname === "/rest/v1/profiles") return reply({ id: user.id, display_name: "Fixture", avatar_path: null });
      if (url.pathname === "/rest/v1/activities") return reply([]);
      if (url.pathname === "/rest/v1/attendees")
        return reply([
          {
            plan_id: savedPlan.id,
            user_id: "guest",
            response: attendeeResponse,
            profiles: { display_name: "Alex" },
          },
        ]);
      if (url.pathname === "/rest/v1/plans") {
        planReads++;
        if (holdNextRead) {
          holdNextRead = false;
          const snapshot = { ...savedPlan };
          await new Promise((resolve) => {
            releaseRead = resolve;
          });
          return reply([row(snapshot)]);
        }
        if (readFailure) return reply({ message: "Offline fixture" }, 503);
        return reply(request.headers().accept?.includes("object") ? row(savedPlan) : [row(savedPlan)]);
      }
      if (url.pathname === "/rest/v1/rpc/plan_join_requests" || url.pathname === "/rest/v1/rpc/my_join_requests") return reply([]);
      if (url.pathname === "/rest/v1/plan_mutes") return reply([]);
      if (noChat(url.pathname) !== undefined) return reply(noChat(url.pathname));
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    });
    await fixture.goto(`${baseURL}/plans`);
    await expect(fixture.getByText("Original café", { exact: true })).toBeVisible();
    await expect(fixture.getByText("Coffee evening", { exact: true })).toBeVisible();
    await expect(fixture.getByText("1 going", { exact: true })).toHaveCount(0);
    savedPlan = { ...savedPlan, place_label: "Updated while away" };
    attendeeResponse = "accepted";
    await foreground();
    await expect(fixture.getByText("Updated while away", { exact: true })).toBeVisible();
    await expect(fixture.getByText("1 going", { exact: true })).toBeVisible();
    readFailure = true;
    await foreground();
    await expect(fixture.getByRole("button", { name: "Refresh plans", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(fixture.getByText("Updated while away", { exact: true })).toBeVisible();
    await expect(fixture.getByText("Nothing planned", { exact: true })).toHaveCount(0);
    readFailure = false;
    savedPlan = { ...savedPlan, place_label: "Recovered café" };
    await fixture.getByRole("button", { name: "Refresh plans", exact: true }).click();
    await expect(fixture.getByText("Recovered café", { exact: true })).toBeVisible();
    await expect(fixture.getByRole("button", { name: "Refresh plans", exact: true })).toHaveCount(0);
    holdNextRead = true;
    await foreground();
    await expect.poll(() => Boolean(releaseRead)).toBe(true);
    savedPlan = { ...savedPlan, place_label: "Newest café" };
    await foreground();
    await expect(fixture.getByText("Newest café", { exact: true })).toBeVisible();
    releaseRead();
    await fixture.waitForTimeout(250);
    await expect(fixture.getByText("Newest café", { exact: true })).toBeVisible();
    await fixture.getByRole("tab", { name: "Create", exact: true }).click();
    const readsBefore = planReads;
    await foreground();
    await fixture.waitForTimeout(250);
    assert.equal(planReads, readsBefore, "Hidden plans tab must not refresh");
    console.log("PASS: foreground plan/RSVP refresh, offline retention, retry and hidden-tab cleanup.");
    await fixture.context().close();
  }

  // The end time, the area and the Meeting details over the network: the edit sends p_ends, the trimmed
  // note and area, and the area "" when it is cleared.
  {
    const plan = planOf({ ends_at: "2099-03-01T16:00:00+00:00", area: "Near the river", note: "Gate code 4512" });
    const { page, state } = await signedInPage({ plans: [plan] });
    await page.goto(`${baseURL}/arrange?plan=${plan.id}`);
    await expect(heading(page, "Edit resbite")).toBeVisible();
    await expect(button(page, /^When, .* · 15:00 to 16:00$/)).toBeVisible();
    await openWhen(page);
    const end = visible(page.getByLabel("End time", { exact: true }));
    await expect(end).toHaveValue("16:00");
    await fillSettled(end, "17:30");
    await button(page, "Done").click();
    await expect(button(page, /^When, .* · 15:00 to 17:30$/)).toBeVisible();
    await openWhere(page);
    const area = visible(page.getByLabel("Area people see before they reply", { exact: true }));
    const details = visible(page.getByLabel("Meeting details", { exact: true }));
    await expect(area).toHaveValue("Near the river");
    await expect(details).toHaveValue("Gate code 4512");
    await fillSettled(details, "  \nGate code 9876 \n\n");
    await fillSettled(area, "  Near Old Street ");
    await button(page, "Done").click();
    await button(page, /^Save/).click();
    await expect(heading(page, "Coffee evening")).toBeVisible();
    assert.equal(state.changes.length, 1);
    assert.equal(state.changes[0].p_ends, "2099-03-01T17:30:00.000Z");
    assert.equal(state.changes[0].p_start, "2099-03-01T15:00:00.000Z");
    assert.equal(state.changes[0].p_note, "Gate code 9876");
    assert.equal(state.changes[0].p_area, "Near Old Street");
    await expect(page.getByText("Sun 1 Mar · 15:00 to 17:30", { exact: true })).toBeVisible();
    // Clearing the area sends "" (cleared), never null (which leaves it as it is).
    await button(page, "Edit Coffee evening").click();
    await openWhere(page);
    await expect(area).toHaveValue("Near Old Street");
    await fillSettled(area, "");
    await button(page, "Done").click();
    await button(page, /^Save/).click();
    await expect(heading(page, "Coffee evening")).toBeVisible();
    assert.equal(state.changes.length, 2);
    assert.equal(state.changes[1].p_area, "");
    assert.deepEqual(state.unexpected, []);
    console.log("PASS: an edit sends the end as p_ends, the Meeting details and the area trimmed, and the area \"\" when cleared.");
    await page.context().close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
