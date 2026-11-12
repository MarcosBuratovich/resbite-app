// The circle of trust in headless Chrome (CO-04 to CO-07). Every Supabase request is answered by a small server model
// below, which follows the circles migration's rules; a request it does not expect, and any request off this machine,
// fail the run. The RPCs the app sends are asserted by name and arguments.
//   host       Invite people as Ana, the plan saved at (1, 2): the Circle of trust card shows "1" and "2 levels", the
//              read of the plan names bring_invites and bring_levels (the stub records every plans read's select, and
//              drops the two columns from a read of the plan that names neither them nor *);
//              "2" sends set_plan_circle { p_plan, p_invites: 2, p_levels: 2 }, "1" sends { …, 1, 2 }; the sentence
//              names Pedro; a refused save (22023) says so and shows the saved choice again
//   bring      Pedro, Going, with my_bring_allowance { 1, 0, 1, 1, true }: the resbite's Bring someone row and line;
//              bring mode's title and line, no event link and no circle card; one connection ticked, a second disabled;
//              Invite 1 sends invite_contacts with one { user }; back on the resbite "You brought Marta"; on the people
//              list Marta reads "Invited in the app · brought by you", and Remove takes the invitation back
//              (withdraw_brought_invitation { p_plan, p_user }), so Bring someone is back
//   number     Pedro brings a phone contact: invite_contacts answers link, and WhatsApp opens with "Pedro invited you to
//              Ana’s Board game night, <when>. Reply here: <link>"; on the people list the link reads "brought by you",
//              Send again on WhatsApp opens the same message, and Remove sends revoke_phone_invitation
//   chain      Ana's people list: the circle in words, Marta right under Pedro with "Brought by Pedro" (plan_bringers),
//              and Pedro's link as "Number ending ••23 · Invited by link · brought by Pedro", whose Remove sends
//              revoke_brought_invitation { p_plan, p_invitation }; with no bringer name to show, no words
// Run it against Expo web: RESBITE_QA_URL gives the app's address (default http://localhost:8081). When Expo was started
// with a stand-in EXPO_PUBLIC_SUPABASE_URL, pass the same URL as RESBITE_QA_SUPABASE_URL, so the fixture session is
// stored under that project's key and only that host is answered. The hosted project's own URL is refused.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { button, heading, inOrder, noChat, quietReminders, visible } from "./qa-helpers.mjs";

const HOSTED_REF = "ewcsgvhuojxdpaspwsrx";
const supabaseUrl = process.env.RESBITE_QA_SUPABASE_URL ? new URL(process.env.RESBITE_QA_SUPABASE_URL) : null;
const ref = supabaseUrl ? supabaseUrl.hostname.split(".")[0] : HOSTED_REF;
if (supabaseUrl && (ref === HOSTED_REF || !supabaseUrl.hostname.endsWith(".supabase.co") || supabaseUrl.protocol !== "https:"))
  throw Error("RESBITE_QA_SUPABASE_URL must be a stand-in https://<ref>.supabase.co, never the hosted project");
const STORAGE_KEY = `sb-${ref}-auth-token`;
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";

const ANA = "11111111-1111-4111-8111-111111111111";
const PEDRO = "22222222-2222-4222-8222-222222222222";
const MARTA = "33333333-3333-4333-8333-333333333333";
const LEO = "44444444-4444-4444-8444-444444444444";
const SOFIA = "55555555-5555-4555-8555-555555555555";
const LINK_23 = "66666666-6666-4666-8666-666666666666";
const NAMES = { [ANA]: "Ana García", [PEDRO]: "Pedro Pérez", [MARTA]: "Marta Ruiz", [LEO]: "Leo Díaz", [SOFIA]: "Sofía Gil" };
// Synthetic numbers in Ofcom's drama range. Pedro's own decides how a local number is read (GB).
const PHONES = { [ANA]: "447700900801", [PEDRO]: "447700900802" };
const JULI = { name: "Juli Vega", typed: "07700 900123", digits: "447700900123", label: "+44 7700 900123" };
const PERSONAL_CODE = /^[A-Za-z0-9_-]{22}$/;
// Ana's resbite, saved with each person bringing 1, two levels. Thursday 5 March 2099 in London is GMT.
const PLAN = {
  id: "88888888-8888-4888-8888-888888888888",
  activity_id: null,
  title: "Board game night",
  description: "",
  categories: ["community"],
  owner_id: ANA,
  starts_at: "2099-03-05T18:00:00Z",
  ends_at: "2099-03-05T21:00:00Z",
  time_zone: "Europe/London",
  place_label: "Ana's flat",
  area: "Near the park",
  note: "",
  status: "active",
  version: 1,
  cover_path: null,
  cover_revision: 0,
  cover_description: "",
  guest_note: "",
  guest_note_at: null,
  place_tbd: false,
  repeat_weeks: null,
  series_id: "series-games",
  repeats_from: null,
  has_meeting_details: false,
  bring_invites: 1,
  bring_levels: 2,
};
const WHEN = "Thu 5 Mar, 18:00 – 21:00";
const MESSAGE = (code) => `Pedro invited you to Ana’s Board game night, ${WHEN}. Reply here: https://link.resbite.com/i/${code}`;
const OPEN = ["pending", "accepted", "maybe"];
/** Every fixture's problems, so a scenario that fails before its done() still names them. */
const problemsSeen = [];
const PROBLEMS = "every RPC named Ana's resbite, and only a guest brought";

