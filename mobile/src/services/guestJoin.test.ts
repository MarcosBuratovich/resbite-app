import test from "node:test";
import assert from "node:assert/strict";
import { createGuestJoin, type GuestJoinDeps } from "./guestJoin";

const code = "abcdEFGH_-0123456789ab";
const KEY = "sb_publishable_key";

function harness(opts: { respond?: () => Promise<Response> } = {}) {
  const fetched: { url: string; init: RequestInit }[] = [];
  const d: GuestJoinDeps = {
    fetch: (async (url: string, init: RequestInit) => {
      fetched.push({ url, init });
      return (opts.respond ?? (async () => new Response("null")))();
    }) as unknown as typeof fetch,
    supabaseUrl: "https://x.supabase.co",
    publishableKey: KEY,
  };
  return { g: createGuestJoin(d), fetched };
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
  assert.equal(h.fetched[0].init.body, JSON.stringify({ p_code: code }));
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

test("a happened state and a null body", async () => {
  assert.deepEqual(
    await harness({ respond: async () => new Response(JSON.stringify({ state: "happened", title: "T" })) }).g.readInvitationPreview(code),
    { state: "happened", title: "T" },
  );
  assert.deepEqual(await harness({ respond: async () => new Response("null") }).g.readInvitationPreview(code), { state: "inactive" });
});

test("a failed preview request throws, so the page can offer a retry", async () => {
  const h = harness({ respond: async () => new Response("no", { status: 500 }) });
  await assert.rejects(h.g.readInvitationPreview(code));
});

test("noteLinkOpen swallows a 500 and a network failure", async () => {
  const h = harness({ respond: async () => new Response("no", { status: 500 }) });
  await h.g.noteLinkOpen(code);
  assert.equal(h.fetched[0].url, "https://x.supabase.co/rest/v1/rpc/note_link_open");
  assert.equal(h.fetched[0].init.body, JSON.stringify({ p_code: code }));
  const down = harness({
    respond: async () => {
      throw new TypeError("offline");
    },
  });
  await down.g.noteLinkOpen(code);
  assert.equal(down.fetched.length, 1);
});

test("an open card keeps its end, area and image, and never the place", async () => {
  const h = harness({
    respond: async () =>
      new Response(
        JSON.stringify({
          state: "open",
          host: "Ana",
          title: "Picnic",
          starts_at: "2026-11-01T10:00:00Z",
          ends_at: "2026-11-01T12:00:00Z",
          time_zone: "Europe/London",
          area: "Hackney",
          going: 3,
          image: { kind: "activity", ref: "bbq" },
          place_label: "leak",
        }),
      ),
  });
  assert.deepEqual(await h.g.readInvitationPreview(code), {
    state: "open",
    host: "Ana",
    title: "Picnic",
    starts_at: "2026-11-01T10:00:00Z",
    ends_at: "2026-11-01T12:00:00Z",
    time_zone: "Europe/London",
    area: "Hackney",
    image: { kind: "activity", ref: "bbq" },
  });
  const odd = harness({
    respond: async () => new Response(JSON.stringify({ state: "open", ends_at: null, image: { kind: "mark", ref: 4 } })),
  });
  assert.deepEqual(await odd.g.readInvitationPreview(code), { state: "open", image: { kind: "mark", ref: null } });
  const none = harness({ respond: async () => new Response(JSON.stringify({ state: "open", image: "cover" })) });
  assert.deepEqual(await none.g.readInvitationPreview(code), { state: "open" });
});
