import { guestNoteError } from "../domain/eventDetails";

export type GuestNote = { guest_note: string; guest_note_at: string | null };
type Reply = { data: unknown; error: { code?: string } | null };

const notYours = "You can’t post a note on this resbite.";
const closed = "This resbite has ended or was cancelled, so its note can’t change.";
const unsaved = "We couldn’t save the note. Check your connection and try again.";

const isGuestNote = (value: unknown): value is GuestNote => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.guest_note === "string" &&
    (row.guest_note_at === null || typeof row.guest_note_at === "string")
  );
};

/**
 * UX3 Note to guests, around the `set_guest_note` call. Saving the same text again is harmless (the database
 * returns the saved note unchanged), so a retry after a lost reply is safe. The database refuses with 42501
 * for anyone but the organizer and 22023 once the event has ended or was cancelled.
 */
export function createGuestNoteWriter(call: (planId: string, text: string) => PromiseLike<Reply>) {
  return async function setGuestNote(planId: string, text: string): Promise<GuestNote> {
    const invalid = guestNoteError(text);
    if (invalid) throw Error(invalid);
    let reply: Reply;
    try {
      reply = await call(planId, text.trim());
    } catch {
      throw Error(unsaved);
    }
    if (reply.error)
      throw Error(
        reply.error.code === "42501" ? notYours : reply.error.code === "22023" ? closed : unsaved,
      );
    if (!isGuestNote(reply.data)) throw Error(unsaved);
    return { guest_note: reply.data.guest_note, guest_note_at: reply.data.guest_note_at };
  };
}
