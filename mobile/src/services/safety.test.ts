import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blockConfirmed,
  createSafetyGateway,
  entryAfterBlock,
  knownBlocksAfter,
  onBlocksChanged,
  overviewAfterBlock,
  safetyErrorMessage,
  showsBlockedLine,
} from "./safety";

type Call = { fn: string; args: Record<string, unknown> };
function gateway(data: unknown = null, error: unknown = null) {
  const calls: Call[] = [];
  const gw = createSafetyGateway(async (fn, args) => {
    calls.push({ fn, args });
    return { data, error };
  });
  return { calls, gw };
}

const LEO = "0a000000-0000-4000-8000-000000000002";
const ANA = "0a000000-0000-4000-8000-000000000001";
const SERIES = "0b000000-0000-4000-8000-000000000001";

/** Counts "blocks changed" events while `run` runs, and stops listening after it. */
async function heard(run: () => Promise<unknown>): Promise<number> {
  let n = 0;
  const stop = onBlocksChanged(() => n++);
  try {
    await run().catch(() => {});
  } finally {
    stop();
  }
  return n;
}

test("block and unblock send block_user with the person and p_block", async () => {
  const { calls, gw } = gateway();
  // The answer says nothing here (null): the result says so (server review M7).
  assert.deepEqual(await gw.block(LEO), { stored: null });
  assert.deepEqual(await gw.unblock(LEO), { stored: null });
  assert.deepEqual(calls, [
    { fn: "block_user", args: { p_user: LEO, p_block: true } },
    { fn: "block_user", args: { p_user: LEO, p_block: false } },
  ]);
});

test("myBlocks sends my_blocks and reads each person as { userId, name }, newest first as sent", async () => {
  const { calls, gw } = gateway([
    { user_id: LEO, name: "Leo" },
    { user_id: ANA, name: null },
  ]);
  assert.deepEqual(await gw.myBlocks(), [
    { userId: LEO, name: "Leo" },
    { userId: ANA, name: null },
  ]);
  assert.deepEqual(calls, [{ fn: "my_blocks", args: {} }]);
});

// The server (ad0a3e6) adds each block's time, `at`, newest first: kept for Blocked people (Task 6, ruling SR7).
test("myBlocks keeps each block's time, at, and leaves out one that isn't a readable time (SR7)", async () => {
  const at = "2026-11-12T10:00:00.123456+00:00";
  assert.deepEqual(
    await gateway([
      { user_id: LEO, name: "Leo", at },
      { user_id: ANA, name: null, at: 5 },
    ]).gw.myBlocks(),
    [
      { userId: LEO, name: "Leo", at },
      { userId: ANA, name: null },
    ],
  );
});

test("myBlocks reads odd rows defensively: a row without an id goes, a name that isn't text is null", async () => {
  assert.deepEqual(await gateway([]).gw.myBlocks(), []);
  assert.deepEqual(
    await gateway([{ user_id: LEO, name: 5 }, { name: "Ana" }, { user_id: "", name: "Bo" }, null, "x", { user_id: ANA }]).gw.myBlocks(),
    [
      { userId: LEO, name: null },
      { userId: ANA, name: null },
    ],
  );
});

// Ruling SR2: an answer that isn't a list is a failed read, so the blocks stay unknown (N13), never "known, nobody".
test("myBlocks refuses an answer that isn't a list, so the blocks stay unknown", async () => {
  for (const odd of [null, undefined, {}, { user_id: LEO }, "x", 5, true])
    await assert.rejects(gateway(odd).gw.myBlocks(), /Unexpected blocked people/, JSON.stringify(odd));
  // A list with no usable row is still an answer: nobody.
  assert.deepEqual(await gateway([null, "x", 5, {}]).gw.myBlocks(), []);
});

test("reportMessage sends report_message with the id, the reason and the details, null when there are none", async () => {
  const { calls, gw } = gateway();
  await gw.reportMessage(41, "spam");
  await gw.reportMessage(42, "harassment", "Again and again");
  await gw.reportMessage(43, "other", "   ");
  await gw.reportMessage(44, "inappropriate", "");
  assert.deepEqual(calls, [
    { fn: "report_message", args: { p_id: 41, p_reason: "spam", p_details: null } },
    { fn: "report_message", args: { p_id: 42, p_reason: "harassment", p_details: "Again and again" } },
    { fn: "report_message", args: { p_id: 43, p_reason: "other", p_details: null } },
    { fn: "report_message", args: { p_id: 44, p_reason: "inappropriate", p_details: null } },
  ]);
});

