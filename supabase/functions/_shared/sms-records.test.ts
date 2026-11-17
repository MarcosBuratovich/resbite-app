import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  IN_FLIGHT,
  KEEP_MS,
  handleSweep,
  twilioRecords,
  type SmsRecord,
  type SweepDeps,
} from "./sms-records.ts";
import type { LogEntry } from "./sms-hook.ts";

const NOW = Date.parse("2026-11-18T03:17:00Z");
const SECRET = "s".repeat(32);
const HOUR = 3_600_000;

const sweepRequest = (secret: string | null = SECRET, method = "POST") =>
  new Request("https://x.invalid/send-sms/sweep", {
    method,
    headers: secret === null ? {} : { Authorization: `Bearer ${secret}` },
  });

const RECORDS: SmsRecord[] = [
  { sid: "SM1", status: "delivered", createdAt: NOW - 25 * HOUR },
  { sid: "SM2", status: "sent", createdAt: NOW - 25 * HOUR },
  { sid: "SM3", status: "queued", createdAt: NOW - 48 * HOUR },
  { sid: "SM4", status: "delivered", createdAt: NOW - 1 * HOUR },
  { sid: "SM5", status: "failed", createdAt: NOW - 30 * HOUR },
];

function deps(over: { secret?: string | undefined; list?: SweepDeps["list"]; remove?: SweepDeps["remove"] } = {}) {
  const removed: string[] = [];
  const logged: LogEntry[] = [];
  const order: string[] = [];
  let listCalls = 0;
  const d: SweepDeps = {
    secret: "secret" in over ? over.secret : SECRET,
    nowMs: () => NOW,
    async list() {
      listCalls++;
      order.push("list");
      return over.list ? over.list() : RECORDS;
    },
    async remove(sid) {
      removed.push(sid);
      order.push(`remove ${sid}`);
      return over.remove ? over.remove(sid) : true;
    },
    log(entry) { logged.push(entry); },
  };
  return { d, removed, logged, order, listCalls: () => listCalls };
}

test("the in-flight statuses and the day kept", () => {
  assert.deepEqual([...IN_FLIGHT].sort(), ["accepted", "queued", "receiving", "scheduled", "sending"]);
  assert.equal(KEEP_MS, 86_400_000);
});

test("the sweep needs its 32-character bearer secret", async () => {
  const runs: [Request, ReturnType<typeof deps>][] = [
    [sweepRequest(null), deps()],
    [sweepRequest("t".repeat(32)), deps()],
    [sweepRequest(SECRET.slice(1)), deps()],
    [sweepRequest(SECRET + "s"), deps()],
    [new Request("https://x.invalid/send-sms/sweep", { method: "POST", headers: { Authorization: SECRET } }), deps()],
    [sweepRequest("s".repeat(31)), deps({ secret: "s".repeat(31) })],
    [sweepRequest(""), deps({ secret: "" })],
    [sweepRequest("undefined"), deps({ secret: undefined })],
  ];
  for (const [request, run] of runs) {
    const r = await handleSweep(request, run.d);
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.deepEqual(await r.json(), { error: "unauthorized" });
    assert.equal(run.listCalls(), 0);
    assert.deepEqual(run.removed, []);
    assert.deepEqual(run.logged, [{ route: "sweep", outcome: "unauthorized" }]);
  }
  const get = deps();
  const r = await handleSweep(sweepRequest(SECRET, "GET"), get.d);
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "POST");
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.equal(get.listCalls(), 0);
  assert.deepEqual(get.removed, []);
});

test("deletes settled records over a day old and keeps the rest", async () => {
  const run = deps();
  const r = await handleSweep(sweepRequest(), run.d);
  assert.deepEqual(run.removed, ["SM1", "SM2", "SM5"]);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.deepEqual(await r.json(), { deleted: 3, kept: 2, failed: 0 });
  assert.deepEqual(run.logged, [{ route: "sweep", outcome: "swept", deleted: 3, kept: 2, failed: 0 }]);
  assert.deepEqual(run.order, ["list", "remove SM1", "remove SM2", "remove SM5"]);
});

