import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as appLinks from "../domain/appLinks.ts";
import * as eventLinks from "../domain/eventLinks.ts";
import * as eventPage from "../domain/eventPage.ts";
import * as plansDomain from "../domain/plans.ts";

// readEvent calls the app's client directly (`supabase.from(…)` chains and `rpc`), so rsvp.ts is loaded here with a
// stand-in client, as reminders.test.ts and profilePhotoStore.test.ts load theirs.

const SERIES = "0b000000-0000-4000-8000-000000000001";
const PLAN = "0c000000-0000-4000-8000-000000000001";
const OWNER = "0a000000-0000-4000-8000-000000000001";
const ME = "0a000000-0000-4000-8000-000000000003";
const SOL = "0a000000-0000-4000-8000-000000000004";
const UNAVAILABLE = /This invitation is unavailable, or its details could not be refreshed/;

type Answer = { data: unknown; error: unknown };
type Call =
  | { from: string; select: string; eq: Record<string, unknown>; single: boolean }
  | { rpc: string; args: Record<string, unknown> };

const planRow = {
  id: PLAN,
  series_id: SERIES,
  owner_id: OWNER,
  title: "Board game night",
  status: "active",
  starts_at: "2099-11-19T19:00:00Z",
  ends_at: "2099-11-19T22:00:00Z",
  time_zone: "Europe/London",
  repeat_weeks: 1,
  repeats_from: null,
  plan_meeting_details: [],
  plan_admins: [],
};
const guestRows = [
  { user_id: ME, response: "pending", brought_by: null, level: 1, profiles: { display_name: "Mia" } },
  { user_id: SOL, response: "pending", brought_by: null, level: 1, profiles: { display_name: "Sol" } },
];

/**
 * The server as these tests need it: each read answers `answers[key]` (a value, or a function of the call), where the
 * key is the table (`plans`, `attendees`, `attendees:own` for the viewer's own row, `profiles`) or the RPC's name.
 * A thrown value or a rejected promise stands for a lost connection.
 */
function load(answers: Record<string, Answer | (() => Answer | Promise<Answer>)>) {
  const calls: Call[] = [];
  const answer = (key: string): Promise<Answer> => {
    const a = answers[key];
    if (a === undefined) return Promise.reject(Error(`Unexpected read: ${key}`));
    return Promise.resolve().then(() => (typeof a === "function" ? a() : a));
  };
  const supabase = {
    from(table: string) {
      const call = { from: table, select: "", eq: {} as Record<string, unknown>, single: false };
      const query = {
        select: (cols: string) => ((call.select = cols), query),
        eq: (col: string, value: unknown) => ((call.eq[col] = value), query),
        abortSignal: () => query,
        single: () => ((call.single = true), query),
        then: (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) => {
          calls.push(call);
          const key = table === "attendees" && "user_id" in call.eq ? "attendees:own" : table;
          return answer(key).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      return {
        abortSignal: () => {
          calls.push({ rpc: fn, args });
          return answer(fn);
        },
      };
    },
  };
  const source = readFileSync(new URL("./rsvp.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === "./supabase") return { supabase };
      if (name === "./plans")
        return {
          planWithDetails: "*,plan_meeting_details(note),plan_admins(user_id)",
          withDeadline: (request: (signal: AbortSignal) => unknown) => request(new AbortController().signal),
        };
      if (name === "../domain/plans") return plansDomain;
      if (name === "../domain/appLinks") return appLinks;
      if (name === "../domain/eventLinks") return eventLinks;
      if (name === "../domain/eventPage") return eventPage;
      throw Error(`Unexpected import: ${name}`);
    },
  });
  return { readEvent: exports.readEvent as (plan: string, user: string) => Promise<Record<string, unknown>>, calls };
}

const ok = (data: unknown): Answer => ({ data, error: null });
/** A guest's page: the plan, every guest row, their own row, the organizer's name, the counts and the group flag. */
const guestPage = (over: Record<string, Answer | (() => Answer | Promise<Answer>)> = {}) => ({
  plans: ok(planRow),
  attendees: ok(guestRows),
  "attendees:own": ok({ version: 3, response: "accepted" }),
  profiles: ok({ display_name: "Ana" }),
  plan_people_counts: ok({ going: 1, maybe: 0, cant_go: 0 }),
  series_is_group: ok(true),
  ...over,
});
/** An RPC's calls, their arguments as plain data (they were made in rsvp.ts's own context). */
const rpcCalls = (calls: Call[], fn: string) =>
  calls
    .filter((c): c is Extract<Call, { rpc: string }> => "rpc" in c && c.rpc === fn)
    .map((c) => ({ rpc: c.rpc, args: JSON.parse(JSON.stringify(c.args)) as Record<string, unknown> }));
/** The snapshot as read, but for the group flag. */
const plainSnapshot = (snapshot: Record<string, unknown>) => {
  const { isGroup: _flag, ...rest } = snapshot;
  return JSON.parse(JSON.stringify(rest));
};

test("readEvent reads the group flag with series_is_group for the plan's series, after the plan row (G-N13, I4)", async () => {
  const { readEvent, calls } = load(guestPage());
  const snapshot = await readEvent(PLAN, ME);
  assert.equal(snapshot.isGroup, true);
  assert.deepEqual(rpcCalls(calls, "series_is_group").map((c) => c.args), [{ p_series: SERIES }]);
  // Beside the viewer's own row and the organizer's name, once the plan row is in.
  const order = calls.map((c) => ("rpc" in c ? c.rpc : "user_id" in c.eq ? "own" : c.from));
  assert.deepEqual(order.slice(0, 2).sort(), ["attendees", "plans"]);
  assert.deepEqual(order.slice(2, 5).sort(), ["own", "profiles", "series_is_group"]);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.attendee)), { version: 3, response: "accepted" });
  assert.equal(snapshot.organizer, "Ana");
});

