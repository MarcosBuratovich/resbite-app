import test from "node:test";
import assert from "node:assert/strict";
import { createJoinRequestGateway, decideErrorMessage, joinErrorMessage, RequestDecided } from "./joinRequests";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(reply: (c: Call) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const call = { fn, args };
    calls.push(call);
    return reply(call);
  };
  return { calls, gw: createJoinRequestGateway(rpc) };
}
const offline = "Check your connection and try again.";

test("request sends the code, answer, name and terms version, nulls when omitted", async () => {
  const { calls, gw } = gateway(() => ({ data: { state: "waiting", plan_id: "p1", response: "yes" }, error: null }));
  assert.deepEqual(await gw.request("CODE", "yes"), { state: "waiting", plan_id: "p1", response: "yes" });
  assert.equal(calls[0].fn, "request_to_join");
  assert.deepEqual(calls[0].args, { p_code: "CODE", p_name: null, p_response: "yes", p_terms_version: null });
  await gw.request("CODE", "maybe", "Ana", "2026-10");
  assert.deepEqual(calls[1].args, { p_code: "CODE", p_name: "Ana", p_response: "maybe", p_terms_version: "2026-10" });
});

test("request rejects an unknown state or a malformed reply with the connection copy", async () => {
  for (const data of [
    null,
    [],
    { state: "approved", plan_id: "p", response: "yes" },
    { state: "owner", plan_id: 1, response: "yes" },
    // An owner reply still needs the plan, and a response key (null or words).
    { state: "owner", response: null },
    { state: "owner", plan_id: "p" },
    { state: "owner", plan_id: "p", response: 1 },
    // Anyone else's answer is the stored one, never null.
    { state: "already", plan_id: "p", response: null },
    { state: "waiting", plan_id: "p", response: null },
    { state: "declined", plan_id: "p" },
  ]) {
    const { gw } = gateway(() => ({ data, error: null }));
    await assert.rejects(gw.request("C", "yes"), { message: offline });
  }
  for (const state of ["owner", "already", "waiting", "declined"]) {
    const { gw } = gateway(() => ({ data: { state, plan_id: "p", response: "yes" }, error: null }));
    assert.equal((await gw.request("C", "yes")).state, state);
  }
});

test("request resolves the owner's own link, whose reply has no answer (response null)", async () => {
  const { gw } = gateway(() => ({ data: { state: "owner", plan_id: "p", response: null }, error: null }));
  assert.deepEqual(await gw.request("C", "pending"), { state: "owner", plan_id: "p", response: null });
});

test("mine maps the rows and rejects a non-array", async () => {
  const row = {
    plan_id: "p1", title: "Dinner", starts_at: "2026-11-01T18:00:00Z", ends_at: null, time_zone: "Europe/London",
    host: "Sam", area: "Soho", image: { kind: "cover", ref: null }, response: "yes", status: "waiting",
  };
  const { calls, gw } = gateway(() => ({ data: [row, { ...row, plan_id: "p2", status: "declined", ends_at: "2026-11-01T20:00:00Z", image: { kind: "x", ref: "r" } }], error: null }));
  const rows = await gw.mine();
  assert.equal(calls[0].fn, "my_join_requests");
  assert.deepEqual(calls[0].args, {});
  assert.deepEqual(rows[0], row);
  assert.equal(rows[1].status, "declined");
  assert.equal(rows[1].ends_at, "2026-11-01T20:00:00Z");
  assert.deepEqual(rows[1].image, { kind: "x", ref: "r" });
  await assert.rejects(createJoinRequestGateway(async () => ({ data: {}, error: null })).mine(), { message: offline });
});

test("change calls change_join_answer and returns the stored answer", async () => {
  const { calls, gw } = gateway(() => ({ data: { status: "waiting", response: "maybe" }, error: null }));
  assert.equal(await gw.change("p1", "maybe"), "maybe");
  assert.equal(calls[0].fn, "change_join_answer");
  assert.deepEqual(calls[0].args, { p_plan: "p1", p_response: "maybe" });
  await assert.rejects(createJoinRequestGateway(async () => ({ data: { status: "waiting" }, error: null })).change("p", "yes"), { message: offline });
});

test("change throws RequestDecided once the host has answered, and the guest's words otherwise", async () => {
  const decided = gateway(() => ({ data: null, error: { code: "22023", message: "Request already decided" } }));
  const error = await decided.gw.change("p", "maybe").then(
    () => assert.fail("change resolved"),
    (e: unknown) => e,
  );
  assert.ok(error instanceof RequestDecided);
  // Shown anyway, it is the connection line, never the host's copy.
  assert.equal(error.message, offline);
  const closed = gateway(() => ({ data: null, error: { code: "42501", message: "Invitation unavailable" } }));
  await assert.rejects(closed.gw.change("p", "maybe"), (e: unknown) => {
    assert.ok(!(e instanceof RequestDecided));
    assert.equal((e as Error).message, "This link isn’t open to you right now.");
    return true;
  });
  const unknown = gateway(() => ({ data: null, error: { code: "22023", message: "Invalid response" } }));
  await assert.rejects(unknown.gw.change("p", "nope"), (e: unknown) => {
    assert.ok(!(e instanceof RequestDecided));
    assert.equal((e as Error).message, offline);
    return true;
  });
});