test("every in-flight status, a record exactly a day old and an unreadable date are kept", async () => {
  const old = NOW - 72 * HOUR;
  const records: SmsRecord[] = [
    ...[...IN_FLIGHT].map((status, i) => ({ sid: `SMf${i}`, status, createdAt: old })),
    { sid: "SMday", status: "delivered", createdAt: NOW - KEEP_MS },
    { sid: "SMnan", status: "delivered", createdAt: Number.NaN },
    { sid: "SMold", status: "undelivered", createdAt: NOW - KEEP_MS - 1 },
    { sid: "SMin", status: "received", createdAt: old },
  ];
  const run = deps({ list: async () => records });
  const r = await handleSweep(sweepRequest(), run.d);
  assert.deepEqual(run.removed, ["SMold", "SMin"]);
  assert.deepEqual(await r.json(), { deleted: 2, kept: IN_FLIGHT.size + 2, failed: 0 });
});

test("a refused delete is counted and the run goes on", async () => {
  const run = deps({ remove: async (sid) => sid !== "SM1" });
  const r = await handleSweep(sweepRequest(), run.d);
  assert.equal(r.status, 200);
  assert.deepEqual(run.removed, ["SM1", "SM2", "SM5"]);
  assert.deepEqual(await r.json(), { deleted: 2, kept: 2, failed: 1 });
  assert.deepEqual(run.logged, [{ route: "sweep", outcome: "swept", deleted: 2, kept: 2, failed: 1 }]);

  const throwing = deps({ remove: async (sid) => { if (sid === "SM2") throw new Error("reset"); return true; } });
  const t = await handleSweep(sweepRequest(), throwing.d);
  assert.equal(t.status, 200);
  assert.deepEqual(throwing.removed, ["SM1", "SM2", "SM5"]);
  assert.deepEqual(await t.json(), { deleted: 2, kept: 2, failed: 1 });
});

test("a failed list: 503 and nothing deleted", async () => {
  const run = deps({ list: async () => { throw new Error("upstream said +447700900834"); } });
  const r = await handleSweep(sweepRequest(), run.d);
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.deepEqual(await r.json(), { error: "unavailable" });
  assert.deepEqual(run.removed, []);
  assert.deepEqual(run.logged, [{ route: "sweep", outcome: "unavailable" }]);
});

// twilioRecords, with a recording fake fetch.
const CONFIG = { accountSid: "ACtest", apiKeySid: "SKtest", apiKeySecret: "secret", messagingServiceSid: "MGtest" };
const BASE = "https://api.twilio.com/2010-04-01/Accounts/ACtest";
const BASIC = `Basic ${btoa("SKtest:secret")}`;
const FIRST_PAGE = `${BASE}/Messages.json?PageSize=100`;
type Call = { url: string; method: string; authorization: string | null };
function fakeFetch(answer: (url: string, method: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, authorization: new Headers(init?.headers).get("Authorization") });
    return answer(url, method);
  }) as typeof fetch;
  return { f, calls };
}
const message = (sid: string, status: string, date: string) => ({
  sid, status, date_created: date, to: "+447700900834", body: "Your Resbite code is 123456. It expires in 10 minutes. Do not share it.",
});