test("readEvent reads the group flag alone for the owner", async () => {
  const { readEvent, calls } = load(guestPage());
  const snapshot = await readEvent(PLAN, OWNER);
  assert.equal(snapshot.isGroup, true);
  const order = calls.map((c) => ("rpc" in c ? c.rpc : c.from));
  assert.deepEqual([...order.slice(0, 2).sort(), ...order.slice(2)], ["attendees", "plans", "series_is_group"]);
  assert.deepEqual([snapshot.attendee, snapshot.organizer, snapshot.counts], [null, null, null]);
});

test("a series_is_group that is missing (PGRST202, after plan 2's rollback) or fails any way reads as a one-off, and the page is kept (I4)", async () => {
  const asRead = plainSnapshot(await load(guestPage()).readEvent(PLAN, ME));
  const failures: Array<[string, Answer | (() => Promise<Answer>)]> = [
    ["missing", { data: null, error: { code: "PGRST202", message: "Could not find the function public.series_is_group(p_series)" } }],
    ["offline", { data: null, error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" } }],
    ["thrown", () => Promise.reject(new TypeError("Network request failed"))],
    ["refused", { data: null, error: { code: "42501", message: "permission denied for function series_is_group" } }],
    ["odd", ok("true")],
    ["null", ok(null)],
  ];
  for (const [name, failure] of failures) {
    for (const viewer of [ME, OWNER]) {
      const { readEvent } = load(guestPage({ series_is_group: failure }));
      const snapshot = await readEvent(PLAN, viewer);
      assert.equal(snapshot.isGroup, false, `${name} as ${viewer}`);
      if (viewer === ME) assert.deepEqual(plainSnapshot(snapshot), asRead, name);
    }
  }
});

test("every other part's failure still makes the page unavailable", async () => {
  const failed = { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
  for (const key of ["plans", "attendees", "attendees:own", "profiles"]) {
    const { readEvent } = load(guestPage({ [key]: failed }));
    await assert.rejects(readEvent(PLAN, ME), UNAVAILABLE, key);
  }
  // A lost connection on the attendee read, even with the group flag read fine.
  const { readEvent } = load(guestPage({ "attendees:own": () => Promise.reject(new TypeError("Network request failed")) }));
  await assert.rejects(readEvent(PLAN, ME), /Network request failed/);
  // The counts, where they are read, are still the page's.
  const counts = load(guestPage({ "attendees:own": ok({ version: 3, response: "pending" }), series_is_group: ok(false), plan_people_counts: failed }));
  await assert.rejects(counts.readEvent(PLAN, ME), UNAVAILABLE);
});

test("a member who hasn't answered: on a group no counts are read, since they read every guest row; on a one-off they are (challenge NOTE 12)", async () => {
  const pending = { "attendees:own": ok({ version: 3, response: "pending" }) };
  const onGroup = load(guestPage(pending));
  const group = await onGroup.readEvent(PLAN, ME);
  assert.deepEqual([group.isGroup, group.counts], [true, null]);
  assert.equal(rpcCalls(onGroup.calls, "plan_people_counts").length, 0);
  assert.equal((group.guests as unknown[]).length, 2);
  const onOneOff = load(guestPage({ ...pending, series_is_group: ok(false) }));
  const oneOff = await onOneOff.readEvent(PLAN, ME);
  assert.deepEqual([oneOff.isGroup, JSON.parse(JSON.stringify(oneOff.counts))], [false, { going: 1, maybe: 0, cantGo: 0 }]);
  assert.deepEqual(rpcCalls(onOneOff.calls, "plan_people_counts").map((c) => c.args), [{ p_plan: PLAN }]);
  // A flag that failed to read follows the one-off rule: the counts are read.
  const unknown = load(guestPage({ ...pending, series_is_group: { data: null, error: { code: "PGRST202" } } }));
  assert.deepEqual(JSON.parse(JSON.stringify((await unknown.readEvent(PLAN, ME)).counts)), { going: 1, maybe: 0, cantGo: 0 });
});
