// Plan 3 (open-link approval) in the app, on the web build. Answering an event's open link is a request the host
// approves, so nobody joins by opening it. Every Supabase request is intercepted; nothing is sent.
//  1. Signed in, /invite?code= sends request_to_join (p_response "pending") and lands on /waiting?plan=: "Waiting
//     for Stephen", the invitation's card, the answer. Changing the answer sends change_join_answer, exactly. Opening
//     the link again sends the request again, lists nothing twice and shows the same waiting screen. A declined
//     request says "You weren’t added to this resbite." with no answer to change. A change the server refuses because
//     the host answered meanwhile (22023 "Request already decided") shows no error: the request is read again, and
//     a declined one says so while an approved one opens the event. The inline 18+ tick: the server's
//     22023 "Age confirmation required" shows the tick, Continue sends the request again with p_terms_version.
//  2. Signed out, the invite screen is the invitation's card with Sign up to reply -> /auth/phone and I have an
//     account -> /auth/phone?intent=signin; no tick, no providers, no email; the code stays kept.
//  3. My resbites lists a waiting request ("Waiting for Sam") and a declined one ("Not added") under Invitations;
//     a tap opens /waiting?plan=.
//  4. The waiting-for-access screen (an account the beta hasn't approved) lists its requests the same way.
//  6. Test mode's 000000 shows nowhere.
//  Plan 4: a waiting account whose stored answer is Going or Maybe (given on the web, say) is asked "Get notified?"
//  once on /waiting without changing it, while the phone's permission was never asked for; Can’t go isn't.
// (4 and 5 of the brief, the host's Waiting for you and the Event link card, are in verify-event.)
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, heading, quietReminders } from "./qa-helpers.mjs";
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
  user_metadata: { registration_details_version: 1, full_name: "Fixture Person" },
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "447700900834",
  phone_confirmed_at: "2026-01-01T00:00:00Z",
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
const PLAN = "22222222-2222-4222-8222-222222222222";
const PLAN_B = "33333333-3333-4333-8333-333333333333";
const NEW = "New".repeat(6).padEnd(22, "1");
const DECLINED = "Declined".repeat(3).slice(0, 22);
const AGE = "Age".repeat(7).padEnd(22, "6");
const GUEST = "GuestGuestGuestGuest_4";
const card = {
  plan_id: PLAN,
  title: "Film club",
  starts_at: "2099-03-01T19:30:00Z",
  ends_at: null,
  time_zone: "UTC",
  host: "Stephen",
  area: "Near Old Street",
  image: { kind: "mark", ref: null },
  response: "pending",
  status: "waiting",
};
const pending = (page) => page.evaluate(() => sessionStorage.getItem("resbite.pending-invite"));
// Plan 4: the one notification ask, and its own device flag in this account's reminder switches.
const ASK_TITLE = "Get notified?";
const asked = (page) =>
  page.evaluate((id) => JSON.parse(sessionStorage.getItem(`resbite.reminder-prefs.v1.${id}`) ?? "{}").notificationsAsked ?? false, user.id);
const path = (page) => new URL(page.url()).pathname;
const param = (page, name) => new URL(page.url()).searchParams.get(name);

/** The test code never shows: no text, label, placeholder or field holds 000000. */
async function noTestCode(page, where) {
  const found = await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.includes("000000")) hits.push(`text "${n.data}"`);
    for (const el of document.querySelectorAll("*"))
      for (const name of ["aria-label", "aria-description", "aria-valuetext", "placeholder", "title", "alt", "value"])
        if (el.getAttribute(name)?.includes("000000")) hits.push(`${name} on ${el.tagName}`);
    if (document.body.innerText.includes("000000")) hits.push("rendered text");
    if (document.title.includes("000000") || location.href.includes("000000")) hits.push("title or address");
    return hits;
  });
  assert.deepEqual(found, [], `no test code on ${where}`);
}

/**
 * One person: signed in (or out), approved or waiting for the beta, with their requests. `requests` is what
 * my_join_requests returns; request_to_join adds to it for a new code and answers by code. With `decided`
 * ("approved" or "declined"), the host answers the request just before the person changes their answer.
 */