test("twilioRecords pages and deletes with the API key", async () => {
  const pages: Record<string, unknown> = {
    [FIRST_PAGE]: {
      messages: [message("SM1", "delivered", "Tue, 17 Nov 2026 10:00:00 +0000"), message("SM2", "queued", "Wed, 18 Nov 2026 03:00:00 +0000")],
      next_page_uri: "/2010-04-01/Accounts/ACtest/Messages.json?PageSize=100&PageToken=PA1",
    },
    [`${FIRST_PAGE}&PageToken=PA1`]: {
      messages: [message("SM3", "failed", "Mon, 16 Nov 2026 23:59:59 +0000")],
      next_page_uri: null,
    },
  };
  const paged = fakeFetch((url) => (url in pages ? Response.json(pages[url]) : new Response("{}", { status: 404 })));
  assert.deepEqual(await twilioRecords({ ...CONFIG, fetch: paged.f }).list(), [
    { sid: "SM1", status: "delivered", createdAt: Date.parse("Tue, 17 Nov 2026 10:00:00 +0000") },
    { sid: "SM2", status: "queued", createdAt: Date.parse("Wed, 18 Nov 2026 03:00:00 +0000") },
    { sid: "SM3", status: "failed", createdAt: Date.parse("Mon, 16 Nov 2026 23:59:59 +0000") },
  ]);
  assert.equal(Date.parse("Tue, 17 Nov 2026 10:00:00 +0000"), Date.parse("2026-11-17T10:00:00Z"));
  assert.deepEqual(paged.calls, [
    { url: FIRST_PAGE, method: "GET", authorization: BASIC },
    { url: `${FIRST_PAGE}&PageToken=PA1`, method: "GET", authorization: BASIC },
  ]);

  // A next page on every page: it stops after ten.
  let n = 0;
  const endless = fakeFetch(() => {
    n++;
    return Response.json({
      messages: [message(`SM${n}`, "delivered", "Tue, 17 Nov 2026 10:00:00 +0000")],
      next_page_uri: `/2010-04-01/Accounts/ACtest/Messages.json?PageSize=100&PageToken=PA${n}`,
    });
  });
  assert.equal((await twilioRecords({ ...CONFIG, fetch: endless.f }).list()).length, 10);
  assert.equal(endless.calls.length, 10);

  // A non-200 page throws, first or later.
  for (const failAt of [1, 2]) {
    let page = 0;
    const failing = fakeFetch(() => {
      page++;
      if (page === failAt) return new Response('{"code":20003}', { status: page === 1 ? 401 : 500 });
      return Response.json({ messages: [], next_page_uri: "/2010-04-01/Accounts/ACtest/Messages.json?PageSize=100&PageToken=PA1" });
    });
    await assert.rejects(twilioRecords({ ...CONFIG, fetch: failing.f }).list());
  }

  // remove: DELETE with the key; 204 and 404 are gone, anything else is not.
  for (const [status, expected] of [[204, true], [404, true], [409, false], [500, false]] as const) {
    const del = fakeFetch(() => new Response(status === 204 ? null : "{}", { status }));
    assert.equal(await twilioRecords({ ...CONFIG, fetch: del.f }).remove("SM1"), expected, String(status));
    assert.deepEqual(del.calls, [{ url: `${BASE}/Messages/SM1.json`, method: "DELETE", authorization: BASIC }]);
  }
});

test("twilioRecords never follows a next page off Twilio's API and treats a broken page as a failure", async () => {
  for (const next of ["//evil.invalid/2010-04-01/Accounts/ACtest/Messages.json", "https://evil.invalid/x", "@evil.invalid/x"]) {
    const run = fakeFetch(() => Response.json({ messages: [], next_page_uri: next }));
    await assert.rejects(twilioRecords({ ...CONFIG, fetch: run.f }).list(), Error, next);
    assert.ok(run.calls.every((c) => c.url.startsWith("https://api.twilio.com/")), next);
  }
  for (const page of ["not json", "{}", '{"messages":"x"}', '{"messages":[{"status":"sent"}],"next_page_uri":null}']) {
    const run = fakeFetch(() => new Response(page, { status: 200 }));
    await assert.rejects(twilioRecords({ ...CONFIG, fetch: run.f }).list(), Error, page);
  }
  const network = fakeFetch(() => { throw new TypeError("fetch failed"); });
  assert.equal(await twilioRecords({ ...CONFIG, fetch: network.f }).remove("SM1"), false);
  const odd = fakeFetch(() => new Response(null, { status: 204 }));
  assert.equal(await twilioRecords({ ...CONFIG, fetch: odd.f }).remove("SM/../x"), true);
  assert.equal(odd.calls[0].url, `${BASE}/Messages/SM%2F..%2Fx.json`);
});

test("the schedule script names its job, its Vault secrets and nothing secret", () => {
  const sql = readFileSync("supabase/ops/schedule-sms-records-sweep.sql", "utf8");
  for (const expected of ["'sms-records-sweep'", "'17 3 * * *'", "name = 'sms_sweep_url'", "name = 'sms_sweep_secret'", "timeout_milliseconds := 30000"])
    assert.ok(sql.includes(expected), expected);
  assert.doesNotMatch(sql, /whsec_|Bearer [A-Za-z0-9]{20,}|\.supabase\.co\/functions/);
});

