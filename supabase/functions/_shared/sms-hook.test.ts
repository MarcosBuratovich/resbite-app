import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  REFUSED_NUMBER_CODES,
  SMS_COPY,
  TWILIO_TIMEOUT_MS,
  handleSendSms,
  hookSecrets,
  smsBody,
  smsTarget,
  twilioSender,
  verifyHookSignature,
  type HookDeps,
  type LogEntry,
  type SendResult,
} from "./sms-hook.ts";

// The Standard Webhooks specification's test vector (recomputed on 17 Nov 2026).
const VECTOR = {
  secret: "v1,whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  ts: 1614265330,
  body: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const EVENT = { user: { id: "c1000000-0000-4000-8000-000000000001", phone: "447700900834" }, sms: { otp: "123456" } };
const TS = 1_794_000_000;
const SECRET = VECTOR.secret;
const OTHER = "v1,whsec_b3RoZXI=";

/** Signs like Auth does, with node:crypto, independent of the code under test. */
function signed(body: string, secret = SECRET, ts = TS, id = "msg_fixture0001"): Headers {
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${signature}` });
}
const post = (body: string, headers: Headers) =>
  new Request("https://x.invalid/send-sms", { method: "POST", headers, body });

function deps(over: { send?: HookDeps["send"]; secrets?: string[] } = {}) {
  const sent: [string, string][] = [];
  const logged: LogEntry[] = [];
  const d: HookDeps = {
    secrets: over.secrets ?? [SECRET],
    nowSeconds: () => TS,
    async send(to, body) {
      sent.push([to, body]);
      return over.send ? over.send(to, body) : { ok: true };
    },
    log(entry) { logged.push(entry); },
  };
  return { d, sent, logged };
}
const failing = (result: SendResult): HookDeps["send"] => async () => result;

test("the signing helper reproduces the specification's vector", () => {
  assert.equal(signed(VECTOR.body, VECTOR.secret, VECTOR.ts, VECTOR.id).get("webhook-signature"), VECTOR.signature);
});

test("the Standard Webhooks vector verifies, and only inside five minutes", async () => {
  const h = new Headers({ "webhook-id": VECTOR.id, "webhook-timestamp": String(VECTOR.ts), "webhook-signature": VECTOR.signature });
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts), true);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts + 300), true);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts + 301), false);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts - 301), false);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, '{"test": 2432232315}', VECTOR.ts), false);
});

test("any listed signature and any listed secret will do (rotation)", async () => {
  const h = new Headers({ "webhook-id": VECTOR.id, "webhook-timestamp": String(VECTOR.ts), "webhook-signature": `v1,bad ${VECTOR.signature}` });
  assert.equal(await verifyHookSignature(["v1,whsec_b3RoZXI=", VECTOR.secret], h, VECTOR.body, VECTOR.ts), true);
  assert.deepEqual(hookSecrets(` ${VECTOR.secret} | v1,whsec_b3RoZXI= ||`), [VECTOR.secret, "v1,whsec_b3RoZXI="]);
  assert.deepEqual(hookSecrets(undefined), []);
});

test("a missing header, no secret or a wrong id never verifies", async () => {
  const full = { "webhook-id": VECTOR.id, "webhook-timestamp": String(VECTOR.ts), "webhook-signature": VECTOR.signature };
  for (const name of Object.keys(full)) {
    const h = new Headers(full);
    h.delete(name);
    assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts), false, name);
  }
  assert.equal(await verifyHookSignature([], new Headers(full), VECTOR.body, VECTOR.ts), false);
  assert.equal(await verifyHookSignature([VECTOR.secret], new Headers({ ...full, "webhook-id": "msg_other" }), VECTOR.body, VECTOR.ts), false);
});

test("the target is the new number when one is being added, as stored digits", () => {
  assert.deepEqual(smsTarget(EVENT), { to: "+447700900834", otp: "123456" });
  assert.deepEqual(smsTarget({ ...EVENT, user: { phone: "+447700900834" } }), { to: "+447700900834", otp: "123456" });
  assert.deepEqual(smsTarget({ user: { phone: "447700900001", new_phone: "+44 7700 900002" }, sms: { otp: "111111" } }), { to: "+447700900002", otp: "111111" });
  assert.deepEqual(smsTarget({ user: { phone: "5491112345678" }, sms: { otp: "123456" } }), { to: "+5491112345678", otp: "123456" });
  for (const bad of [{}, { user: {}, sms: { otp: "123456" } }, { ...EVENT, sms: { otp: "12ab56" } }, { ...EVENT, sms: { otp: "1234567" } }, { user: { phone: "0123" }, sms: { otp: "123456" } }, null, "x"])
    assert.equal(smsTarget(bad), null);
});

test("the text is one GSM-7 segment and says the code, the expiry and not to share it", () => {
  assert.equal(smsBody("123456"), "Your Resbite code is 123456. It expires in 10 minutes. Do not share it.");
  assert.ok(smsBody("123456").length <= 160);
  assert.match(smsBody("123456"), /^[A-Za-z0-9 .]+$/);
});

test("a signed event sends one text and answers 200 {}", async () => {
  const { d, sent } = deps();
  const body = JSON.stringify(EVENT);
  const r = await handleSendSms(post(body, signed(body)), d);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.deepEqual(await r.json(), {});
  assert.deepEqual(sent, [["+447700900834", smsBody("123456")]]);
});

test("unsigned, wrongly signed, stale or altered: 401 and no text", async () => {
  const body = JSON.stringify(EVENT);
  const requests = [
    post(body, new Headers()),
    post(body, signed(body, OTHER)),
    post(body, signed(body, SECRET, TS - 301)),
    post(body.replace("447700900834", "447700900835"), signed(body)),
  ];
  for (const request of requests) {
    const { d, sent } = deps();
    const r = await handleSendSms(request, d);
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.deepEqual(await r.json(), { error: { http_code: 401, message: "Invalid signature" } });
    assert.deepEqual(sent, []);
  }
});

test("only POST", async () => {
  const { d, sent } = deps();
  const r = await handleSendSms(new Request("https://x.invalid/send-sms", { method: "GET", headers: signed("") }), d);
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.deepEqual(sent, []);
});

test("no secret configured: 500 and no text", async () => {
  const { d, sent, logged } = deps({ secrets: [] });
  const body = JSON.stringify(EVENT);
  const r = await handleSendSms(post(body, signed(body)), d);
  assert.equal(r.status, 500);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.deepEqual(sent, []);
  assert.ok(logged.some((e) => e.outcome === "unconfigured"));
});

test("a malformed event: 200 with http_code 400 and no text", async () => {
  for (const body of ['{"sms":{"otp":"12ab56"}}', "not json"]) {
    const { d, sent } = deps();
    const r = await handleSendSms(post(body, signed(body)), d);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.deepEqual(await r.json(), { error: { http_code: 400, message: "Invalid code request." } });
    assert.deepEqual(sent, []);
  }
});

test("a refused number: 200 with http_code 422 and the words", async () => {
  const { d, sent } = deps({ send: failing({ ok: false, kind: "refused", status: 400, code: 21614 }) });
  const body = JSON.stringify(EVENT);
  const r = await handleSendSms(post(body, signed(body)), d);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.deepEqual(await r.json(), { error: { http_code: 422, message: SMS_COPY.cantText } });
  assert.equal(r.headers.get("retry-after"), null);
  assert.equal(sent.length, 1);
  assert.equal(SMS_COPY.cantText, "We can’t text this number. Check it, or use another number.");
});

test("busy, down or slow: 503 with retry-after", async () => {
  for (const status of [429, 503, 0]) {
    const { d } = deps({ send: failing({ ok: false, kind: "transient", status, code: null }) });
    const body = JSON.stringify(EVENT);
    const r = await handleSendSms(post(body, signed(body)), d);
    assert.equal(r.status, 503, String(status));
    assert.equal(r.headers.get("retry-after"), "1");
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.deepEqual(await r.json(), { error: { http_code: 503, message: SMS_COPY.unavailable } });
  }
});

test("a sender that throws counts as busy: 503 with retry-after", async () => {
  const { d, logged } = deps({ send: async () => { throw Error("boom +447700900834"); } });
  const body = JSON.stringify(EVENT);
  const r = await handleSendSms(post(body, signed(body)), d);
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("retry-after"), "1");
  assert.ok(!JSON.stringify(logged).includes("7700900834"));
});

test("anything else: 500", async () => {
  const { d } = deps({ send: failing({ ok: false, kind: "config", status: 401, code: 20003 }) });
  const body = JSON.stringify(EVENT);
  const r = await handleSendSms(post(body, signed(body)), d);
  assert.equal(r.status, 500);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.equal(r.headers.get("retry-after"), null);
  assert.deepEqual(await r.json(), { error: { http_code: 500, message: SMS_COPY.unavailable } });
});

test("logs never hold the number, the code or the text", async () => {
  const logged: LogEntry[] = [];
  const results: SendResult[] = [
    { ok: true },
    { ok: false, kind: "refused", status: 400, code: 21614 },
    { ok: false, kind: "transient", status: 503, code: null },
    { ok: false, kind: "config", status: 401, code: 20003 },
  ];
  for (const result of results) {
    const run = deps({ send: failing(result) });
    const body = JSON.stringify(EVENT);
    await handleSendSms(post(body, signed(body)), run.d);
    logged.push(...run.logged);
  }
  const text = JSON.stringify(logged);
  for (const secret of ["7700900834", "123456", "Resbite code"]) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(logged.find((e) => e.outcome === "refused"), { route: "hook", outcome: "refused", status: 400, code: 21614 });
  assert.equal(logged.length, 4);
  assert.ok(logged.every((e) => e.route === "hook"));
});

test("the refused codes are Twilio's number-level refusals", () => {
  assert.deepEqual([...REFUSED_NUMBER_CODES].sort(), [21211, 21408, 21610, 21612, 21614]);
});

// twilioSender, with a recording fake fetch.
const CONFIG = { accountSid: "ACtest", apiKeySid: "SKtest", apiKeySecret: "secret", messagingServiceSid: "MGtest" };
function fakeFetch(reply: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return reply();
  }) as typeof fetch;
  return { f, calls };
}
const reply = (status: number, body: string) => () =>
  new Response(body, { status, headers: { "Content-Type": "application/json" } });

test("posts the form to the account's Messages endpoint with the API key", async () => {
  const { f, calls } = fakeFetch(reply(201, '{"sid":"SMtest","status":"accepted"}'));
  const result = await twilioSender({ ...CONFIG, fetch: f })("+447700900834", smsBody("123456"));
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
  assert.equal(init.method, "POST");
  const headers = new Headers(init.headers);
  assert.equal(headers.get("Authorization"), `Basic ${btoa("SKtest:secret")}`);
  assert.equal(headers.get("Content-Type"), "application/x-www-form-urlencoded");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(String(init.body))), {
    To: "+447700900834", MessagingServiceSid: "MGtest", Body: smsBody("123456"), ValidityPeriod: "600",
  });
});

test("maps Twilio's answers", async () => {
  const cases: [() => Response | Promise<Response>, SendResult][] = [
    [reply(400, '{"code":21614,"message":"x"}'), { ok: false, kind: "refused", status: 400, code: 21614 }],
    [reply(400, '{"code":21211}'), { ok: false, kind: "refused", status: 400, code: 21211 }],
    [reply(400, '{"code":21606}'), { ok: false, kind: "config", status: 400, code: 21606 }],
    [reply(403, '{"code":21610}'), { ok: false, kind: "config", status: 403, code: 21610 }],
    [reply(500, '{"code":21614}'), { ok: false, kind: "transient", status: 500, code: 21614 }],
    [reply(401, '{"code":20003}'), { ok: false, kind: "config", status: 401, code: 20003 }],
    [reply(429, '{"code":20429}'), { ok: false, kind: "transient", status: 429, code: 20429 }],
    [reply(503, "{}"), { ok: false, kind: "transient", status: 503, code: null }],
    [reply(500, "<html>down</html>"), { ok: false, kind: "transient", status: 500, code: null }],
    [() => { throw new TypeError("fetch failed"); }, { ok: false, kind: "transient", status: 0, code: null }],
  ];
  for (const [answer, expected] of cases) {
    const { f } = fakeFetch(answer);
    assert.deepEqual(await twilioSender({ ...CONFIG, fetch: f })("+447700900834", smsBody("123456")), expected);
  }
});

test("gives up after four seconds", async () => {
  assert.equal(TWILIO_TIMEOUT_MS, 4000);
  const timeouts: number[] = [];
  const original = AbortSignal.timeout;
  AbortSignal.timeout = (ms: number) => { timeouts.push(ms); return original.call(AbortSignal, ms); };
  try {
    let signal: unknown;
    const { f } = fakeFetch(() => new Response('{"sid":"SMtest"}', { status: 201 }));
    const capture = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      signal = init?.signal;
      assert.ok(signal instanceof AbortSignal);
      assert.equal((signal as AbortSignal).aborted, false);
      return f(input, init);
    }) as typeof fetch;
    assert.deepEqual(await twilioSender({ ...CONFIG, fetch: capture })("+447700900834", smsBody("123456")), { ok: true });
    assert.ok(signal instanceof AbortSignal);
    assert.deepEqual(timeouts, [4000]);
  } finally {
    AbortSignal.timeout = original;
  }
});

test("an accepted message counts as sent even if its reply body breaks (no retry, no second text)", async () => {
  const broken = () => new Response(new ReadableStream({ start(c) { c.error(new Error("reset")); } }), { status: 201 });
  const { f } = fakeFetch(broken);
  assert.deepEqual(await twilioSender({ ...CONFIG, fetch: f })("+447700900834", smsBody("123456")), { ok: true });
});

test("a timed-out request is busy, not refused", async () => {
  const { f } = fakeFetch(() => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
  assert.deepEqual(await twilioSender({ ...CONFIG, fetch: f })("+447700900834", smsBody("123456")), { ok: false, kind: "transient", status: 0, code: null });
});
