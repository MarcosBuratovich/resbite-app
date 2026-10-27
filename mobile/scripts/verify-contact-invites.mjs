// Contact invitations in headless Chrome (Plan 2): Invite people's Pick step (the "On Resbite" lookup for the picked
// numbers only), Invite N with a personal code each, Almost there (in the app, WhatsApp and Messages), inviting the
// same number again with its stored code, the event page's Invited group (WhatsApp and Messages, Remove), an Invitations card on
// My resbites answered Going, and Add your number's offer to bring in a web-only account, with no 000000 anywhere
// and no contact's number where it doesn't belong. Every Supabase request is answered by the fixture below; any
// other path fails the run.
// The browser can't read phone contacts (the contacts service refuses on web, as verify-people shows), so the three
// contacts are picked with "Add a number", which runs the same pick, lookup and invite code.
// Linking.openURL opens with window.open on the web: it is stubbed to record the URL. On the web canOpenURL always
// says yes, so a refused open (window.open throwing) stands in for "WhatsApp isn’t installed".
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, heading, inOrder, quietReminders, visible } from "./qa-helpers.mjs";
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const STORAGE_KEY = "sb-ewcsgvhuojxdpaspwsrx-auth-token";
const HOST = "11111111-1111-4111-8111-111111111111";
const JO = "33333333-3333-4333-8333-333333333333";
const CODE_STORE = `resbite.invite-codes.v1.${HOST}`;
const PERSONAL_CODE = /^[A-Za-z0-9_-]{22}$/;
// Three contacts typed three ways; the host's own number is +44 7700 900834, so local numbers read as GB.
const ANA = { name: "Ana Ruiz", typed: "07700 900123", e164: "+447700900123", digits: "447700900123", label: "+44 7700 900123" };
const BEN = { name: "Ben Ito", typed: "+44 7700 900456", e164: "+447700900456", digits: "447700900456", label: "+44 7700 900456" };
const CY = { name: "Cy Okafor", typed: "0044 7700 900789", e164: "+447700900789", digits: "447700900789", label: "+44 7700 900789" };
const CONTACTS = [ANA, BEN, CY];
// The national significant number: what every way of writing the number has in common.
const nsn = (p) => p.digits.slice(2);
const TAKEN = "+447700900111";
const STORED_CODE = "123456";
const now = () => new Date().toISOString();
const jwt = (sub) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ sub, exp, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");
};
const host = {
  id: HOST,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  // auth.users.phone is digits-only.
  phone: "447700900834",
  phone_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
};
const coffee = {
  id: "22222222-2222-4222-8222-222222222222",
  activity_id: "coffee-together",
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
  owner_id: HOST,
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
  guest_note: "",
  guest_note_at: null,
};
// Jo invited the host in the app: an unanswered invitation, shown under Invitations on My resbites.
const games = {
  ...coffee,
  id: "44444444-4444-4444-8444-444444444444",
  activity_id: null,
  title: "Board games",
  description: "",
  owner_id: JO,
  starts_at: "2099-03-02T18:00:00Z",
  ends_at: null,
  place_label: "Games room",
  area: "Near the station",
};
const MESSAGE = (code) =>
  `Marcos invited you to Coffee evening, Sun 1 Mar, 15:00 – 17:00. Reply here: https://link.resbite.com/i/${code}`;

/**
 * A page signed in as `user` on a stubbed Supabase. The host's event, its guests and phone invitations, and Jo's
 * invitation change as the app writes to them. TAKEN belongs to a web-only account, which the fold brings in.
 */