test("the entry point serves both routes from its secrets", async () => {
  const hookSecret = `v1,whsec_${Buffer.from("a fictional hook secret").toString("base64")}`;
  const env: Record<string, string> = {
    SEND_SMS_HOOK_SECRETS: hookSecret,
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_API_KEY_SID: "SKtest",
    TWILIO_API_KEY_SECRET: "secret",
    TWILIO_MESSAGING_SERVICE_SID: "MGtest",
    SMS_SWEEP_SECRET: SECRET,
  };
  const g = globalThis as unknown as { Deno?: unknown; fetch: typeof fetch };
  const originalFetch = g.fetch;
  const originalLog = console.log;
  const calls: (Call & { body: string })[] = [];
  const lines: string[] = [];
  let served: ((r: Request) => Promise<Response>) | undefined;
  g.Deno = { env: { get: (name: string) => env[name] }, serve(handler: (r: Request) => Promise<Response>) { served = handler; } };
  g.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url: String(input), method, authorization: new Headers(init?.headers).get("Authorization"), body: String(init?.body ?? "") });
    return method === "GET"
      // The entry point reads the real clock: a record from 2015 is over a day old whenever this runs.
      ? Response.json({ messages: [message("SM1", "delivered", "Thu, 01 Jan 2015 00:00:00 +0000")], next_page_uri: null })
      : method === "DELETE" ? new Response(null, { status: 204 }) : new Response('{"sid":"SMtest"}', { status: 201 });
  }) as typeof fetch;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    await import("../send-sms/index.ts");
    assert.ok(served, "Deno.serve was called");
    const serve = served;

    const body = JSON.stringify({ user: { id: "c1000000-0000-4000-8000-000000000001", phone: "447700900834" }, sms: { otp: "123456" } });
    const unsigned = await serve(new Request("https://x.invalid/send-sms", { method: "POST", body }));
    assert.equal(unsigned.status, 401);

    const ts = Math.floor(Date.now() / 1000);
    const key = Buffer.from(hookSecret.slice("v1,whsec_".length), "base64");
    const signature = createHmac("sha256", key).update(`msg_entry0001.${ts}.${body}`).digest("base64");
    const hook = await serve(new Request("https://x.invalid/send-sms", {
      method: "POST",
      body,
      headers: { "webhook-id": "msg_entry0001", "webhook-timestamp": String(ts), "webhook-signature": `v1,${signature}` },
    }));
    assert.equal(hook.status, 200);
    assert.deepEqual(await hook.json(), {});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/Messages.json`);
    assert.equal(calls[0].authorization, BASIC);
    assert.equal(new URLSearchParams(calls[0].body).get("MessagingServiceSid"), "MGtest");

    const stranger = await serve(new Request("https://x.invalid/send-sms/sweep", { method: "POST" }));
    assert.equal(stranger.status, 401);
    assert.deepEqual(await stranger.json(), { error: "unauthorized" });
    assert.equal(calls.length, 1);

    const sweep = await serve(sweepRequest());
    assert.equal(sweep.status, 200);
    assert.deepEqual(await sweep.json(), { deleted: 1, kept: 0, failed: 0 });
    assert.deepEqual(calls.slice(1).map((c) => [c.method, c.url, c.authorization]), [
      ["GET", FIRST_PAGE, BASIC],
      ["DELETE", `${BASE}/Messages/SM1.json`, BASIC],
    ]);

    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(entries, [
      { fn: "send-sms", route: "hook", outcome: "unsigned" },
      { fn: "send-sms", route: "hook", outcome: "sent" },
      { fn: "send-sms", route: "sweep", outcome: "unauthorized" },
      { fn: "send-sms", route: "sweep", outcome: "swept", deleted: 1, kept: 0, failed: 0 },
    ]);
    for (const secret of ["7700900834", "123456", "Resbite code", SECRET, "SKtest", "Basic"]) assert.ok(!lines.join("\n").includes(secret), secret);
  } finally {
    g.fetch = originalFetch;
    console.log = originalLog;
    delete g.Deno;
  }
});