const jwt = (sub) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ sub, exp, role: "authenticated" })).toString("base64url"),
    "fixture-only",
  ].join(".");
};
const userOf = (id) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: PHONES[id],
  phone_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
});
const first = (name) => name.trim().split(/\s+/)[0];
/** A select's top-level columns, embeds left out: "*,plan_admins(user_id)" gives ["*"]. */
const columnsOf = (select) =>
  (select ?? "*")
    .replace(/\w+\([^()]*\)/g, "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "access-control-expose-headers": "*",
};

/**
 * A page signed in as `me` on a stubbed Supabase that holds Ana's resbite: its guest rows (`guests`: who brought them
 * and their level), its personal links (`links`), and the people `me` is connected to. invite_contacts, the allowance,
 * the two people-list reads and the three take-backs follow the circles migration for this cast. `refuse` queues
 * refusals for the next calls of a function, by name ({ code, message } each). A request the model finds wrong (an RPC
 * naming another resbite, a host bringing) is refused and recorded in `problems`, which `done()` fails by name.
 */
async function fixture({ me, guests, links = [], connections = [], bringers = null, width = 390 }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  await quietReminders(context);
  const page = await context.newPage();
  const user = userOf(me);
  await page.addInitScript(
    ({ key, session }) => {
      if (!sessionStorage.getItem("fixture-seeded")) {
        sessionStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem("fixture-seeded", "1");
      }
      // Linking.openURL opens with window.open on the web: the URL is recorded instead.
      window.__opened = [];
      window.open = (url) => {
        window.__opened.push(String(url));
        return null;
      };
    },
    {
      key: STORAGE_KEY,
      session: {
        user,
        access_token: jwt(me),
        refresh_token: "fixture",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
      },
    },
  );
  const state = {
    plan: { ...PLAN },
    guests: guests.map((g) => ({ brought_by: null, level: 1, ...g })),
    links: links.map((l) => ({ brought_by: null, level: 1, revoked: false, answered: false, code: null, ...l })),
    connections: [...connections],
    refuse: {},
    /** Every /rest/v1/plans read, in order: the plan it names (null for a list) and its select. */
    planReads: [],
    /** What my_bring_allowance answered, in order. */
    allowances: [],
  };
  const log = [],
    errors = [],
    unexpected = [],
    problems = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The refusals under test answer 400 or 403.
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (400|403)/.test(m.text()))
      errors.push(m.text());
  });
  const isHost = (id) => id === state.plan.owner_id;
  const rowOf = (id) => state.guests.find((g) => g.user_id === id);
  const live = (l) => !l.revoked && !l.answered;
  /** bring_allowance, for this cast: Going or Maybe, on an open resbite, within the levels; the count apart. */
  function allowance(id) {
    if (isHost(id)) return { allowed: 0, used: 0, remaining: 0, level: 0, may_bring: false };
    const row = rowOf(id);
    if (!row) return null;
    const allowed = state.plan.bring_invites;
    const used =
      state.guests.filter((g) => g.brought_by === id && OPEN.includes(g.response)).length +
      state.links.filter((l) => l.brought_by === id && live(l)).length;
    const may_bring = ["accepted", "maybe"].includes(row.response) && allowed > 0 && row.level <= state.plan.bring_levels;
    return { allowed, used, remaining: Math.max(allowed - used, 0), level: row.level, may_bring };
  }
  /** invite_contacts for a guest who brings: new people are counted, and the whole call fails past what is left. */
  function bring(items) {
    const a = allowance(me);
    if (!a?.may_bring) return { code: "42501", message: "Not allowed to bring people here" };
    const level = rowOf(me).level + 1;
    const out = [],
      writes = [];
    let fresh = 0;
    for (const item of items) {
      if ("user" in item) {
        if (item.user === me) out.push({ user: item.user, kind: "self" });
        else if (isHost(item.user) || rowOf(item.user)) out.push({ user: item.user, kind: "already" });
        else {
          if (++fresh > a.remaining) return { code: "22023", message: "No invites left" };
          out.push({ user: item.user, kind: "app" });
          writes.push(() => state.guests.push({ user_id: item.user, response: "pending", brought_by: me, level }));
        }
        continue;
      }
      if (++fresh > a.remaining) return { code: "22023", message: "No invites left" };
      out.push({ phone: item.phone, kind: "link" });
      writes.push(() =>
        state.links.push({ id: `link-${item.phone}`, phone: item.phone, country: item.country, code: item.code, brought_by: me, level, revoked: false, answered: false }),
      );
    }
    for (const w of writes) w();
    return { ok: out };
  }

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
    const method = req.method();
    // Only the stand-in project is answered; anything else off this machine is never sent.
    if (supabaseUrl ? url.hostname !== supabaseUrl.hostname : !url.hostname.endsWith(".supabase.co")) {
      unexpected.push(`${method} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = url.pathname;
    const q = url.searchParams;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    log.push({ method, path, search: url.search, body });
    const reply = (value, status = 200) => route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(value) });
    const empty = () => route.fulfill({ status: 204, headers: CORS, body: "" });
    const refuse = ({ code, message }) => reply({ code, message, details: null, hint: null }, code === "42501" ? 403 : 400);
    const id = (name) => q.get(name)?.replace(/^eq\./, "");
    const rpc = path.startsWith("/rest/v1/rpc/") ? path.slice("/rest/v1/rpc/".length) : null;
    if (rpc && state.refuse[rpc]?.length) return refuse(state.refuse[rpc].shift());
    if (rpc && "p_plan" in (body ?? {}) && body.p_plan !== PLAN.id) {
      problems.push(`${rpc} names ${body.p_plan}, not Ana's resbite`);
      problemsSeen.push(problems.at(-1));
      return refuse({ code: "42501", message: "Fixture: not Ana's resbite" });
    }
    if (path === "/rest/v1/plans") state.planReads.push({ id: id("id") ?? null, select: q.get("select") });

    if (path === "/auth/v1/user") return reply(user);
    if (rpc === "account_access_status") return reply({ account_id: me, status: "approved" });
    if (rpc === "note_app_session") return empty();
    if (path === "/rest/v1/profiles") {
      const who = id("id") ?? me;
      return reply({ id: who, display_name: NAMES[who] ?? null, avatar_path: null, avatar_revision: 0 });
    }
    if (path === "/rest/v1/plans" && id("id") === PLAN.id) {
      // The plan's Revision 11: a read whose select doesn't name the circle's columns gets none back.
      const cols = columnsOf(q.get("select"));
      const row = { ...state.plan, plan_meeting_details: null, plan_admins: [] };
      if (!cols.includes("*")) for (const c of ["bring_invites", "bring_levels"]) if (!cols.includes(c)) delete row[c];
      return reply(row);
    }
    if (path === "/rest/v1/attendees" && id("plan_id") === PLAN.id) {
      // The person's own answer (the event page reads it alone).
      if (id("user_id")) {
        const row = rowOf(id("user_id"));
        return row ? reply({ version: 1, response: row.response }) : reply({ code: "PGRST116", message: "No rows" }, 406);
      }
      // Who the viewer may see (attendee_read): a host or an answered guest sees everyone.
      return reply(
        state.guests.map((g) => ({
          user_id: g.user_id,
          response: g.response,
          brought_by: g.brought_by,
          level: g.level,
          profiles: { display_name: NAMES[g.user_id] },
        })),
      );
    }
    if (["/rest/v1/activities", "/rest/v1/plans", "/rest/v1/attendees", "/rest/v1/plan_mutes"].includes(path)) return reply([]);
    if (rpc === "my_join_requests" || rpc === "plan_join_requests") return reply([]);
    if (rpc === "plan_connection_states") return reply({});
    // Chat plan 3's blocks, read beside the states: nobody blocked (verify-event and verify-chat cover them).
    if (rpc === "my_blocks") return reply([]);
    if (rpc === "plan_link") return reply("AbCdEfGhIjKlMnOpQrStUv");
    if (rpc === "contacts_on_resbite") return reply([]);
    if (rpc === "my_connections")
      return reply({
        requests: [],
        connected: state.connections.map((user_id) => ({
          user_id,
          name: NAMES[user_id],
          avatar_path: null,
          avatar_revision: 0,
          series_id: null,
          title: null,
        })),
      });
    if (rpc === "set_plan_circle") {
      state.plan.bring_invites = body.p_invites;
      state.plan.bring_levels = body.p_levels;
      state.plan.version += 1;
      return reply(state.plan.version);
    }
    if (rpc === "my_bring_allowance") {
      const a = allowance(me);
      state.allowances.push(a);
      return a ? reply(a) : refuse({ code: "42501", message: "Not invited" });
    }
    if (rpc === "invite_contacts") {
      if (isHost(me)) {
        problems.push("invite_contacts from the host: only a guest brings in these scenarios");
        problemsSeen.push(problems.at(-1));
        return refuse({ code: "42501", message: "Fixture: a host's invitation is not modelled" });
      }
      const r = bring(body.p_invites);
      return r.ok ? reply(r.ok) : refuse(r);
    }
    if (rpc === "plan_phone_invitations") {
      // A host: their own links in today's shape. A guest: only the links they brought.
      const mine = state.links.filter((l) => live(l) && (isHost(me) ? l.level === 1 : l.brought_by === me));
      return reply(mine.map(({ phone, country, answered }) => ({ phone, country, answered, response: null })));
    }
    if (rpc === "plan_bringers") {
      if (bringers) return reply(bringers);
      const names = {};
      for (const g of state.guests) if (g.brought_by) names[g.brought_by] = first(NAMES[g.brought_by]);
      return reply(names);
    }
    if (rpc === "plan_brought_invitations") {
      if (!isHost(me)) return refuse({ code: "42501", message: "Active plan owner required" });
      return reply(
        state.links
          .filter((l) => live(l) && l.level > 1 && l.brought_by !== me)
          .map((l) => ({ id: l.id, ending: l.phone.slice(-2), country: l.country, brought_by_name: first(NAMES[l.brought_by]) })),
      );
    }
    if (rpc === "revoke_brought_invitation") {
      const link = state.links.find((l) => l.id === body.p_invitation && live(l) && l.level > 1);
      if (!isHost(me) || !link) return refuse({ code: "42501", message: "Active plan owner required" });
      link.revoked = true;
      return empty();
    }
    if (rpc === "withdraw_brought_invitation") {
      const row = rowOf(body.p_user);
      if (!row || row.brought_by !== me || row.response !== "pending") return refuse({ code: "42501", message: "Not your invitation" });
      state.guests = state.guests.filter((g) => g !== row);
      return empty();
    }
    if (rpc === "revoke_phone_invitation") {
      const link = state.links.find((l) => l.phone === body.p_phone && live(l));
      if (!link || (!isHost(me) && link.brought_by !== me)) return refuse({ code: "42501", message: "Active plan owner required" });
      link.revoked = true;
      return empty();
    }
    // Task 8's chat reads: no Chat row, nothing unread (verify-event and review-ui cover them).
    if (noChat(path) !== undefined) return reply(noChat(path));
    unexpected.push(`${method} ${path}${url.search}`);
    return reply({ message: `Unexpected fixture request ${path}` }, 404);
  });
  return {
    page,
    state,
    calls: (name) => log.filter((x) => x.method === "POST" && x.path === `/rest/v1/rpc/${name}`).map((x) => x.body),
    opened: () => page.evaluate(() => window.__opened.slice()),
    stored: () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "{}"), `resbite.invite-codes.v1.${me}`),
    async done() {
      assert.deepEqual(problems, [], PROBLEMS);
      assert.deepEqual(unexpected, [], "every request was one the fixture expects");
      assert.deepEqual(errors, [], "no page or console errors");
      await context.close();
    },
  };
}

