import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Camera, Trash2 } from "lucide-react-native";
import { ActionGroup, ActionRow, Button, Copy, TextAction } from "./ui";
import { EventPictureView } from "./categories";
import { colors as c } from "./tokens";
import type { EventPicture } from "../domain/events";
import type { CoverControls } from "../state/useCoverPhoto";

/** Cover photo controls at the top of "What are we doing?" (CE2). */
export function CoverPicker({
  cover,
  fallback,
  disabled,
}: {
  cover: CoverControls;
  fallback: EventPicture;
  disabled?: boolean;
}) {
  const blocked = Boolean(disabled) || cover.busy || !cover.ready;
  return (
    <View style={styles.wrap}>
      {cover.uri ? (
        <Image
          source={{ uri: cover.uri }}
          style={styles.cover}
          resizeMode="cover"
          accessibilityLabel="Cover photo"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <EventPictureView picture={fallback} size={96} />
      )}
      {cover.pending ? (
        <>
          <Copy>A cover change needs confirmation. Retry checks the saved cover before changing anything.</Copy>
          <Button title="Keep saved cover" secondary onPress={() => void cover.keep()} disabled={blocked} />
          <Button title="Retry cover" secondary onPress={() => void cover.retry()} disabled={blocked} loading={cover.busy} />
        </>
      ) : (
        <>
          <ActionGroup>
            <ActionRow
              icon={Camera}
              tone="rose"
              title={cover.uri ? "Change cover photo" : "Add cover photo"}
              onPress={() => void cover.choose()}
              disabled={blocked}
              loading={cover.busy}
            />
          </ActionGroup>
          {!!cover.uri && (
            <TextAction
              icon={Trash2}
              destructive
              title="Remove cover photo"
              onPress={() => void cover.remove()}
              disabled={blocked}
            />
          )}
        </>
      )}
      <Copy style={styles.hint}>Only add photos you’re comfortable sharing with the people you invite.</Copy>
      {!!cover.message && (
        <Copy style={styles.hint} accessibilityLiveRegion="polite">
          {cover.message}
        </Copy>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  cover: { width: "100%", height: 160, borderRadius: 18 },
  hint: { fontSize: 12, color: c.muted },
});