test("reportUser sends report_user with the person, the series, the reason and the details", async () => {
  const { calls, gw } = gateway();
  await gw.reportUser(LEO, SERIES, "spam");
  await gw.reportUser(ANA, SERIES, "other", " Keeps inviting me ");
  assert.deepEqual(calls, [
    { fn: "report_user", args: { p_user: LEO, p_series: SERIES, p_reason: "spam", p_details: null } },
    { fn: "report_user", args: { p_user: ANA, p_series: SERIES, p_reason: "other", p_details: "Keeps inviting me" } },
  ]);
});

test("acceptRules sends accept_chat_rules with nothing", async () => {
  const { calls, gw } = gateway();
  assert.equal(await gw.acceptRules(), undefined);
  assert.deepEqual(calls, [{ fn: "accept_chat_rules", args: {} }]);
});

test("a refusal is thrown as the server sent it, from every call", async () => {
  const refusal = { code: "22023", message: "Report unavailable" };
  const { gw } = gateway(null, refusal);
  for (const call of [
    gw.block(LEO),
    gw.unblock(LEO),
    gw.myBlocks(),
    gw.reportMessage(41, "spam"),
    gw.reportUser(LEO, SERIES, "spam"),
    gw.acceptRules(),
  ])
    await assert.rejects(call, (e) => e === refusal);
});

test("the deadline wraps each of the gateway's six calls", async () => {
  const wrapped: string[] = [];
  const gw = createSafetyGateway(
    async () => ({ data: [], error: null }),
    async (request) => {
      wrapped.push("wrapped");
      return request(new AbortController().signal);
    },
  );
  await gw.block(LEO);
  await gw.unblock(LEO);
  await gw.myBlocks();
  await gw.reportMessage(41, "spam");
  await gw.reportUser(LEO, SERIES, "spam");
  await gw.acceptRules();
  assert.equal(wrapped.length, 6);
});

// B3, Decision 17: one app-wide event after every block and unblock that went through.
test("block and unblock each tell 'blocks changed' once when the server answers success", async () => {
  const { gw } = gateway();
  assert.equal(await heard(() => gw.block(LEO)), 1);
  assert.equal(await heard(() => gw.unblock(LEO)), 1);
  // Every listener hears it.
  let a = 0;
  let b = 0;
  const stopA = onBlocksChanged(() => a++);
  const stopB = onBlocksChanged(() => b++);
  await gw.block(LEO);
  stopA();
  stopB();
  assert.deepEqual([a, b], [1, 1]);
});

test("a refused or failed block or unblock tells nothing", async () => {
  const refused = gateway(null, { code: "22023", message: "That is you" }).gw;
  assert.equal(await heard(() => refused.block(LEO)), 0);
  assert.equal(await heard(() => refused.unblock(LEO)), 0);
  const offline = createSafetyGateway(async () => {
    throw new Error("Failed to fetch");
  });
  assert.equal(await heard(() => offline.block(LEO)), 0);
  assert.equal(await heard(() => offline.unblock(LEO)), 0);
  const late = createSafetyGateway(
    async () => ({ data: null, error: null }),
    async () => {
      throw new Error("Timed out");
    },
  );
  assert.equal(await heard(() => late.block(LEO)), 0);
});

test("nothing else tells 'blocks changed': reads, reports and the rules", async () => {
  const { gw } = gateway([]);
  assert.equal(await heard(() => gw.myBlocks()), 0);
  assert.equal(await heard(() => gw.reportMessage(41, "spam")), 0);
  assert.equal(await heard(() => gw.reportUser(LEO, SERIES, "spam")), 0);
  assert.equal(await heard(() => gw.acceptRules()), 0);
});

test("the function onBlocksChanged returns stops that listener, and only that one", async () => {
  const { gw } = gateway();
  let stopped = 0;
  let kept = 0;
  const stop = onBlocksChanged(() => stopped++);
  const keep = onBlocksChanged(() => kept++);
  await gw.block(LEO);
  stop();
  stop();
  await gw.unblock(LEO);
  keep();
  await gw.block(LEO);
  assert.deepEqual([stopped, kept], [1, 2]);
});

test("a listener that throws neither stops the others nor fails the block that went through", async () => {
  const { gw } = gateway();
  let later = 0;
  const stopBad = onBlocksChanged(() => {
    throw new Error("listener");
  });
  const stopGood = onBlocksChanged(() => later++);
  try {
    assert.deepEqual(await gw.block(LEO), { stored: null });
  } finally {
    stopBad();
    stopGood();
  }
  assert.equal(later, 1);
});

