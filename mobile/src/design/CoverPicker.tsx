import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Camera, Info, Trash2 } from "lucide-react-native";
import { Button, Copy } from "./ui";
import { IconButton, InfoSheet } from "./kit";
import { EventPictureView } from "./categories";
import { colors as c, r } from "./tokens";
import type { EventPicture } from "../domain/events";
import type { CoverControls } from "../state/useCoverPhoto";

const PRIVACY = "Only add photos you’re comfortable sharing with the people you invite.";

/**
 * The What step's photo tile (CE2 actions, UX1 look). Add and Change open the system
 * picker directly, so iOS never presents it from a closing sheet; ⓘ explains privacy.
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
  const blocked = Boolean(disabled) || cover.busy || !cover.ready;
  return (
    <View style={styles.wrap}>
      {cover.pending ? (
        <CoverRecovery cover={cover} disabled={disabled} />
      ) : (
        <View style={styles.row}>
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
            {cover.uri ? (
              <Image source={{ uri: cover.uri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : (
              <View style={styles.empty}>
                <EventPictureView picture={fallback} size={64} />
                <Camera size={22} strokeWidth={1.7} color={c.aquaDark} />
              </View>
            )}
          </Pressable>
          <View style={styles.side}>
            {!!cover.uri && (
              <IconButton icon={Trash2} label="Remove cover photo" disabled={blocked} onPress={() => void cover.remove()} />
            )}
            <IconButton icon={Info} label="About cover photos" onPress={() => setAbout(true)} />
          </View>
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
    </View>
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
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tile: {
    flex: 1,
    height: 168,
    borderRadius: r.tile,
    overflow: "hidden",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  photo: { width: "100%", height: "100%" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  side: { gap: 8 },
  hint: { fontSize: 12, color: c.muted },
});
