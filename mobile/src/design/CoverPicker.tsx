import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Camera, Info, TextAlignStart, Trash2 } from "lucide-react-native";
import { Button, Copy, ErrorNote } from "./ui";
import { Chip, IconButton, InfoSheet } from "./kit";
import { EventPictureView } from "./categories";
import { colors as c, depth, fonts, r } from "./tokens";
import { COVER_DESCRIPTION_MAX } from "../domain/covers";
import type { EventPicture } from "../domain/events";
import type { CoverControls } from "../state/useCoverPhoto";

const PRIVACY = "Only add photos you’re comfortable sharing with the people you invite.";
const ROSE = "#963F58";

/**
 * The What step's photo area (CE2 actions, steps v2 look): full width, first on the step.
 * Empty, it invites "Add a photo"; with a cover (or the idea's artwork) the picture fills it,
 * with no text over it. Add and Change open the system picker directly, so iOS never presents
 * it from a closing sheet; Remove and ⓘ (privacy) sit in the corner. A real photo gets a
 * "Describe photo" chip just below it, never over it (UX2).
 */
export function CoverPicker({
  cover,
  fallback,
  disabled,
}: {
  cover: CoverControls;
  fallback: EventPicture;
  disabled?: boolean;
}) {
  const [about, setAbout] = useState(false);
  const [describing, setDescribing] = useState(false);
  const blocked = Boolean(disabled) || cover.busy || !cover.ready;
  const artwork = fallback.kind === "artwork";
  return (
    <View style={styles.wrap}>
      {cover.pending ? (
        <CoverRecovery cover={cover} disabled={disabled} />
      ) : (
        <View style={styles.area}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cover.uri ? "Change cover photo" : "Add cover photo"}
            accessibilityHint={PRIVACY}
            aria-disabled={blocked}
            aria-busy={cover.busy}
            disabled={blocked}
            onPress={() => void cover.choose()}
            style={({ pressed }) => [styles.tile, { opacity: blocked ? 0.55 : pressed ? 0.8 : 1 }]}
          >
            {cover.uri || artwork ? (
              <>
                {cover.uri ? (
                  <Image source={{ uri: cover.uri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.photo, { backgroundColor: c.cream }]}>
                    <EventPictureView picture={fallback} fill />
                  </View>
                )}
                {/* A small camera badge says the picture can be changed; it is part of the button. */}
                <View style={styles.badge}>
                  <Camera size={22} strokeWidth={2} color={ROSE} />
                </View>
              </>
            ) : (
              <View style={styles.empty}>
                <View style={styles.camera}>
                  <Camera size={32} strokeWidth={2} color={ROSE} />
                </View>
                <Copy style={styles.add}>Add a photo</Copy>
              </View>
            )}
          </Pressable>
          <View style={styles.corner}>
            {!!cover.uri && (
              <IconButton icon={Trash2} label="Remove cover photo" disabled={blocked} onPress={() => void cover.remove()} />
            )}
            <IconButton
              icon={Info}
              label="About cover photos"
              tone={cover.uri || artwork ? "soft" : "plain"}
              onPress={() => setAbout(true)}
            />
          </View>
        </View>
      )}
      {!cover.pending && !!cover.uri && (
        <View style={{ alignSelf: "flex-start" }}>
          <Chip
            icon={TextAlignStart}
            text={cover.description ? "Edit description" : "Describe photo"}
            label={cover.description ? `Edit photo description, ${cover.description}` : "Describe photo"}
            onPress={() => {
              if (!blocked) setDescribing(true);
            }}
          />
        </View>
      )}
      {!!cover.message && (
        <Copy style={styles.hint} accessibilityLiveRegion="polite">
          {cover.message}
        </Copy>
      )}
      <InfoSheet visible={about} title="Cover photos" onClose={() => setAbout(false)}>
        <Copy>{PRIVACY}</Copy>
      </InfoSheet>
      <DescribeSheet visible={describing} cover={cover} onClose={() => setDescribing(false)} />
    </View>
  );
}

/** One optional field, read aloud by VoiceOver. A failed or conflicting save keeps the sheet and the text. */
function DescribeSheet({ visible, cover, onClose }: { visible: boolean; cover: CoverControls; onClose: () => void }) {
  const [text, setText] = useState(cover.description);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setText(cover.description);
      setError(null);
    }
    // Only on opening: later description changes must not overwrite what is being typed.
  }, [visible]);
  async function save() {
    const failure = await cover.describe(text);
    if (failure) setError(failure);
    else onClose();
  }
  return (
    <InfoSheet visible={visible} title="Describe photo" onClose={onClose}>
      <TextInput
        accessibilityLabel="Photo description"
        placeholder="Two friends sharing a picnic by the lake"
        placeholderTextColor={c.muted}
        value={text}
        onChangeText={setText}
        maxLength={COVER_DESCRIPTION_MAX}
        multiline
        editable={!cover.busy}
        style={styles.describe}
      />
      <Copy style={styles.hint}>VoiceOver reads this aloud for people who can’t see the photo.</Copy>
      <ErrorNote message={error} />
      <Button title="Save" onPress={() => void save()} loading={cover.busy} disabled={cover.busy} />
    </InfoSheet>
  );
}

/** Pending-cover recovery, in its CE2 wording; shown on What and on Review. */
export function CoverRecovery({ cover, disabled }: { cover: CoverControls; disabled?: boolean }) {
  const blocked = Boolean(disabled) || cover.busy || !cover.ready;
  return (
    <>
      <Copy>A cover change needs confirmation. Retry checks the saved cover before changing anything.</Copy>
      <Button title="Keep saved cover" secondary onPress={() => void cover.keep()} disabled={blocked} />
      <Button title="Retry cover" secondary onPress={() => void cover.retry()} disabled={blocked} loading={cover.busy} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  area: { position: "relative" },
  tile: {
    height: 240,
    borderRadius: r.card,
    overflow: "hidden",
    backgroundColor: c.pinkSoft,
  },
  photo: { width: "100%", height: "100%" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 16 },
  camera: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 16px rgba(150, 63, 88, 0.15)",
  },
  add: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: ROSE, textAlign: "center" },
  badge: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.small,
  },
  corner: { position: "absolute", top: 12, right: 12, flexDirection: "row", gap: 8 },
  hint: { fontSize: 12, color: c.muted },
  describe: {
    minHeight: 96,
    borderRadius: r.tile,
    backgroundColor: c.surface,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: c.ink,
    textAlignVertical: "top",
  },
});
