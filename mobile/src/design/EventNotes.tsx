import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Lock, MapPin, Megaphone, Pencil, Trash2 } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction } from "./ui";
import { FieldCard, IconButton, InfoSheet } from "./kit";
import { categoryPalette, colors as c, fonts, r, space } from "./tokens";
import { guestNoteError, guestNoteTime, MEETING_DETAILS_LOCKED, type MeetingDetailsView } from "../domain/eventDetails";

// UX3 event page notes (spec "Event details", UX3-D5; mockup "Event details"): the pinned Note to guests,
// its sheet, and Meeting details (shown, or a locked line).

const NOTE = categoryPalette.uplifting;
const ROSE = "#963F58";

/**
 * The pinned Note to guests: yellow, with the time it was posted. The organizer's ✎ reopens the sheet; the
 * note itself reads as one element ("Note to guests, 9:41, …").
 */
export function GuestNoteCard({
  text,
  postedAt,
  onEdit,
}: {
  text: string;
  postedAt: string | null | undefined;
  /** The organizer, while the note can still change. */
  onEdit?: () => void;
}) {
  const time = guestNoteTime(postedAt, new Date());
  const caption = time ? `Note to guests · ${time}` : "Note to guests";
  return (
    <View style={styles.note}>
      <View
        accessible
        accessibilityLabel={`${time ? `Note to guests, ${time}` : "Note to guests"}: ${text}`}
        style={styles.noteBody}
      >
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <Megaphone size={22} strokeWidth={2} color={NOTE.ink} />
        </View>
        <View style={styles.noteText}>
          <Copy style={[styles.caption, { color: NOTE.ink }]}>{caption}</Copy>
          <Copy>{text}</Copy>
        </View>
      </View>
      {onEdit && <IconButton icon={Pencil} label="Edit note to guests" tone="plain" onPress={onEdit} />}
    </View>
  );
}

/**
 * Posts, changes or removes the Note to guests (up to 280 characters). `onSave` throws with the message to
 * show; an empty note removes it. The sheet closes once the save is confirmed.
 */
export function GuestNoteSheet({
  visible,
  current,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** The posted note, or "" when there is none. */
  current: string;
  onSave: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each opening starts from the posted note.
  useEffect(() => {
    if (!visible) return;
    setText(current);
    setError(null);
  }, [visible, current]);
  const editing = current.trim() !== "";
  async function save(next: string) {
    const invalid = guestNoteError(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t save the note. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <InfoSheet visible={visible} title="Note to guests" onClose={() => (busy ? undefined : onClose())}>
      <FieldCard
        label="Note to guests"
        icon={Megaphone}
        placeholder="Running late, bring a blanket… (optional)"
        value={text}
        onChangeText={setText}
        multiline
        minHeight={110}
        editable={!busy}
      />
      <ErrorNote message={error} />
      <Button
        title={editing ? "Save" : "Post"}
        icon={false}
        loading={busy}
        disabled={busy || (!editing && text.trim() === "")}
        onPress={() => void save(text)}
      />
      {editing && (
        <TextAction icon={Trash2} destructive title="Remove note" disabled={busy} onPress={() => void save("")} />
      )}
    </InfoSheet>
  );
}

/**
 * Meeting details (UX3-D6): the organizer and Going or Maybe guests see the card; anyone else sees a locked
 * line when there are some, and nothing otherwise.
 */
export function MeetingDetails({ view, owner, place }: { view: MeetingDetailsView; owner: boolean; place: string }) {
  if (view.kind === "none") return null;
  if (view.kind === "locked")
    return (
      <View style={styles.locked}>
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <Lock size={20} strokeWidth={2} color={c.muted} />
        </View>
        <Copy style={styles.lockedText}>{MEETING_DETAILS_LOCKED}</Copy>
      </View>
    );
  const caption = owner ? "Meeting details · only Going & Maybe see this" : `Meeting details · ${place.trim()}`;
  return (
    <View style={styles.meeting}>
      <View aria-hidden importantForAccessibility="no-hide-descendants">
        <MapPin size={22} strokeWidth={2} color={ROSE} />
      </View>
      <View style={styles.noteText}>
        <Copy style={styles.caption}>{caption}</Copy>
        <Copy>{view.text}</Copy>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.s,
    paddingVertical: space.l,
    paddingLeft: 18,
    paddingRight: space.s,
    borderRadius: r.tile,
    backgroundColor: NOTE.tint,
  },
  noteBody: { flex: 1, flexDirection: "row", gap: space.m, paddingRight: 10 },
  noteText: { flex: 1, gap: 3 },
  // Small capitals, as in the mockup; the words stay in sentence case for VoiceOver.
  caption: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: c.muted },
  meeting: {
    flexDirection: "row",
    gap: space.m,
    paddingVertical: space.l,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
  },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: space.l,
    borderRadius: 20,
    backgroundColor: c.surface,
  },
  lockedText: { flex: 1, fontSize: 14, color: "#5D5866" },
});
