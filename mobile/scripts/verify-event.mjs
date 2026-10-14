// UX1 event page for both roles. Every Supabase request is intercepted; nothing is sent.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { visible } from "./qa-helpers.mjs";
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
  note: "Window table",
  status: "active",
  version: 1,
  cover_path: null,
  cover_revision: 0,
  cover_description: "",
};
const invited = {
  ...hosted,
  id: "44444444-4444-4444-8444-444444444444",
  title: "Board games",
  owner_id: "33333333-3333-4333-8333-333333333333",
  place_label: "Games room",
  note: "",
  cover_path: "33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/a.jpg",
  cover_revision: 1,
  cover_description: "Two mugs on a window sill",
};
const edited = {
  ...hosted,
  id: "55555555-5555-4555-8555-555555555555",
  title: "Picnic",
  description: "",
  place_label: "Park",
  note: "",
};
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((s) => {
    sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(s));
    window.open = (url) => {
      if (window.__blockOpen) throw new Error("Fixture: Maps blocked");
      window.__opened = String(url);
      return null;
    };
  }, session);
  const plans = new Map([
    [hosted.id, { ...hosted }],
    [invited.id, { ...invited }],
    [edited.id, { ...edited }],
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
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles") {
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
      const rows = [...plans.values()].filter((p) => !id || p.id === id);
      return reply(one ? (rows[0] ?? null) : rows);
    }
    if (path === "/rest/v1/attendees") {
      if (one) return reply(attendee);
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
            ]
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
    if (path === "/rest/v1/rpc/change_plan_v2") {
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
      Object.assign(plan, {
        title: body.p_title.trim(),
        description: body.p_description,
        categories: body.p_categories,
        starts_at: body.p_start,
        time_zone: body.p_zone,
        place_label: body.p_place.trim(),
        note: body.p_note,
        version: plan.version + 1,
      });
      return reply(plan.version);
    }
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });

  // Organizer.
  await page.goto(`${base}/event?plan=${hosted.id}`);
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  await expect(page.getByText("Hosting", { exact: true })).toBeVisible();
  await expect(page.getByText("Bring a book", { exact: true })).toBeVisible();
  // Guests (UX2): the stack counts Going and Maybe; the sheet groups every answer.
  await page.getByRole("button", { name: "1 going, 1 maybe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Guests", exact: true })).toBeVisible();
  for (const group of ["Going", "Maybe", "Can’t make it", "Not answered yet"])
    await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
  await expect(page.getByText("Bea", { exact: true })).toBeVisible();
  await expect(page.getByText("Can’t make it now", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
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
    "PASS: organizer event page: guests, Open in Maps (and its failure note), Edit at Review, Do this again at When with a replace guard, an unconfirmed cancel with Refresh event, cancel.",
  );

  // UX2-D1: a saved edit returns to its event page with "Changes saved"; Back then leaves for My resbites.
  await page.goto(`${base}/event?plan=${edited.id}`);
  await expect(page.getByRole("heading", { name: "Picnic", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Picnic", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Looks good?", exact: true })).toBeVisible();
  await visible(page.getByRole("button", { name: "Edit name, Picnic", exact: true })).click();
  await visible(page.getByLabel("Name", { exact: true })).fill("Picnic by the lake");
  await visible(page.getByRole("button", { name: "Done", exact: true })).click();
  await expect(page.getByRole("heading", { name: "Looks good?", exact: true })).toBeVisible();
  await visible(page.getByRole("button", { name: "Save", exact: true })).click();
  await expect(page.getByRole("heading", { name: "Picnic by the lake", exact: true })).toBeVisible();
  await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/event\\?plan=${edited.id}`));
  assert.deepEqual(edits, [edited.id]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My resbites", exact: true })).toBeVisible();
  await expect(page.getByText("Changes saved", { exact: true })).toHaveCount(0);
  console.log("PASS: a saved edit returns to its event page with Changes saved; Back goes to My resbites.");

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
  const going = page.getByRole("radio", { name: "Going", exact: true });
  const maybe = page.getByRole("radio", { name: "Maybe", exact: true });
  const cant = page.getByRole("radio", { name: "Can’t make it", exact: true });
  for (const option of [going, maybe, cant]) await expect(option).not.toBeChecked();
  // The answer saves, but who's coming fails to load: the answer stays, Refresh recovers.
  failNextGuestList = true;
  await maybe.click();
  await expect(page.getByText("Your response is saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Your answer is saved, but who’s coming couldn’t load. Refresh to try again.", { exact: true }),
  ).toBeVisible();
  await expect(maybe).toBeChecked();
  await page.getByRole("button", { name: "Refresh invitation", exact: true }).click();
  await expect(page.getByRole("button", { name: "1 going, 1 maybe", exact: true })).toBeVisible();
  await expect(page.getByText("Answer to see who’s coming", { exact: true })).toHaveCount(0);
  // Going opens the sample chat; backing out after Going reads "Can’t make it now".
  await going.click();
  await expect(going).toBeChecked();
  await expect(page.getByRole("button", { name: "View sample conversation", exact: true })).toBeVisible();
  await cant.click();
  await expect(cant).toBeChecked();
  await expect(page.getByText("Can’t make it now", { exact: true })).toBeVisible();
  // After Maybe, Can’t make it is a plain decline.
  await maybe.click();
  await expect(maybe).toBeChecked();
  await cant.click();
  await expect(cant).toBeChecked();
  assert.deepEqual(responses, ["maybe", "accepted", "withdrawn", "maybe", "declined"]);
  await context.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: invitee: the organizer only before answering, Maybe, the list after answering (and its load failure), Can’t make it now after Going, the photo label.",
  );
} finally {
  await browser.close();
}