test("safetyErrorMessage words its three refusals; anything else is the connection line (G-N6, I7)", () => {
  assert.equal(safetyErrorMessage({ code: "22023", message: "Report unavailable" }), "You can’t report that any more.");
  assert.equal(safetyErrorMessage({ code: "22023", message: "Unblock first" }), "Unblock this person first.");
  assert.equal(safetyErrorMessage({ code: "22023", message: "Report limit" }), "You’ve sent a lot of reports today. Try again later.");
  for (const other of [
    new Error("Failed to fetch"),
    { code: "22023", message: "That is you" },
    { code: "22023", message: "Something new" },
    { code: "42501", message: "Report unavailable" },
    { message: "Report limit" },
    { code: "57014" },
    null,
    undefined,
  ])
    assert.equal(safetyErrorMessage(other), "Check your connection and try again.");
});

// Every block in the app goes through the gateway, so every one is heard (B3): the card's, the page's, Connections'
// and Blocked people's.
test("no file under app or src but services/safety.ts and the tests names block_user", () => {
  const mobile = fileURLToPath(new URL("../../", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) files.push(path);
    }
  };
  walk(join(mobile, "app"));
  walk(join(mobile, "src"));
  assert.ok(files.length > 100, "the walk found the app's files");
  const naming = files
    .filter((f) => !/\.test\.(ts|tsx)$/.test(f))
    .filter((f) => readFileSync(f, "utf8").includes("block_user"))
    .map((f) => relative(mobile, f));
  assert.deepEqual(naming, ["src/services/safety.ts"]);
});

// Ruling SR2 (Q1): report details are cleaned as a message is (H41 m2), so the server never refuses them for ever.
test("report details are well formed, and text with nothing visible is sent as null", async () => {
  const { calls, gw } = gateway();
  // A 500-character field that cut an emoji in half: the lone half reads as U+FFFD, as a send's would.
  await gw.reportMessage(41, "other", `${"x".repeat(499)}\ud83d`);
  // NUL, which Postgres text can't hold, goes; a whole emoji stays.
  await gw.reportUser(LEO, SERIES, "other", "a\u0000b 👍");
  // Nothing visible: zero-width, bidi and joiner characters alone, or a lone half with nothing else.
  await gw.reportMessage(42, "spam", "\u200b");
  await gw.reportMessage(43, "spam", "\u202e\u2066 \u200d");
  await gw.reportUser(LEO, SERIES, "spam", "\u3000\u00a0");
  assert.deepEqual(
    calls.map((c) => c.args.p_details),
    [`${"x".repeat(499)}\ufffd`, "ab 👍", null, null, null],
  );
  // The cut field is 500 characters as the server counts them (code points), within its limit.
  assert.equal([...(calls[0].args.p_details as string)].length, 500);
});

// Fix round 1 (ruling SR6, Q2): the event says whom it was about and which way, so a screen can keep a block the server
// confirmed even when its next read of the blocks fails.
test("'blocks changed' says who was blocked or unblocked", async () => {
  const { gw } = gateway();
  const heardChanges: unknown[] = [];
  const stop = onBlocksChanged((change) => heardChanges.push(change));
  await gw.block(LEO);
  await gw.unblock(ANA);
  stop();
  assert.deepEqual(heardChanges, [
    { userId: LEO, blocked: true, stored: null },
    { userId: ANA, blocked: false, stored: null },
  ]);
});

// Server final review M7: block_user answers `stored`, true only when a block row exists afterwards; a block can succeed
// and store nothing (the person stopped being readable between the screen and the tap).
test("block and unblock read block_user's stored answer, whatever shape it comes in, and the event carries it", async () => {
  for (const [data, stored] of [
    [true, true],
    [false, false],
    [{ stored: true }, true],
    [{ stored: false }, false],
    [[{ stored: true }], true],
    [null, null],
    [{}, null],
    ["yes", null],
  ] as const) {
    const { gw } = gateway(data);
    const changes: unknown[] = [];
    const stop = onBlocksChanged((change) => changes.push(change));
    assert.deepEqual(await gw.block(LEO), { stored }, JSON.stringify(data));
    stop();
    assert.deepEqual(changes, [{ userId: LEO, blocked: true, stored }], JSON.stringify(data));
  }
});