async function fixture({ signedIn = true, access = "approved", requests = [], kept = null, decided = null, quiet = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // `quiet: false` leaves the phone's permission never asked for ("undetermined"), so the notification ask can come.
  if (quiet) await quietReminders(page);
  await page.addInitScript(
    ({ session, kept }) => {
      if (sessionStorage.getItem("fixture-seeded")) return;
      sessionStorage.setItem("fixture-seeded", "1");
      if (session) sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(session));
      if (kept) sessionStorage.setItem("resbite.pending-invite", kept);
    },
    { session: signedIn ? session : null, kept },
  );
  // `hold`, when set, is a promise each my_join_requests reply waits for, so a test can look at the screen meanwhile.
  const state = { requests: [...requests], joins: [], changes: [], mine: 0, opens: [], hold: null };
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/auth/v1/user") return signedIn ? reply(user) : reply({ message: "No session" }, 401);
    if (p === "/rest/v1/rpc/note_app_session") return route.fulfill({ status: 204, body: "" });
    if (p === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: access });
    if (p === "/rest/v1/rpc/invitation_page")
      return reply({
        state: "open",
        host: "Stephen",
        title: "Film night",
        starts_at: "2099-10-23T18:30:00Z",
        time_zone: "Europe/London",
        area: "Near Old Street",
        image: { kind: "mark", ref: null },
      });
    if (p === "/rest/v1/rpc/note_link_open") {
      state.opens.push(req.postDataJSON().p_code);
      return route.fulfill({ status: 204, body: "" });
    }
    if (p === "/rest/v1/profiles") {
      // A person waiting for the beta has no profile row yet.
      if (access !== "approved") return reply(one ? null : []);
      return reply(one ? { id: user.id, display_name: "Fixture Person", avatar_path: null, avatar_revision: 0 } : [{ id: user.id, display_name: "Fixture Person" }]);
    }
    if (p === "/rest/v1/activities") return reply([]);
    if (p === "/rest/v1/plans") return reply(one ? null : []);
    if (p === "/rest/v1/attendees") return reply(one ? null : []);
    if (p === "/rest/v1/rpc/request_to_join") {
      const body = req.postDataJSON();
      state.joins.push(body);
      if (body.p_code === AGE && !body.p_terms_version)
        return reply({ code: "22023", message: "Age confirmation required" }, 400);
      if (body.p_code === DECLINED) {
        if (!state.requests.some((r) => r.plan_id === PLAN_B))
          state.requests.push({ ...card, plan_id: PLAN_B, title: "Quiz night", status: "declined", response: "declined" });
        return reply({ state: "declined", plan_id: PLAN_B, response: "declined" });
      }
      // Asking again with a request waiting changes nothing: the one request stays.
      let found = state.requests.find((r) => r.plan_id === PLAN);
      if (!found) {
        found = { ...card, response: body.p_response };
        state.requests.push(found);
      }
      return reply({ state: "waiting", plan_id: PLAN, response: found.response });
    }
    if (p === "/rest/v1/rpc/my_join_requests") {
      state.mine++;
      if (state.hold) await state.hold;
      return reply(state.requests);
    }
    if (p === "/rest/v1/rpc/change_join_answer") {
      const body = req.postDataJSON();
      state.changes.push(body);
      const found = state.requests.find((r) => r.plan_id === body.p_plan);
      // The host answered a moment ago: an approved request leaves the list, a declined one stays as declined.
      if (decided) {
        if (decided === "declined") found.status = "declined";
        else state.requests.splice(state.requests.indexOf(found), 1);
        return reply({ code: "22023", message: "Request already decided" }, 400);
      }
      found.response = body.p_response;
      return reply({ status: "waiting", response: body.p_response });
    }
    return reply({ message: `Unexpected ${req.method()} ${p}` }, 400);
  });
  return { page, errors, state };
}