test("forPlan maps the host's rows", async () => {
  const { calls, gw } = gateway(() => ({
    data: [{ user_id: "u1", name: "Ana", response: "yes", ending: null, created_at: "2026-10-29T10:00:00Z" }],
    error: null,
  }));
  assert.deepEqual(await gw.forPlan("p1"), [{ user_id: "u1", name: "Ana", response: "yes", ending: null, created_at: "2026-10-29T10:00:00Z" }]);
  assert.equal(calls[0].fn, "plan_join_requests");
  assert.deepEqual(calls[0].args, { p_plan: "p1" });
  await assert.rejects(createJoinRequestGateway(async () => ({ data: null, error: null })).forPlan("p"), { message: offline });
});

test("decide returns approved or declined and rejects anything else", async () => {
  const yes = gateway(() => ({ data: { status: "approved" }, error: null }));
  assert.equal(await yes.gw.decide("p", "u", true), "approved");
  assert.equal(yes.calls[0].fn, "decide_join_request");
  assert.deepEqual(yes.calls[0].args, { p_plan: "p", p_user: "u", p_approve: true });
  const no = gateway(() => ({ data: { status: "declined" }, error: null }));
  assert.equal(await no.gw.decide("p", "u", false), "declined");
  await assert.rejects(gateway(() => ({ data: { status: "waiting" }, error: null })).gw.decide("p", "u", true), { message: offline });
});

test("the host's refusals map by the server's message, anything else to the connection copy", () => {
  const closed = "This resbite has started or was cancelled, so no one can be added now.";
  const cannotAdd = "This person can’t be added to this resbite.";
  const answered = "Someone already answered this request.";
  assert.equal(decideErrorMessage({ code: "42501", message: "Active plan owner required" }), closed);
  assert.equal(decideErrorMessage({ code: "42501", message: "Invitation unavailable" }), cannotAdd);
  assert.equal(decideErrorMessage({ code: "22023", message: "Request already decided" }), answered);
  // Neither the guest's line nor the server's own words.
  for (const e of [
    { code: "42501", message: "Verified invited tester required" },
    { code: "42501" },
    { code: "22023", message: "Invalid decision" },
    { code: "XX000", message: "boom" },
    new Error("network"),
    null,
  ])
    assert.equal(decideErrorMessage(e), offline);
});

test("decide words its failure as the host's, through both error and throw", async () => {
  for (const [message, copy] of [
    ["Active plan owner required", "This resbite has started or was cancelled, so no one can be added now."],
    ["Invitation unavailable", "This person can’t be added to this resbite."],
    ["Request already decided", "Someone already answered this request."],
    ["Plan owner required", offline],
  ]) {
    const { gw } = gateway(() => ({ data: null, error: { code: message === "Request already decided" ? "22023" : "42501", message } }));
    await assert.rejects(gw.decide("p", "u", true), { message: copy });
  }
  const thrower = createJoinRequestGateway(async () => { throw new Error("abort"); });
  await assert.rejects(thrower.decide("p", "u", false), { message: offline });
});

test("the guest's errors map to the right copy, through both error and throw", async () => {
  assert.equal(joinErrorMessage({ code: "42501", message: "Invitation unavailable" }), "This link isn’t open to you right now.");
  // The 18+ tick still to give is passed on as it is, for joinStep.
  assert.equal(joinErrorMessage({ code: "22023", message: "Age confirmation required" }), "Age confirmation required");
  // A 22023 the app has no words for is the connection line, never the server's words or the host's copy.
  assert.equal(joinErrorMessage({ code: "22023", message: "Pick a name" }), offline);
  assert.equal(joinErrorMessage({ code: "22023", message: "Name required" }), offline);
  assert.equal(joinErrorMessage({ code: "22023", message: "Request already decided" }), offline);
  assert.equal(joinErrorMessage({ code: "P0001", message: "Request already decided" }), offline);
  assert.equal(joinErrorMessage({ code: "22023" }), offline);
  assert.equal(joinErrorMessage({ code: "XX000", message: "boom" }), offline);
  assert.equal(joinErrorMessage(new Error("network")), offline);
  assert.equal(joinErrorMessage(null), offline);
  await assert.rejects(gateway(() => ({ data: null, error: { code: "42501" } })).gw.mine(), { message: "This link isn’t open to you right now." });
  const thrower = createJoinRequestGateway(async () => { throw new Error("abort"); });
  await assert.rejects(thrower.mine(), { message: offline });
});