async function fixture({ user = host, width = 390, foldStatus = 200 } = {}) {
  // en-GB and London: local numbers are GB, and the event's times read as in the message.
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  await quietReminders(context);
  const page = await context.newPage();
  const appToken = jwt(user.id);
  const foreignToken = jwt("99999999-9999-4999-8999-999999999999");
  await page.addInitScript(
    ({ key, session }) => {
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem("fixture-seeded", "1");
      }
      window.__opened = [];
      window.open = (url) => {
        if (window.__blockOpen) throw Error("Fixture: this app isn't installed");
        window.__opened.push(String(url));
        return null;
      };
    },
    {
      key: STORAGE_KEY,
      session: {
        user,
        access_token: appToken,
        refresh_token: "fixture",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
      },
    },
  );
  const state = {
    user: { ...user },
    plans: new Map([
      [coffee.id, { ...coffee }],
      [games.id, { ...games }],
    ]),
    // The host's guests; the one invited in the app joins as Not answered yet.
    guests: [{ user_id: "g1", response: "accepted", profiles: { display_name: "Alex" } }],
    // The host's own answer on Jo's event.
    mine: { [games.id]: { version: 1, response: "pending" } },
    // The host's phone invitations by digits: what plan_phone_invitations lists.
    invitations: new Map(),
    onResbite: new Set([ANA.digits]),
  };
  const log = [],
    errors = [],
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The taken number's 422 is the refusal under test, as are the fold's 409 and 404 in section 8.
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (422|409|404)/.test(m.text()))
      errors.push(m.text());
  });
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;
    const q = url.searchParams;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    log.push({ method, path, search: url.search, body, headers: req.headers() });
    const one = req.headers().accept?.includes("object");
    const reply = (value, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    const empty = () => route.fulfill({ status: 204, body: "" });
    const id = (name) => q.get(name)?.replace(/^eq\./, "");
    if (path === "/auth/v1/user") {
      if (method === "GET") return reply(state.user);
      if (method === "PUT" && body?.phone === TAKEN)
        return reply({ code: 422, error_code: "phone_exists", msg: "A user with this phone number has already been registered" }, 422);
    }
    // The fold's code goes to the web-only account on TAKEN, from a client of its own: never a new account.
    if (method === "POST" && path === "/auth/v1/otp" && body?.phone === TAKEN && body.create_user === false) return reply({});
    if (path === "/rest/v1/rpc/exchange_test_code") return reply(STORED_CODE);
    if (method === "POST" && path === "/auth/v1/verify" && body?.phone === TAKEN && body.token === STORED_CODE && body.type === "sms")
      return reply({
        access_token: foreignToken,
        refresh_token: "web-fixture",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: "99999999-9999-4999-8999-999999999999",
          aud: "authenticated",
          role: "authenticated",
          phone: TAKEN.slice(1),
          phone_confirmed_at: now(),
          app_metadata: { provider: "phone", providers: ["phone"] },
          user_metadata: {},
          created_at: "2026-10-27T09:00:00Z",
        },
      });
    if (method === "POST" && path === "/functions/v1/fold-phone-account") {
      // Refused (409: the number's account has used the app) or not deployed (404): nothing moves.
      if (foldStatus === 409) return reply({ error: "conflict" }, 409);
      if (foldStatus === 404) return reply({ code: "NOT_FOUND", message: "Requested function was not found" }, 404);
      // The fold moves the web account's number (and its resbites) onto this account.
      state.user = { ...state.user, phone: TAKEN.slice(1), phone_confirmed_at: now() };
      return reply({ ok: true });
    }
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: state.user.id, status: "approved" });
    if (path === "/rest/v1/rpc/note_app_session") return empty();
    if (path === "/rest/v1/profiles") {
      // My resbites reads the hosts of its invitations together.
      if (q.get("id")?.startsWith("in.")) return reply(q.get("id").includes(JO) ? [{ id: JO, display_name: "Jo" }] : []);
      if (id("id") === JO) return reply({ display_name: "Jo" });
      return reply({ id: state.user.id, display_name: "Marcos", avatar_path: null, avatar_revision: 0 });
    }
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/plans") {
      const rows = [...state.plans.values()]
        .filter((p) => !id("id") || p.id === id("id"))
        .map((p) => ({ ...p, has_meeting_details: false, plan_meeting_details: null }));
      return reply(one ? (rows[0] ?? null) : rows);
    }
    if (path === "/rest/v1/attendees") {
      const plan = id("plan_id");
      // The person's own answer (the event page and the answer's read and confirm).
      if (one) return reply(state.mine[plan] ?? null);
      // The reminder sync's read; quiet here, but answered all the same.
      if (q.get("select") === "plan_id,response")
        return reply(Object.entries(state.mine).map(([plan_id, a]) => ({ plan_id, response: a.response })));
      // My resbites: everyone on the host's event, and the host's own row on each invitation.
      if (!plan)
        return reply([
          ...state.guests.map((g) => ({ ...g, plan_id: coffee.id, version: 1 })),
          ...Object.entries(state.mine).map(([plan_id, a]) => ({
            plan_id,
            user_id: HOST,
            response: a.response,
            version: a.version,
            profiles: { display_name: "Marcos" },
          })),
        ]);
      return reply(plan === coffee.id ? state.guests : []);
    }
    if (path === "/rest/v1/rpc/plan_link") return reply("AbCdEfGhIjKlMnOpQrStUv");
    // Open-link approval: nobody has answered the event link (the host's Waiting for you and My resbites' requests
    // are empty; verify-event and verify-open-link-app cover them).
    if (path === "/rest/v1/rpc/plan_join_requests" || path === "/rest/v1/rpc/my_join_requests") return reply([]);
    if (path === "/rest/v1/rpc/contacts_on_resbite") return reply(body.p_phones.filter((p) => state.onResbite.has(p)));
    if (path === "/rest/v1/rpc/invite_contacts") {
      assert.equal(body.p_plan, coffee.id);
      return reply(
        body.p_invites.map(({ phone, country, code }) => {
          if (state.onResbite.has(phone)) {
            if (!state.guests.some((g) => g.user_id === `app-${phone}`))
              state.guests.push({ user_id: `app-${phone}`, response: "pending", profiles: { display_name: ANA.name } });
            return { phone, kind: "app" };
          }
          // One invitation per number: a new code replaces the old link's.
          state.invitations.set(phone, { phone, country, code, answered: false, response: null });
          return { phone, kind: "link" };
        }),
      );
    }
    if (path === "/rest/v1/rpc/plan_phone_invitations") {
      assert.equal(body.p_plan, coffee.id);
      return reply([...state.invitations.values()].map(({ phone, country, answered, response }) => ({ phone, country, answered, response })));
    }
    if (path === "/rest/v1/rpc/revoke_phone_invitation") {
      state.invitations.delete(body.p_phone);
      return empty();
    }
    if (path === "/rest/v1/rpc/respond") {
      const mine = state.mine[body.p_plan];
      assert.equal(body.p_version, mine.version);
      state.mine[body.p_plan] = { version: mine.version + 1, response: body.p_response };
      return reply(mine.version + 1);
    }
    unexpected.push(`${method} ${path}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });
  return {
    page,
    log,
    state,
    appToken,
    foreignToken,
    calls: (path) => log.filter((x) => x.method === "POST" && x.path === path),
    opened: () => page.evaluate(() => window.__opened),
    stored: () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "{}"), CODE_STORE),
    async done() {
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors");
      await context.close();
    },
  };
}

/** The test code never shows: no text, label, placeholder or field holds 000000 except the code field itself. */
async function noTestCode(page, where) {
  const found = await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.includes("000000")) hits.push(`text "${n.data}"`);
    for (const el of document.querySelectorAll("*")) {
      const code = el.matches("input[aria-label='6-digit code']");
      for (const name of ["aria-label", "aria-description", "aria-valuetext", "placeholder", "title", "alt", "value"])
        if (!(code && name === "value") && el.getAttribute(name)?.includes("000000")) hits.push(`${name} on ${el.tagName}`);
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !code && el.value.includes("000000"))
        hits.push(`value of ${el.getAttribute("aria-label")}`);
    }
    if (document.title.includes("000000") || location.href.includes("000000")) hits.push("title or address");
    return hits;
  });
  assert.deepEqual(found, [], `no test code on ${where}`);
}

/**
 * Which of these people's numbers show on the page, written any way (+44 7700 900456, 07700 900456, 447700900456):
 * in text, labels and other attributes, field values, the title and the address. Each string is read on its own.
 */
async function numbersShown(page, people) {
  return page.evaluate((people) => {
    const strings = [document.title, location.href];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) strings.push(n.data);
    for (const el of document.querySelectorAll("*")) {
      for (const name of ["aria-label", "aria-description", "aria-valuetext", "placeholder", "title", "alt", "href"]) {
        const value = el.getAttribute(name);
        if (value) strings.push(value);
      }
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") strings.push(el.value);
    }
    const digits = strings.map((s) => s.replace(/\D/g, ""));
    return people.filter((p) => digits.some((d) => d.includes(p.nsn))).map((p) => p.name);
  }, people.map((p) => ({ name: p.name, nsn: nsn(p) })));
}
/** A contact's number in browser storage, outside the host's own invitation codes. */
async function numbersStoredElsewhere(page) {
  return page.evaluate(
    ({ people, codes }) => {
      const hits = [];
      for (const store of [localStorage, sessionStorage])
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key === codes) continue;
          const digits = `${key} ${store.getItem(key)}`.replace(/\D/g, "");
          for (const p of people) if (digits.includes(p.nsn)) hits.push(`${p.name} in ${key}`);
        }
      return hits;
    },
    { people: CONTACTS.map((p) => ({ name: p.name, nsn: nsn(p) })), codes: CODE_STORE },
  );
}

const row = (page, p, onResbite = false) =>
  page.getByRole("checkbox", { name: `${p.name}, ${p.label}${onResbite ? ", On Resbite" : ""}`, exact: true });
async function addNumber(page, p) {
  await page.getByLabel("Name (optional)", { exact: true }).fill(p.name);
  await page.getByLabel("Phone number", { exact: true }).fill(p.typed);
  await button(page, "Add").click();
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue("");
}

try {
  // 1–5 and 8: the host invites three contacts to Coffee evening, sends two links, invites one again, then manages
  // the Invited group on the event page.
  let benCode, cyCode;
  {
    const f = await fixture(),
      { page } = f;
    await page.goto(`${base}/event?plan=${coffee.id}`);
    await expect(heading(page, "Coffee evening")).toBeVisible();
    await button(page, "Invite someone").click();
    await expect(heading(page, "Invite people")).toBeVisible();
    // The Pick step: the web says contacts are in the iPhone app. The event link is on the event page now, not here.
    await expect(page.getByText("Phone contacts are in the iPhone app. You can add a number below.", { exact: true })).toBeVisible();
    await expect(heading(page, "Event link")).toHaveCount(0);
    await expect(button(page, "Share link")).toHaveCount(0);
    await expect(button(page, "Invite 0")).toBeDisabled();
    await noTestCode(page, "the Pick step");
    // Nothing is looked up before anything is picked.
    await page.waitForTimeout(600);
    assert.equal(f.calls("/rest/v1/rpc/contacts_on_resbite").length, 0, "no lookup before a pick");
    // 1. Pick three contacts: the lookup carries only their digits, and Ana is On Resbite.
    for (const p of CONTACTS) await addNumber(page, p);
    await expect(row(page, ANA, true)).toBeVisible();
    await expect(row(page, ANA, true)).toHaveAttribute("aria-checked", "true");
    for (const p of [BEN, CY]) await expect(row(page, p)).toHaveAttribute("aria-checked", "true");
    await expect(visible(page.getByText("On Resbite", { exact: true }))).toHaveCount(1);
    const lookups = f.calls("/rest/v1/rpc/contacts_on_resbite").map((x) => x.body.p_phones);
    assert.ok(lookups.length >= 1);
    for (const phones of lookups)
      for (const phone of phones) assert.ok(CONTACTS.some((p) => p.digits === phone), `the lookup carries only picked digits: ${phone}`);
    assert.deepEqual([...new Set(lookups.flat())].sort(), CONTACTS.map((p) => p.digits).sort());
    await expect(page.getByText("Resbite checks only the numbers you pick.", { exact: true })).toBeVisible();
    // 2. Invite 3: three items, each with its own 22-character code. Ana is invited in the app; Ben and Cy get links.
    await button(page, "Invite 3").click();
    await expect(heading(page, "Almost there")).toBeVisible();
    const [sent] = f.calls("/rest/v1/rpc/invite_contacts");
    assert.equal(sent.body.p_plan, coffee.id);
    assert.equal(sent.body.p_invites.length, 3);
    assert.deepEqual(sent.body.p_invites.map((i) => i.phone).sort(), CONTACTS.map((p) => p.digits).sort());
    for (const item of sent.body.p_invites) {
      assert.match(item.code, PERSONAL_CODE);
      assert.equal(item.country, "44");
    }
    assert.equal(new Set(sent.body.p_invites.map((i) => i.code)).size, 3, "each number has its own code");
    benCode = sent.body.p_invites.find((i) => i.phone === BEN.digits).code;
    cyCode = sent.body.p_invites.find((i) => i.phone === CY.digits).code;
    await expect(page.getByText("Ana Ruiz is invited. They’ll see it in Resbite.", { exact: true })).toBeVisible();
    await expect(page.getByText("Not on Resbite yet", { exact: true })).toBeVisible();
    for (const p of [BEN, CY]) {
      await expect(page.getByText(p.name, { exact: true })).toBeVisible();
      await expect(button(page, `WhatsApp: ${p.name}`)).toBeVisible();
      await expect(button(page, `Messages: ${p.name}`)).toBeVisible();
    }
    await expect(button(page, `WhatsApp: ${ANA.name}`)).toHaveCount(0);
    await expect(page.getByText("Each link only works for that person’s number.", { exact: true })).toBeVisible();
    // The host may see their own contacts' numbers: each link row shows it (and the check below can see them).
    assert.deepEqual(await numbersShown(page, [BEN, CY]), [BEN.name, CY.name]);
    // Only the links are kept on this phone, with the names they were made for; Ana's number isn't.
    assert.deepEqual(await f.stored(), {
      [coffee.id]: { [BEN.e164]: { code: benCode, name: BEN.name }, [CY.e164]: { code: cyCode, name: CY.name } },
    });
    await noTestCode(page, "Almost there");
    // 3. WhatsApp opens the WhatsApp app with Ben's number and his personal link (controller ruling R6:
    // whatsapp://send after canOpenURL, not wa.me), then says so.
    await button(page, `WhatsApp: ${BEN.name}`).click();
    await expect(page.getByText("Sent on WhatsApp", { exact: true })).toBeVisible();
    const [whatsapp] = await f.opened();
    assert.equal(whatsapp, `whatsapp://send?phone=${BEN.digits}&text=${encodeURIComponent(MESSAGE(benCode))}`);
    assert.match(decodeURIComponent(whatsapp), new RegExp(`https://[a-z0-9.-]+/i/${benCode}$`));
    assert.equal((await f.stored())[coffee.id][BEN.e164].sentVia, "whatsapp");
    // WhatsApp that won't open says so and records nothing; Messages then sends Cy's link.
    await page.evaluate(() => (window.__blockOpen = true));
    await button(page, `WhatsApp: ${CY.name}`).click();
    await expect(page.getByText("WhatsApp isn’t installed. Try Messages.", { exact: true })).toBeVisible();
    assert.equal((await f.stored())[coffee.id][CY.e164].sentVia, undefined);
    await page.evaluate(() => (window.__blockOpen = false));
    await button(page, `Messages: ${CY.name}`).click();
    await expect(page.getByText("Sent on Messages", { exact: true })).toBeVisible();
    await expect(page.getByText("WhatsApp isn’t installed. Try Messages.", { exact: true })).toHaveCount(0);
    assert.equal((await f.opened())[1], `sms:${CY.e164}?body=${encodeURIComponent(MESSAGE(cyCode))}`);
    assert.equal((await f.stored())[coffee.id][CY.e164].sentVia, "messages");
    // 4. Invite people again for Ben: the stored code is sent again, and Almost there remembers WhatsApp.
    await button(page, "Done").click();
    await expect(heading(page, "Coffee evening")).toBeVisible();
    await button(page, "Invite someone").click();
    await expect(heading(page, "Invite people")).toBeVisible();
    await addNumber(page, BEN);
    await expect(row(page, BEN)).toHaveAttribute("aria-checked", "true");
    await button(page, "Invite 1").click();
    await expect(heading(page, "Almost there")).toBeVisible();
    const again = f.calls("/rest/v1/rpc/invite_contacts")[1].body.p_invites;
    assert.deepEqual(again, [{ phone: BEN.digits, country: "44", code: benCode }], "the stored code is reused");
    await expect(page.getByText("Sent on WhatsApp", { exact: true })).toBeVisible();
    await button(page, "Done").click();
    // 5. The event page's Invited group shows Ben and Cy by name; Ana, invited in the app, is a guest.
    await expect(heading(page, "Coffee evening")).toBeVisible();
    await button(page, "1 going").click();
    await expect(heading(page, "Guests")).toBeVisible();
    await expect(heading(page, "Not answered yet")).toBeVisible();
    await expect(heading(page, "Invited")).toBeVisible();
    for (const p of [ANA, BEN, CY]) await expect(page.getByText(p.name, { exact: true })).toBeVisible();
    for (const p of [BEN, CY]) await expect(button(page, `Remove ${p.name}`)).toBeVisible();
    // Each row offers WhatsApp and Messages, the one used last first: WhatsApp for Ben, Messages for Cy.
    const resend = (app, p) => button(page, `Send again on ${app}: ${p.name}`);
    for (const p of [BEN, CY]) for (const app of ["WhatsApp", "Messages"]) await expect(resend(app, p)).toBeVisible();
    assert.ok(
      await inOrder(page, [resend("WhatsApp", BEN), resend("Messages", BEN), resend("Messages", CY), resend("WhatsApp", CY)]),
      "the last-used app comes first on each row",
    );
    await noTestCode(page, "the Guests sheet");
    // Send again on WhatsApp opens it with Ben's same link.
    await resend("WhatsApp", BEN).click();
    await expect.poll(async () => (await f.opened()).length).toBe(3);
    assert.equal((await f.opened())[2], whatsapp);
    // Where WhatsApp won't open, it says so, and Messages is right there with the same link.
    await page.evaluate(() => (window.__blockOpen = true));
    await resend("WhatsApp", BEN).click();
    await expect(page.getByText("WhatsApp isn’t installed. Try Messages.", { exact: true })).toBeVisible();
    await expect(resend("Messages", BEN)).toBeEnabled();
    await page.evaluate(() => (window.__blockOpen = false));
    await resend("Messages", BEN).click();
    await expect.poll(async () => (await f.opened()).length).toBe(4);
    assert.equal((await f.opened())[3], `sms:${BEN.e164}?body=${encodeURIComponent(MESSAGE(benCode))}`);
    await expect(page.getByText("WhatsApp isn’t installed. Try Messages.", { exact: true })).toHaveCount(0);
    assert.equal(f.calls("/rest/v1/rpc/invite_contacts").length, 2, "a stored code is sent again without a new invite");
    // Remove asks first; Keep changes nothing; Remove turns Cy's invitation off.
    let asked = "";
    page.once("dialog", (d) => {
      asked = d.message();
      return d.dismiss();
    });
    await button(page, `Remove ${CY.name}`).click();
    await expect.poll(() => asked).toBe("Remove the invitation for Cy Okafor?");
    await page.waitForTimeout(200);
    assert.equal(f.calls("/rest/v1/rpc/revoke_phone_invitation").length, 0);
    page.once("dialog", (d) => d.accept());
    await button(page, `Remove ${CY.name}`).click();
    await expect(page.getByText(CY.name, { exact: true })).toHaveCount(0);
    await expect(page.getByText(BEN.name, { exact: true })).toBeVisible();
    assert.deepEqual(
      f.calls("/rest/v1/rpc/revoke_phone_invitation").map((x) => x.body),
      [{ p_plan: coffee.id, p_phone: CY.digits }],
    );
    assert.deepEqual(Object.keys((await f.stored())[coffee.id]), [BEN.e164], "Cy's code is gone from this phone");
    await button(page, "Close sheet").click();
    // 8. A contact's number travels only in the lookup, the invite and the removal: never in an address or any
    // other request, never kept outside the host's invitation codes, and never shown on My resbites.
    for (const x of f.log) {
      const carried = CONTACTS.filter((p) => JSON.stringify({ s: x.search, b: x.body }).replace(/\D/g, "").includes(nsn(p)));
      if (!carried.length) continue;
      assert.ok(
        ["/rest/v1/rpc/contacts_on_resbite", "/rest/v1/rpc/invite_contacts", "/rest/v1/rpc/revoke_phone_invitation"].includes(x.path),
        `${x.method} ${x.path}${x.search} carries ${carried.map((p) => p.name)}`,
      );
      for (const p of carried) assert.ok(!x.search.replace(/\D/g, "").includes(nsn(p)), `no number in the address of ${x.path}`);
    }
    assert.deepEqual(await numbersStoredElsewhere(page), []);
    await page.goto(`${base}/plans`);
    await expect(heading(page, "My resbites")).toBeVisible();
    await expect(button(page, /^Coffee evening, /)).toBeVisible();
    assert.deepEqual(await numbersShown(page, CONTACTS), [], "My resbites shows no contact's number");
    await f.done();
    console.log(
      "PASS: Pick three numbers (the lookup carries only their digits; one On Resbite), Invite 3 with a 22-character code each, Almost there with the in-app sentence and WhatsApp/Messages for two, WhatsApp opens whatsapp://send with the personal /i/ link and says Sent on WhatsApp, a refused WhatsApp says so, Messages, inviting again reuses the stored code, the Invited group with WhatsApp and Messages on each row (last-used first; a refused WhatsApp leaves Messages beside it) and Remove (revoke_phone_invitation), and contact numbers only where they belong.",
    );
  }

  // 6. My resbites: Jo's invitation is a card under Invitations; Going on the card answers it and moves it to Upcoming.
  {
    const f = await fixture(),
      { page } = f;
    await page.goto(`${base}/plans`);
    await expect(heading(page, "Invitations")).toBeVisible();
    const invitation = button(page, /^Jo invited you, Board games, /);
    await expect(invitation).toBeVisible();
    // Unanswered: the area, never the exact place.
    await expect(invitation).toHaveAttribute("aria-label", /, Near the station, /);
    await expect(invitation).not.toHaveAttribute("aria-label", /Games room/);
    // It isn't in Upcoming as well.
    await expect(button(page, /^Board games, /)).toHaveCount(0);
    await expect(button(page, /^Coffee evening, /)).toBeVisible();
    await noTestCode(page, "My resbites with an invitation");
    const answer = page.getByRole("radiogroup", { name: "Your answer to Board games", exact: true });
    await answer.getByRole("radio", { name: "Going", exact: true }).click();
    await expect(heading(page, "Invitations")).toHaveCount(0);
    const upcoming = button(page, /^Board games, /);
    await expect(upcoming).toBeVisible();
    await expect(upcoming).toHaveAttribute("aria-label", /, Games room, Invited, Going/);
    assert.deepEqual(
      f.calls("/rest/v1/rpc/respond").map((x) => x.body),
      [{ p_plan: games.id, p_response: "accepted", p_version: 1 }],
    );
    await f.done();
    console.log("PASS: My resbites shows Jo's invitation under Invitations (not in Upcoming); Going on the card sends respond and moves it to Upcoming.");
  }

  // 7. Add your number with a number a web-only account holds: the offer, a code to that account from a client of
  // its own, then the fold with the app's token and the web account's token. 000000 never shows.
  {
    const phoneless = { ...host, phone: undefined, phone_confirmed_at: undefined, app_metadata: { provider: "email", providers: ["email"] } };
    const f = await fixture({ user: phoneless }),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "Add your number")).toBeVisible();
    await noTestCode(page, "Add your number");
    await page.getByLabel("Mobile number", { exact: true }).fill("07700 900111");
    await button(page, "Send code").click();
    await expect(
      page.getByText(
        "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "If this number answered an invitation on the web, confirm it with a code to bring its resbites here.",
        { exact: true },
      ),
    ).toBeVisible();
    await noTestCode(page, "the fold offer");
    // The offer has its own button; the screen's Send code stays below it, the only one of that name.
    await expect(visible(page.getByRole("button", { name: "Send code", exact: true }))).toHaveCount(1);
    await button(page, "Confirm with a code").click();
    await expect(heading(page, "Enter the code")).toBeVisible();
    await expect(page.getByText("We sent a 6-digit code to +44 7700 900111.", { exact: true })).toBeVisible();
    const otp = f.calls("/auth/v1/otp");
    assert.equal(otp.length, 1);
    assert.deepEqual([otp[0].body.phone, otp[0].body.create_user], [TAKEN, false], "the code never creates an account");
    assert.notEqual(otp[0].headers.authorization, `Bearer ${f.appToken}`, "the code is sent without the app's session");
    await noTestCode(page, "the fold code step");
    await page.getByLabel("6-digit code", { exact: true }).fill("000000");
    await expect(heading(page, "Create")).toBeVisible();
    // 000000 swapped for the stored code, verified on the web account, then the fold with both tokens.
    const [exchange] = f.calls("/rest/v1/rpc/exchange_test_code");
    assert.deepEqual(exchange.body, { p_phone: TAKEN, p_code: "000000" });
    const verify = f.calls("/auth/v1/verify");
    assert.equal(verify.length, 1);
    assert.deepEqual([verify[0].body.phone, verify[0].body.token, verify[0].body.type], [TAKEN, STORED_CODE, "sms"]);
    const fold = f.calls("/functions/v1/fold-phone-account");
    assert.equal(fold.length, 1);
    assert.equal(fold[0].headers.authorization, `Bearer ${f.appToken}`, "the fold carries the app's token");
    assert.deepEqual(fold[0].body, { foreign_token: f.foreignToken, phone: TAKEN }, "and the web account's token");
    const order = ["/rest/v1/rpc/exchange_test_code", "/auth/v1/verify", "/functions/v1/fold-phone-account"].map((p) =>
      f.log.findIndex((x) => x.path === p),
    );
    assert.ok(order[0] < order[1] && order[1] < order[2], "exchange, verify, fold");
    assert.deepEqual(
      f.log.filter((x) => x.method === "PUT" && x.path === "/auth/v1/user").map((x) => x.body.phone),
      [TAKEN],
      "the ordinary add was tried once, and refused",
    );
    // The app's own session stays; the web account's token is never kept.
    const kept = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    assert.ok(kept.includes(f.appToken), "the app's session is unchanged");
    assert.ok(!kept.includes(f.foreignToken), "the web account's token isn't stored");
    await noTestCode(page, "Create after the fold");
    await f.done();
    console.log(
      "PASS: Add your number with a taken number shows the fold offer; its code goes to the web account (create_user false, not the app's session); 000000 is swapped for the stored code; the fold posts to /functions/v1/fold-phone-account with the app's bearer token and the web account's token; the web token isn't stored; no 000000 shows.",
    );
  }
  // 8. A fold the server refuses (409) shows the taken copy with its support line; one that isn't deployed (404) says
  // folding isn't switched on. Neither keeps a Retry, and nothing posts again with the spent code.
  for (const [foldStatus, words] of [
    [409, "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help."],
    [404, "Bringing an invitation into this account isn’t switched on yet."],
  ]) {
    const phoneless = { ...host, phone: undefined, phone_confirmed_at: undefined, app_metadata: { provider: "email", providers: ["email"] } };
    const f = await fixture({ user: phoneless, foldStatus }),
      { page } = f;
    await page.goto(base);
    await expect(heading(page, "Add your number")).toBeVisible();
    await page.getByLabel("Mobile number", { exact: true }).fill("07700 900111");
    await button(page, "Send code").click();
    await button(page, "Confirm with a code").click();
    await expect(heading(page, "Enter the code")).toBeVisible();
    await page.getByLabel("6-digit code", { exact: true }).fill("000000");
    await expect(page.getByText(words, { exact: true })).toBeVisible();
    await expect(heading(page, "Enter the code")).toBeVisible();
    await expect(button(page, "Retry")).toHaveCount(0);
    assert.equal(f.calls("/functions/v1/fold-phone-account").length, 1, `${foldStatus}: one post`);
    assert.equal(f.calls("/auth/v1/verify").length, 1, `${foldStatus}: the code is verified once`);
    // Typing the spent code again does nothing.
    await page.getByLabel("6-digit code", { exact: true }).fill("");
    await page.getByLabel("6-digit code", { exact: true }).fill("000000");
    await page.waitForTimeout(300);
    assert.equal(f.calls("/auth/v1/verify").length, 1, `${foldStatus}: never verified again`);
    assert.equal(f.calls("/functions/v1/fold-phone-account").length, 1, `${foldStatus}: never posted again`);
    const kept = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    assert.ok(!kept.includes(f.foreignToken), "the web account's token isn't stored");
    await noTestCode(page, `the fold's ${foldStatus}`);
    await f.done();
  }
  console.log("PASS: a refused fold (409) shows the taken copy and an undeployed one (404) shows foldOff, with no Retry and no second verify or post.");
  console.log("PASS: contact invitations, the Invited group, Invitations and the fold offer. All Supabase requests intercepted.");
} finally {
  await browser.close();
}