// Ruling SR9: a block the server answered `false` (nothing stored: the person can't be seen, which may be because they
// blocked the caller) closes its confirm with no line at all; "Blocked" only when it didn't say false.
test("showsBlockedLine: Blocked unless the server said nothing was stored", () => {
  assert.equal(showsBlockedLine({ stored: true }), true);
  assert.equal(showsBlockedLine({ stored: null }), true);
  assert.equal(showsBlockedLine({ stored: false }), false);
});

test("blockConfirmed: a block stored, or an unblock leaving no block; anything else is unconfirmed", () => {
  assert.equal(blockConfirmed({ userId: LEO, blocked: true, stored: true }), true);
  assert.equal(blockConfirmed({ userId: LEO, blocked: true, stored: false }), false);
  assert.equal(blockConfirmed({ userId: LEO, blocked: true, stored: null }), false);
  assert.equal(blockConfirmed({ userId: LEO, blocked: false, stored: false }), true);
  assert.equal(blockConfirmed({ userId: LEO, blocked: false, stored: true }), false);
  assert.equal(blockConfirmed({ userId: LEO, blocked: false, stored: null }), false);
});

test("knownBlocksAfter: a confirmed change is applied to what is known; an unconfirmed one changes nothing; unknown stays unknown", () => {
  const known = new Set([ANA]);
  assert.deepEqual([...knownBlocksAfter(known, { userId: LEO, blocked: true, stored: true })!], [ANA, LEO]);
  assert.deepEqual([...knownBlocksAfter(known, { userId: ANA, blocked: false, stored: false })!], []);
  assert.equal(knownBlocksAfter(known, { userId: LEO, blocked: true, stored: false }), known);
  assert.equal(knownBlocksAfter(known, { userId: LEO, blocked: true, stored: null }), known);
  assert.equal(knownBlocksAfter(null, { userId: LEO, blocked: true, stored: true }), null);
  // The set it was given is never changed in place.
  assert.deepEqual([...known], [ANA]);
});

// Ruling SR12: a confirmed block drops the blocked announcer's words from an invitation's line at once, as the Chat row
// drops its line (I1), so a failed re-read of the overview can't keep them.
const PLAN_A = "0c000000-0000-4000-8000-00000000000a";
const PLAN_B = "0c000000-0000-4000-8000-00000000000b";
const stored = { userId: ANA, blocked: true, stored: true };

test("entryAfterBlock: the announcement goes when its author's block is confirmed; nothing else changes", () => {
  const entry = {
    announcement: { id: 41, authorId: ANA, name: "Ana", text: "Announcement from Ana · Doors open at 19:30" },
    inviter: { userId: LEO, name: "Leo" },
  };
  assert.deepEqual(entryAfterBlock(entry, stored), { announcement: null, inviter: { userId: LEO, name: "Leo" } });
  // Not confirmed (stored nothing, or said nothing), an unblock, or someone else: as it was, the same object.
  for (const change of [
    { ...stored, stored: false },
    { ...stored, stored: null },
    { userId: ANA, blocked: false, stored: false },
    { ...stored, userId: LEO },
  ])
    assert.equal(entryAfterBlock(entry, change), entry, JSON.stringify(change));
  const none = { announcement: null, inviter: null };
  assert.equal(entryAfterBlock(none, stored), none);
});

test("overviewAfterBlock: every invitation's announcement by the person blocked goes, the rest stay", () => {
  const overview = {
    chats: {},
    announcements: {
      [PLAN_A]: { id: 41, authorId: ANA, body: "Doors open at 19:30" },
      [PLAN_B]: { id: 42, authorId: LEO, body: "Bring snacks" },
    },
    names: { [ANA]: "Ana", [LEO]: "Leo" },
    inviters: { [PLAN_A]: LEO },
  };
  const after = overviewAfterBlock(overview, stored);
  assert.deepEqual(after?.announcements, { [PLAN_B]: { id: 42, authorId: LEO, body: "Bring snacks" } });
  assert.deepEqual([after?.names, after?.inviters, after?.chats], [overview.names, overview.inviters, overview.chats]);
  // The overview given is never changed in place.
  assert.equal(Object.keys(overview.announcements).length, 2);
  // Unconfirmed or an unblock: the same object; nothing read yet stays nothing.
  assert.equal(overviewAfterBlock(overview, { ...stored, stored: false }), overview);
  assert.equal(overviewAfterBlock(overview, { userId: ANA, blocked: false, stored: false }), overview);
  assert.equal(overviewAfterBlock(null, stored), null);
});