const text = (page, words) => visible(page.getByText(words, { exact: true }));
const radio = (page, group, name) =>
  visible(page.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name, exact: true }));
const tick = (page, name) => visible(page.getByRole("checkbox", { name: `Select ${name}`, exact: true }));
const person = (page, label) => visible(page.getByLabel(label, { exact: true }));
const SENTENCE_1_2 = "Pedro can bring 1 person, and that person can bring 1 more. Only people with a Resbite account.";
const BRING_LINE = "Ana trusts you to bring 1 person. They’re in, no approval needed.";
/** The people list's rows, by their spoken names, top to bottom. */
const rowNames = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[aria-label]")]
      .filter((el) => el.getClientRects().length > 0 && !el.matches("[role=button],[role=header],[role=heading]"))
      .map((el) => el.getAttribute("aria-label")),
  );
/** Opens a row's sheet, then Remove and its question, then Remove again. */
async function removeFromSheet(page, spoken, question) {
  await button(page, `Actions for ${spoken}`).click();
  await button(page, "Remove").click();
  await expect(visible(page.getByText(question, { exact: true }))).toBeVisible();
  await button(page, "Remove").click();
  await expect(visible(page.getByText(question, { exact: true }))).toHaveCount(0);
}

try {
  // (a) Ana, the host, on Invite people: the card shows the saved circle and saves each tap; a refusal shows it again.
  {
    const f = await fixture({
      me: ANA,
      guests: [
        { user_id: PEDRO, response: "accepted" },
        { user_id: MARTA, response: "pending" },
      ],
    }),
      { page } = f;
    await page.goto(`${base}/invitations?plan=${PLAN.id}`);
    await expect(heading(page, "Invite people")).toBeVisible();
    await expect(heading(page, "Circle of trust")).toBeVisible();
    const planReads = f.state.planReads.filter((r) => r.id === PLAN.id).map((r) => r.select);
    assert.ok(planReads.length > 0, "Invite people read the plan");
    assert.ok(
      planReads.every((s) => s.includes("bring_invites,bring_levels")),
      `each read of the plan names the circle's columns: ${planReads.join(" | ")}`,
    );
    await expect(radio(page, "Each person can bring", "1 person each")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "Each person can bring", "1 person each")).toHaveText("1");
    await expect(radio(page, "How far it goes", "2 levels")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "Each person can bring", "Nobody")).toHaveAttribute("aria-checked", "false");
    await expect(text(page, SENTENCE_1_2)).toBeVisible();
    // The card sits above the connections and the event link.
    assert.ok(await inOrder(page, [heading(page, "Circle of trust"), heading(page, "Or share the event link")]), "the card comes first");

    await radio(page, "Each person can bring", "2 people each").click();
    await expect.poll(() => f.calls("set_plan_circle").length).toBe(1);
    await expect(radio(page, "Each person can bring", "2 people each")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "Each person can bring", "1 person each")).toBeEnabled();
    await expect(text(page, "Pedro can bring 2 people, and each of them can bring 2 more. Only people with a Resbite account.")).toBeVisible();
    await radio(page, "Each person can bring", "1 person each").click();
    await expect.poll(() => f.calls("set_plan_circle").length).toBe(2);
    await expect(radio(page, "Each person can bring", "1 person each")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "How far it goes", "3 levels")).toBeEnabled();
    assert.deepEqual(f.calls("set_plan_circle"), [
      { p_plan: PLAN.id, p_invites: 2, p_levels: 2 },
      { p_plan: PLAN.id, p_invites: 1, p_levels: 2 },
    ]);
    await expect(text(page, SENTENCE_1_2)).toBeVisible();

    // The next save is refused (22023 'Invalid circle'): the line says so, and the saved "2 levels" is shown again.
    f.state.refuse.set_plan_circle = [{ code: "22023", message: "Invalid circle" }];
    await radio(page, "How far it goes", "3 levels").click();
    await expect(text(page, "Couldn’t save the circle. Try again.")).toBeVisible();
    await expect(radio(page, "How far it goes", "2 levels")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "How far it goes", "3 levels")).toHaveAttribute("aria-checked", "false");
    await expect(text(page, SENTENCE_1_2)).toBeVisible();
    assert.deepEqual(f.calls("set_plan_circle")[2], { p_plan: PLAN.id, p_invites: 1, p_levels: 3 });
    assert.deepEqual([f.state.plan.bring_invites, f.state.plan.bring_levels], [1, 2], "the server kept (1, 2)");
    await f.done();
  }
  console.log(
    "PASS: (a) the host's Circle of trust card shows the saved 1 and 2 levels (the read names bring_invites,bring_levels); 2 then 1 send set_plan_circle { 2, 2 } and { 1, 2 }; the sentence names Pedro; a refused save says “Couldn’t save the circle. Try again.” and shows 2 levels again.",
  );

  // (b) Pedro, Going, brings a connection: the row, bring mode, the cap, Invite 1, "You brought Marta", and the take-back.
  {
    const f = await fixture({
      me: PEDRO,
      guests: [
        { user_id: PEDRO, response: "accepted" },
        { user_id: LEO, response: "accepted" },
      ],
      connections: [MARTA, SOFIA],
    }),
      { page } = f;
    await page.goto(`${base}/event?plan=${PLAN.id}`);
    await expect(heading(page, "Board game night")).toBeVisible();
    const bringRow = button(page, `Bring someone. ${BRING_LINE}`);
    await expect(bringRow).toBeVisible();
    assert.deepEqual(f.state.allowances[0], { allowed: 1, used: 0, remaining: 1, level: 1, may_bring: true });
    assert.deepEqual(f.calls("my_bring_allowance")[0], { p_plan: PLAN.id });
    await expect(bringRow.getByText("Bring someone", { exact: true })).toBeVisible();
    await expect(bringRow.getByText(BRING_LINE, { exact: true })).toBeVisible();

    await bringRow.click();
    await expect(heading(page, "Bring someone")).toBeVisible();
    await expect(text(page, "Ana trusts you to bring 1 person to Board game night.")).toBeVisible();
    await expect(text(page, "1 left")).toBeVisible();
    // No event link, no circle card, none of the host's help about links.
    await expect(page.getByRole("heading", { name: "Or share the event link", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share link", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Circle of trust", exact: true })).toHaveCount(0);
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "About invitation links", exact: true })).toHaveCount(0);
    await expect(heading(page, "Your connections · 2")).toBeVisible();

    // One invite: once Marta is ticked, Sofía can't be.
    await tick(page, "Marta Ruiz").click();
    await expect(tick(page, "Marta Ruiz")).toHaveAttribute("aria-checked", "true");
    await expect(tick(page, "Sofía Gil")).toBeDisabled();
    await expect(tick(page, "Sofía Gil")).toHaveAttribute("aria-checked", "false");
    await expect(text(page, "None left")).toBeVisible();
    await tick(page, "Sofía Gil").click({ force: true });
    await expect(tick(page, "Sofía Gil")).toHaveAttribute("aria-checked", "false");
    await expect(button(page, "Invite 1")).toBeEnabled();
    await button(page, "Invite 1").click();
    await expect(heading(page, "Almost there")).toBeVisible();
    assert.deepEqual(f.calls("invite_contacts"), [{ p_plan: PLAN.id, p_invites: [{ user: MARTA }] }]);
    assert.deepEqual(
      f.state.guests.find((g) => g.user_id === MARTA),
      { user_id: MARTA, response: "pending", brought_by: PEDRO, level: 2 },
    );

    // Back on the resbite: every invite is used, so the row says whom Pedro brought, with nothing to open.
    await button(page, "Done").click();
    await expect(heading(page, "Board game night")).toBeVisible();
    await expect(text(page, "You brought Marta")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Bring someone/ })).toHaveCount(0);
    assert.deepEqual(f.state.allowances.at(-1), { allowed: 1, used: 1, remaining: 0, level: 1, may_bring: true });

    // Pedro's people list: Marta, invited in the app by Pedro, who takes the invitation back.
    await page.getByRole("button", { name: /^Going 2/ }).click();
    await expect(heading(page, "People")).toBeVisible();
    await expect(heading(page, "Invited, not answered yet · 1")).toBeVisible();
    await expect(person(page, "Marta Ruiz, brought by you, Invited in the app")).toBeVisible();
    await expect(text(page, "Invited in the app · brought by you")).toBeVisible();
    await removeFromSheet(page, "Marta Ruiz", "Remove the invitation for Marta Ruiz?");
    assert.deepEqual(f.calls("withdraw_brought_invitation"), [{ p_plan: PLAN.id, p_user: MARTA }]);
    await expect(page.getByRole("heading", { name: /^Invited, not answered yet/ })).toHaveCount(0);
    await expect(page.getByText("Marta Ruiz", { exact: true })).toHaveCount(0);

    // The invite is free again: back on the resbite, Bring someone is offered again.
    await button(page, "Back").click();
    await expect(heading(page, "Board game night")).toBeVisible();
    await expect(button(page, `Bring someone. ${BRING_LINE}`)).toBeVisible();
    await expect(text(page, "You brought Marta")).toHaveCount(0);
    await f.done();
  }
  console.log(
    "PASS: (b) Pedro, Going, with my_bring_allowance { 1, 0, 1, 1, true }: Bring someone with “Ana trusts you to bring 1 person. They’re in, no approval needed.”; bring mode titled Bring someone, “Ana trusts you to bring 1 person to Board game night.”, no event link and no circle card; Marta ticked, Sofía disabled; Invite 1 sends invite_contacts [{ user: Marta }]; back on the resbite “You brought Marta”; the people list shows Marta “Invited in the app · brought by you”, and Remove sends withdraw_brought_invitation { p_plan, p_user }, so Bring someone is back.",
  );

  // (c) and (e) Pedro brings a phone contact by link, then sends it again and takes it back from the people list.
  {
    const f = await fixture({
      me: PEDRO,
      guests: [
        { user_id: PEDRO, response: "accepted" },
        { user_id: LEO, response: "accepted" },
      ],
    }),
      { page } = f;
    await page.goto(`${base}/event?plan=${PLAN.id}`);
    await button(page, `Bring someone. ${BRING_LINE}`).click();
    await expect(heading(page, "Bring someone")).toBeVisible();
    await expect(text(page, "1 left")).toBeVisible();
    await page.getByLabel("Name (optional)", { exact: true }).fill(JULI.name);
    await page.getByLabel("Phone number", { exact: true }).fill(JULI.typed);
    await button(page, "Add").click();
    const pick = visible(page.getByRole("checkbox", { name: `${JULI.name}, ${JULI.label}`, exact: true }));
    await expect(pick).toHaveAttribute("aria-checked", "true");
    await expect(text(page, "None left")).toBeVisible();
    // At the cap, Add is off and says why.
    await expect(text(page, "You can’t bring more people now.")).toBeVisible();
    await expect(button(page, "Add")).toBeDisabled();
    await button(page, "Invite 1").click();
    await expect(heading(page, "Almost there")).toBeVisible();
    const [sent] = f.calls("invite_contacts");
    assert.equal(sent.p_plan, PLAN.id);
    assert.equal(sent.p_invites.length, 1);
    const [item] = sent.p_invites;
    assert.deepEqual([item.phone, item.country], [JULI.digits, "44"]);
    assert.match(item.code, PERSONAL_CODE);
    assert.ok(!("user" in item), "a number, not a connection");
    assert.deepEqual(
      f.state.links.map(({ phone, brought_by, level }) => ({ phone, brought_by, level })),
      [{ phone: JULI.digits, brought_by: PEDRO, level: 2 }],
    );

    // WhatsApp opens with the bringer's message: the bringer's name, then the organizer's resbite.
    await button(page, `WhatsApp: ${JULI.name}`).click();
    await expect(text(page, "Sent on WhatsApp")).toBeVisible();
    const [whatsapp] = await f.opened();
    assert.equal(whatsapp, `whatsapp://send?phone=${JULI.digits}&text=${encodeURIComponent(MESSAGE(item.code))}`);
    assert.equal(new URL(whatsapp).searchParams.get("text"), MESSAGE(item.code));
    console.log("PASS: (c) a phone contact in bring mode: invite_contacts answers link, and WhatsApp opens with “Pedro invited you to Ana’s Board game night, Thu 5 Mar, 18:00 – 21:00. Reply here: <link>”.");

    await button(page, "Done").click();
    await expect(heading(page, "Board game night")).toBeVisible();
    await expect(text(page, `You brought ${JULI.name}`)).toBeVisible();
    await page.getByRole("button", { name: /^Going 2/ }).click();
    await expect(heading(page, "People")).toBeVisible();
    await expect(heading(page, "Invited, not answered yet · 1")).toBeVisible();
    await expect(text(page, JULI.name)).toBeVisible();
    await expect(text(page, "Invited by WhatsApp · brought by you")).toBeVisible();
    // Send again goes by the app it went by, with the same link and the same message.
    await button(page, `Actions for ${JULI.name}`).click();
    await expect(button(page, "Send again on WhatsApp")).toBeVisible();
    await expect(button(page, "Send again on Messages")).toHaveCount(0);
    await button(page, "Send again on WhatsApp").click();
    await expect.poll(async () => (await f.opened()).length).toBe(2);
    const again = (await f.opened())[1];
    assert.equal(again, whatsapp, "the same link and message");
    assert.equal(new URL(again).searchParams.get("text"), MESSAGE(item.code));
    assert.equal(f.calls("invite_contacts").length, 1, "the stored code is sent again without a new invite");
    // Remove takes the link back by its number.
    await removeFromSheet(page, JULI.name, `Remove the invitation for ${JULI.name}?`);
    assert.deepEqual(f.calls("revoke_phone_invitation"), [{ p_plan: PLAN.id, p_phone: JULI.digits }]);
    await expect(page.getByText(JULI.name, { exact: true })).toHaveCount(0);
    assert.deepEqual((await f.stored())[PLAN.id] ?? {}, {}, "the code is gone from this phone");
    assert.equal(f.calls("revoke_brought_invitation").length + f.calls("withdraw_brought_invitation").length, 0);
    await f.done();
  }
  console.log(
    "PASS: (e) Pedro's people list: the link under Invited, not answered yet, “Invited by WhatsApp · brought by you”; Send again on WhatsApp opens the same message; Remove sends revoke_phone_invitation { p_plan, p_phone }.",
  );

  // (d) Ana's people list: the circle in words, the chain, and Pedro's link by its last two digits.
  {
    const f = await fixture({
      me: ANA,
      // Marta first: the list moves Marta under Pedro.
      guests: [
        { user_id: MARTA, response: "accepted", brought_by: PEDRO, level: 2 },
        { user_id: LEO, response: "accepted" },
        { user_id: PEDRO, response: "accepted" },
      ],
      links: [{ id: LINK_23, phone: "447700900623", country: "44", brought_by: PEDRO, level: 2 }],
    }),
      { page } = f;
    await page.goto(`${base}/guests?plan=${PLAN.id}`);
    await expect(heading(page, "People")).toBeVisible();
    await expect(text(page, "Circle of trust: each person brings 1, two levels.")).toBeVisible();
    await expect(heading(page, "Going · 4")).toBeVisible();
    await expect.poll(() => f.calls("plan_bringers").length).toBeGreaterThan(0);
    assert.deepEqual(f.calls("plan_bringers")[0], { p_plan: PLAN.id });
    const marta = person(page, "Marta Ruiz, brought by Pedro");
    await expect(marta).toBeVisible();
    await expect(marta.getByText("Brought by Pedro", { exact: true })).toBeVisible();
    // Right under Pedro, one step in.
    const names = await rowNames(page);
    const at = names.indexOf("Pedro Pérez");
    assert.ok(at >= 0 && names[at + 1] === "Marta Ruiz, brought by Pedro", `Marta right under Pedro: ${names.join(" | ")}`);
    assert.ok(names.indexOf("Leo Díaz") < at, "Leo keeps the same place");
    const [p, m] = [await person(page, "Pedro Pérez").boundingBox(), await marta.boundingBox()];
    assert.ok(m.x >= p.x + 8, `Marta is indented under Pedro (${p.x}, ${m.x})`);

    await expect(heading(page, "Invited, not answered yet · 1")).toBeVisible();
    const link = person(page, "Number ending 23, brought by Pedro, Invited by link");
    await expect(link).toBeVisible();
    await expect(link.getByText("Number ending ••23", { exact: true })).toBeVisible();
    await expect(link.getByText("Invited by link · brought by Pedro", { exact: true })).toBeVisible();
    assert.ok(!(await page.evaluate(() => document.body.innerText)).replace(/\D/g, "").includes("7700900623"), "no number shows");
    await removeFromSheet(page, "Number ending 23", "Remove the invitation for Number ending ••23?");
    assert.deepEqual(f.calls("revoke_brought_invitation"), [{ p_plan: PLAN.id, p_invitation: LINK_23 }]);
    await expect(page.getByRole("heading", { name: /^Invited, not answered yet/ })).toHaveCount(0);
    await expect(link).toHaveCount(0);
    assert.equal(f.calls("revoke_phone_invitation").length, 0);
    await f.done();
  }
  // With no bringer name to show (Pedro's account being deleted), Marta stays under Pedro with no words (rule 10).
  {
    const f = await fixture({
      me: ANA,
      guests: [
        { user_id: MARTA, response: "accepted", brought_by: PEDRO, level: 2 },
        { user_id: PEDRO, response: "accepted" },
      ],
      bringers: {},
    }),
      { page } = f;
    await page.goto(`${base}/guests?plan=${PLAN.id}`);
    await expect(heading(page, "Going · 3")).toBeVisible();
    await expect.poll(() => f.calls("plan_bringers").length).toBeGreaterThan(0);
    await expect(person(page, "Marta Ruiz")).toBeVisible();
    await expect(page.getByText("Brought by Pedro", { exact: true })).toHaveCount(0);
    const names = await rowNames(page);
    assert.equal(names[names.indexOf("Pedro Pérez") + 1], "Marta Ruiz", `still under Pedro: ${names.join(" | ")}`);
    await f.done();
  }
  console.log(
    "PASS: (d) the host's people list: “Circle of trust: each person brings 1, two levels.”; Marta right under Pedro, indented, “Brought by Pedro” from plan_bringers (none when it names no one); “Number ending ••23” with “Invited by link · brought by Pedro”, whose Remove sends revoke_brought_invitation { p_plan, p_invitation }.",
  );

  console.log("PASS: the circle of trust, end to end. All Supabase requests intercepted.");
} catch (e) {
  // A refused request can make a later step wait and time out: the problem behind it is the failure to show.
  assert.deepEqual(problemsSeen, [], PROBLEMS);
  throw e;
} finally {
  await browser.close();
}
