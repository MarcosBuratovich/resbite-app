import test from "node:test";
import assert from "node:assert/strict";
import { createGuestJoin, JoinRefusal, type GuestJoinDeps } from "./guestJoin";

const code = "abcdEFGH_-0123456789ab";
const KEY = "sb_publishable_key";

function harness(opts: { respond?: () => Promise<Response>; rpcReply?: Awaited<ReturnType<GuestJoinDeps["rpc"]>> } = {}) {
  const fetched: { url: string; init: RequestInit }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const d: GuestJoinDeps = {
    fetch: (async (url: string, init: RequestInit) => {
      fetched.push({ url, init });
      return (opts.respond ?? (async () => new Response("null")))();
    }) as unknown as typeof fetch,
    supabaseUrl: "https://x.supabase.co",
    publishableKey: KEY,
    rpc: async (fn, args) => {
      rpcs.push({ fn, args });
      return opts.rpcReply ?? { data: "plan-1", error: null };
    },
  };
  return { g: createGuestJoin(d), fetched, rpcs };
}

test("a malformed code is inactive without a request", async () => {
  const h = harness();
  for (const bad of ["", "short", "a".repeat(23), "abcdEFGH_-0123456789a!"])
    assert.deepEqual(await h.g.readInvitationPreview(bad), { state: "inactive" });
  await h.g.noteLinkOpen("short");
  assert.deepEqual(h.fetched, []);
});

test("the preview call carries the publishable key and no bearer of a session", async () => {
  const h = harness({
    respond: async () =>
      new Response(
        JSON.stringify({ state: "open", host: "Ana", title: "Picnic", starts_at: "2026-11-01T10:00:00Z", time_zone: "UTC", id: "leak", code }),
      ),
  });
  const preview = await h.g.readInvitationPreview(code);
  assert.deepEqual(preview, { state: "open", host: "Ana", title: "Picnic", starts_at: "2026-11-01T10:00:00Z", time_zone: "UTC" });
  assert.equal(h.fetched.length, 1);
  assert.equal(h.fetched[0].url, "https://x.supabase.co/rest/v1/rpc/invitation_page");
  assert.equal(h.fetched[0].init.method, "POST");
  assert.deepEqual(h.fetched[0].init.headers, {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  });
  assert.equal(h.fetched[0].init.body, JSON.stringify({ code }));
});

test("a closed state keeps only its state, and an unknown state is inactive", async () => {
  assert.deepEqual(
    await harness({ respond: async () => new Response(JSON.stringify({ state: "cancelled", title: "T" })) }).g.readInvitationPreview(code),
    { state: "cancelled", title: "T" },
  );
  assert.deepEqual(
    await harness({ respond: async () => new Response(JSON.stringify({ state: "weird" })) }).g.readInvitationPreview(code),
    { state: "inactive" },
  );
});

test("a failed preview request throws, so the page can offer a retry", async () => {
  const h = harness({ respond: async () => new Response("no", { status: 500 }) });
  await assert.rejects(h.g.readInvitationPreview(code));
});

test("noteLinkOpen swallows a 500 and a network failure", async () => {
  const h = harness({ respond: async () => new Response("no", { status: 500 }) });
  await h.g.noteLinkOpen(code);
  assert.equal(h.fetched[0].url, "https://x.supabase.co/rest/v1/rpc/note_link_open");
  const down = harness({
    respond: async () => {
      throw new TypeError("offline");
    },
  });
  await down.g.noteLinkOpen(code);
  assert.equal(down.fetched.length, 1);
});

test("join maps the four refusals to kinds", async () => {
  const cases = [
    ["Invitation unavailable", "unavailable"],
    ["Name required", "name"],
    ["Age confirmation required", "age"],
    ["Sign-in required", "signin"],
  ] as const;
  for (const [message, kind] of cases) {
    const h = harness({ rpcReply: { data: null, error: { message: `P0001: ${message}` } } });
    await assert.rejects(h.g.joinByLink(code, "Ana", "2026-10"), (e: unknown) => e instanceof JoinRefusal && e.kind === kind);
  }
});

test("any other join error is rethrown as it is", async () => {
  const error = { message: "boom" };
  const h = harness({ rpcReply: { data: null, error } });
  await assert.rejects(h.g.joinByLink(code, "Ana", "2026-10"), (e: unknown) => e === error);
});

test("join returns the plan id and sends an empty name for none", async () => {
  const h = harness();
  assert.equal(await h.g.joinByLink(code, null, "2026-10"), "plan-1");
  assert.deepEqual(h.rpcs, [{ fn: "join_by_link", args: { p_code: code, p_name: "", p_terms_version: "2026-10" } }]);
});
