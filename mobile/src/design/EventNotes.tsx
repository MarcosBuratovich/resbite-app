import React from "react";
import { StyleSheet, View } from "react-native";
import { Lock, MapPin } from "lucide-react-native";
import { Copy } from "./ui";
import { colors as c, fonts, space } from "./tokens";
import { MEETING_DETAILS_LOCKED, type MeetingDetailsView } from "../domain/eventDetails";

// UX3 event page notes (spec "Event details", UX3-D6; mockup "Event details"): Meeting details (shown, or a locked
// line). The Note to guests is shown by the resbite page itself and posted from Edit.

const ROSE = "#963F58";

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
