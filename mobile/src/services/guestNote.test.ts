import test from "node:test";
import assert from "node:assert/strict";
import { createGuestNoteWriter } from "./guestNote.ts";

const saved = { guest_note: "Running 10 minutes late", guest_note_at: "2099-01-01T14:50:00Z" };

test("the note is sent trimmed and the saved note comes back with its time", async () => {
  const sent: [string, string][] = [];
  const setGuestNote = createGuestNoteWriter(async (planId, text) => {
    sent.push([planId, text]);
    return { data: saved, error: null };
  });
  assert.deepEqual(await setGuestNote("plan-1", "  Running 10 minutes late \n"), saved);
  assert.deepEqual(sent, [["plan-1", "Running 10 minutes late"]]);
});

test("removing the note sends an empty text and returns no time", async () => {
  const setGuestNote = createGuestNoteWriter(async () => ({
    data: { guest_note: "", guest_note_at: null },
    error: null,
  }));
  assert.deepEqual(await setGuestNote("plan-1", "   "), { guest_note: "", guest_note_at: null });
});

test("a note over 280 characters is refused before anything is sent", async () => {
  let calls = 0;
  const setGuestNote = createGuestNoteWriter(async () => {
    calls++;
    return { data: saved, error: null };
  });
  await assert.rejects(setGuestNote("plan-1", "x".repeat(281)), /Keep the note to 280 characters\./);
  assert.equal(calls, 0);
  await setGuestNote("plan-1", ` ${"x".repeat(280)} `);
  assert.equal(calls, 1);
});

test("refusals and failures read as friendly errors", async () => {
  const cases: [Parameters<typeof createGuestNoteWriter>[0], RegExp][] = [
    [async () => ({ data: null, error: { code: "42501" } }), /You can’t post a note on this resbite\.$/],
    [
      async () => ({ data: null, error: { code: "22023" } }),
      /This resbite has ended or was cancelled, so its note can’t change\.$/,
    ],
    [async () => ({ data: null, error: { code: "PGRST301" } }), /Check your connection and try again\.$/],
    [async () => ({ data: null, error: {} }), /We couldn’t save the note\. Check your connection and try again\.$/],
    [
      async () => {
        throw new Error("Network request failed");
      },
      /We couldn’t save the note\. Check your connection and try again\.$/,
    ],
    // An unexpected reply is never shown as saved.
    [async () => ({ data: { guest_note: 7 }, error: null }), /Check your connection/],
    [async () => ({ data: null, error: null }), /Check your connection/],
  ];
  for (const [reply, message] of cases)
    await assert.rejects(createGuestNoteWriter(reply)("plan-1", "Hello"), message);
});