try {
  {
    const { page, errors, state } = await fixture();
    // Signed in: the request goes out as "pending" with the account's name, and lands on the waiting screen.
    await page.goto(`${base}/invite?code=${NEW}`);
    await expect(heading(page, "Waiting for Stephen")).toBeVisible();
    assert.equal(path(page), "/waiting");
    assert.equal(param(page, "plan"), PLAN);
    assert.deepEqual(state.joins, [{ p_code: NEW, p_name: "Fixture Person", p_response: "pending", p_terms_version: null }]);
    await expect(page.getByText("Stephen will confirm your spot.", { exact: true })).toBeVisible();
    await expect(page.getByText("Film club", { exact: true })).toBeVisible();
    await expect(page.getByText("Stephen invited you", { exact: true })).toBeVisible();
    await expect(page.getByText("Near Old Street", { exact: true })).toBeVisible();
    await expect.poll(() => pending(page)).toBe(null);
    // Nobody is in yet: nothing has been answered, and the answer is a Going / Maybe / Can’t go control.
    for (const name of ["Going", "Maybe", "Can’t go"]) await expect(page.getByRole("radio", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await noTestCode(page, "the waiting screen");
    // Changing the answer sends change_join_answer, not a second request.
    await page.getByRole("radio", { name: "Maybe", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Maybe", exact: true })).toBeChecked();
    assert.deepEqual(state.changes, [{ p_plan: PLAN, p_response: "maybe" }]);
    await page.getByRole("radio", { name: "Going", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Can’t go", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Can’t go", exact: true })).toBeChecked();
    assert.deepEqual(state.changes, [
      { p_plan: PLAN, p_response: "maybe" },
      { p_plan: PLAN, p_response: "accepted" },
      { p_plan: PLAN, p_response: "declined" },
    ]);
    assert.equal(state.joins.length, 1, "changing the answer does not send another request");
    // Opening the link again (a returning person) shows the same request, with the answer they gave, once.
    await page.goto(`${base}/invite?code=${NEW}`);
    await expect(heading(page, "Waiting for Stephen")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Can’t go", exact: true })).toBeChecked();
    assert.equal(state.joins.length, 2);
    assert.equal(state.requests.length, 1, "one request, never duplicated");
    // Done leaves the screen for My resbites (nothing to go back to after a fresh load).
    await button(page, "Done").click();
    await expect(heading(page, "My resbites")).toBeVisible();
    assert.equal(path(page), "/plans");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      "PASS: signed in, an event link sends request_to_join (pending, with the account's name) and lands on /waiting?plan= (Waiting for Stephen, the card, the answer, the kept code cleared); changing the answer sends change_join_answer with the plan and the stored words, not another request; opening the link again shows the same request once.",
    );
  }
  {
    const { page, errors, state } = await fixture();
    // A declined host decision: the screen says so, with no host byline and no answer to change.
    await page.goto(`${base}/invite?code=${DECLINED}`);
    await expect(heading(page, "You weren’t added to this resbite.")).toBeVisible();
    assert.equal(path(page), "/waiting");
    assert.equal(param(page, "plan"), PLAN_B);
    await expect(page.getByText("Quiz night", { exact: true })).toBeVisible();
    await expect(page.getByText("Stephen invited you", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByText(/will confirm your spot/)).toHaveCount(0);
    assert.deepEqual(state.changes, []);
    await noTestCode(page, "the declined screen");
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: a declined request says \"You weren’t added to this resbite.\" with the card, no host byline and no answer to change.");
  }
  for (const decided of ["declined", "approved"]) {
    const { page, errors, state } = await fixture({ requests: [{ ...card, host: "Sam" }], decided });
    // The host answers just before the person changes their answer: no error (not the host's words, nor the
    // connection line), the request is read again, and the screen follows the host's answer.
    await page.goto(`${base}/waiting?plan=${PLAN}`);
    await expect(heading(page, "Waiting for Sam")).toBeVisible();
    const reads = state.mine;
    let release;
    state.hold = new Promise((resolve) => (release = resolve));
    await page.getByRole("radio", { name: "Maybe", exact: true }).click();
    // Between the refusal and the read after it (held here), the screen shows no error of any kind.
    await expect.poll(() => state.mine).toBeGreaterThan(reads);
    await page.waitForTimeout(300);
    for (const copy of ["Someone already answered this request.", "Check your connection and try again.", "This link isn’t open to you right now."])
      await expect(page.getByText(copy, { exact: true })).toHaveCount(0);
    await expect(heading(page, "Waiting for Sam")).toBeVisible();
    state.hold = null;
    release();
    if (decided === "declined") {
      await expect(heading(page, "You weren’t added to this resbite.")).toBeVisible();
      await expect(page.getByRole("radio")).toHaveCount(0);
      assert.equal(path(page), "/waiting");
      await expect(page.getByText("Check your connection and try again.", { exact: true })).toHaveCount(0);
    } else {
      await expect.poll(() => path(page)).toBe("/event");
      assert.equal(param(page, "plan"), PLAN);
    }
    assert.ok(state.mine > reads, "the request is read again");
    assert.deepEqual(state.changes, [{ p_plan: PLAN, p_response: "maybe" }]);
    await expect(page.getByText("Someone already answered this request.", { exact: true })).toHaveCount(0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      decided === "declined"
        ? "PASS: a change refused as already decided (the host declined meanwhile) shows no error, reads the request again and says \"You weren’t added to this resbite.\" with no answer to change."
        : "PASS: a change refused as already decided (the host approved meanwhile) shows no error, reads the request again and opens /event?plan=.",
    );
  }
  {
    const { page, errors, state } = await fixture();
    // The server has no 18+ tick for the account: the tick shows on the invite screen, the request waits for
    // Continue, and is sent again with the Terms version.
    await page.goto(`${base}/invite?code=${AGE}`);
    const tick = page.getByRole("checkbox", { name: "I’m 18 or over", exact: true });
    await expect(tick).toBeVisible();
    await expect(tick).not.toBeChecked();
    await expect(page.getByText("Resbite is for people aged 18 and over.", { exact: true })).toBeVisible();
    await expect(button(page, "Continue")).toBeDisabled();
    assert.equal(path(page), "/invite");
    assert.deepEqual(state.joins, [{ p_code: AGE, p_name: "Fixture Person", p_response: "pending", p_terms_version: null }]);
    assert.equal(await pending(page), AGE, "the code stays kept while the tick is given");
    await page.waitForTimeout(500);
    assert.equal(state.joins.length, 1, "nothing is sent again before Continue");
    await noTestCode(page, "the tick");
    await tick.click();
    await expect(tick).toBeChecked();
    await button(page, "Continue").click();
    await expect(heading(page, "Waiting for Stephen")).toBeVisible();
    assert.deepEqual(state.joins[1], { p_code: AGE, p_name: "Fixture Person", p_response: "pending", p_terms_version: "2026-10" });
    assert.equal(state.joins.length, 2);
    await expect.poll(() => pending(page)).toBe(null);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: a request refused for a missing 18+ tick (22023 Age confirmation required) shows the inline tick with the code kept and nothing resent; Continue sends it again with p_terms_version 2026-10 and lands on /waiting.");
  }
  {
    const { page, errors, state } = await fixture({ signedIn: false });
    // Signed out: the invitation's card, then Sign up to reply or I have an account. No tick, providers or email.
    await page.goto(`${base}/invite?code=${GUEST}`);
    await expect(heading(page, "You’re invited.")).toBeVisible();
    await expect(page.getByText("Stephen invited you", { exact: true })).toBeVisible();
    await expect(page.getByText("Film night", { exact: true })).toBeVisible();
    await expect(page.getByText("We’ll keep this invitation ready while you finish setting up.", { exact: true })).toBeVisible();
    await expect(button(page, "Sign up to reply")).toBeVisible();
    await expect(button(page, "I have an account")).toBeVisible();
    for (const gone of ["Continue with email", "Continue with Google", "Continue with Apple", "Continue"])
      await expect(page.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    assert.equal(await pending(page), GUEST, "the code is kept for after sign-in");
    assert.deepEqual(state.opens, [GUEST], "the open is counted once");
    assert.deepEqual(state.joins, [], "nothing is requested before there is an account");
    await noTestCode(page, "the signed-out invitation");
    // Sign up to reply goes to the phone sign-up with the code still kept.
    await button(page, "Sign up to reply").click();
    await expect.poll(() => path(page)).toBe("/auth/phone");
    assert.equal(param(page, "intent"), null);
    assert.equal(await pending(page), GUEST);
    await noTestCode(page, "phone sign-up");
    // I have an account goes to the phone sign-in.
    await page.goto(`${base}/invite?code=${GUEST}`);
    await expect(button(page, "I have an account")).toBeVisible();
    await button(page, "I have an account").click();
    await expect.poll(() => path(page)).toBe("/auth/phone");
    assert.equal(param(page, "intent"), "signin");
    assert.equal(await pending(page), GUEST);
    assert.deepEqual(state.joins, []);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: signed out, the invite screen shows the card with Sign up to reply (-> /auth/phone) and I have an account (-> /auth/phone?intent=signin), no tick, providers or email, the code kept, one open counted, nothing requested.");
  }
  {
    const { page, errors } = await fixture({
      requests: [
        { ...card, plan_id: PLAN, host: "Sam", title: "Film club", status: "waiting" },
        { ...card, plan_id: PLAN_B, host: "Jo", title: "Quiz night", status: "declined", response: "declined" },
      ],
    });
    // My resbites: a waiting request ("Waiting for Sam") and a declined one ("Not added") under Invitations.
    await page.goto(`${base}/plans`);
    await expect(heading(page, "My resbites")).toBeVisible();
    await expect(heading(page, "Invitations")).toBeVisible();
    await expect(page.getByText("Waiting for Sam", { exact: true })).toBeVisible();
    await expect(page.getByText("Not added", { exact: true })).toBeVisible();
    await expect(page.getByText("Film club", { exact: true })).toBeVisible();
    await expect(page.getByText("Quiz night", { exact: true })).toBeVisible();
    // The requests are not going, and answering them is on the waiting screen, not here.
    await expect(page.getByRole("radiogroup", { name: /^Your answer to/ })).toHaveCount(0);
    await noTestCode(page, "My resbites");
    await page.getByText("Waiting for Sam", { exact: true }).click();
    await expect(heading(page, "Waiting for Sam")).toBeVisible();
    assert.equal(path(page), "/waiting");
    assert.equal(param(page, "plan"), PLAN);
    await button(page, "Done").click();
    await expect(heading(page, "My resbites")).toBeVisible();
    await page.getByText("Not added", { exact: true }).click();
    await expect(heading(page, "You weren’t added to this resbite.")).toBeVisible();
    assert.equal(param(page, "plan"), PLAN_B);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: My resbites lists a waiting request (Waiting for Sam) and a declined one (Not added) under Invitations; each opens /waiting?plan=.");
  }
  {
    const { page, errors } = await fixture({
      access: "access_pending",
      requests: [{ ...card, host: "Sam", status: "waiting" }],
    });
    // An account the beta hasn't approved yet: Waiting for access lists its requests, and a tap opens the request.
    await page.goto(`${base}/account`);
    await expect(heading(page, "Waiting for access")).toBeVisible();
    await expect(heading(page, "Invitations")).toBeVisible();
    await expect(page.getByText("Waiting for Sam", { exact: true })).toBeVisible();
    await noTestCode(page, "the waiting-for-access screen");
    await page.getByText("Waiting for Sam", { exact: true }).click();
    await expect(heading(page, "Waiting for Sam")).toBeVisible();
    assert.equal(path(page), "/waiting");
    assert.equal(param(page, "plan"), PLAN);
    await expect(page.getByRole("radio", { name: "Going", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: the waiting-for-access screen lists the account's requests under Invitations; a tap opens the request while the account still waits.");
  }
  {
    const { page, errors } = await fixture({ access: "access_pending" });
    // No requests: no Invitations heading.
    await page.goto(`${base}/account`);
    await expect(heading(page, "Waiting for access")).toBeVisible();
    await expect(page.getByText("If someone invited you to a resbite, open their link again.", { exact: true })).toBeVisible();
    await expect(heading(page, "Invitations")).toHaveCount(0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log("PASS: the waiting-for-access screen shows no Invitations heading without requests.");
  }
  for (const [stored, label, asks] of [
    ["accepted", "Going", true],
    ["maybe", "Maybe", true],
    ["declined", "Can’t go", false],
  ]) {
    // Answered on the web, then signed in here while still waiting: the phone's permission was never asked for and
    // the ask's flag is unset. The stored answer is the moment, with nothing changed on this screen.
    const { page, errors, state } = await fixture({
      access: "access_pending",
      quiet: false,
      requests: [{ ...card, host: "Sam", status: "waiting", response: stored }],
    });
    await page.goto(`${base}/waiting?plan=${PLAN}`);
    await expect(heading(page, "Waiting for Sam")).toBeVisible();
    await expect(page.getByRole("radio", { name: label, exact: true })).toBeChecked();
    assert.equal(await page.evaluate(() => globalThis.__resbiteDevice.permission), "undetermined");
    if (asks) {
      await expect(heading(page, ASK_TITLE)).toBeVisible();
      await expect.poll(() => asked(page)).toBe(true);
      await button(page, "Not now").click();
      await expect(heading(page, ASK_TITLE)).toHaveCount(0);
      await expect(page.getByRole("radio", { name: label, exact: true })).toBeChecked();
      // Once: opening the screen again doesn't ask again.
      await page.reload();
      await expect(heading(page, "Waiting for Sam")).toBeVisible();
      await page.waitForTimeout(500); // a sheet would appear within this settle time
      await expect(heading(page, ASK_TITLE)).toHaveCount(0);
    } else {
      await page.waitForTimeout(500); // a sheet would appear within this settle time
      await expect(heading(page, ASK_TITLE)).toHaveCount(0);
      assert.equal(await asked(page), false, "Can’t go doesn't use up the ask");
    }
    assert.deepEqual(state.changes, [], "the answer was not changed");
    assert.equal(await page.evaluate(() => globalThis.__resbiteDevice.permission), "undetermined");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      asks
        ? `PASS: a waiting account with ${label} stored (permission never asked, the flag unset) is asked "Get notified?" on /waiting without changing its answer, once: Not now, then opening the screen again, doesn't ask again.`
        : `PASS: a waiting account with ${label} stored is not asked on /waiting, and the ask's flag stays unset.`,
    );
  }
} finally {
  await browser.close();
}
