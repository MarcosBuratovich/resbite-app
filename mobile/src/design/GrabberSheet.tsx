import React from "react";
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { colors as c, r, space } from "./tokens";
import { s, useReduceMotion } from "./ui";

/** How far down a swipe on the grabber or heading must travel before it closes the sheet. */
const CLOSE_DISTANCE = 60;

/**
 * A short task over the screen it belongs to (GL 5): a grabber on top, a heading, no X. Tapping
 * outside, swiping down on the grabber or heading, the Android back button and the VoiceOver
 * escape gesture all close it without saving; the content's own buttons save.
 */
export function GrabberSheet({
  visible,
  title,
  icon: Icon,
  onClose,
  label,
  children,
}: {
  visible: boolean;
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  /** The sheet's spoken name when it differs from the title. */
  label?: string;
  children?: React.ReactNode;
}) {
  const reduce = useReduceMotion();
  const close = React.useRef(onClose);
  close.current = onClose;
  const swipe = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 8 && g.dy > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > CLOSE_DISTANCE) close.current();
        },
      }),
    [],
  );
  return (
    <Modal visible={visible} transparent animationType={reduce ? "fade" : "slide"} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable accessible={false} focusable={false} style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={styles.sheet}
          accessibilityViewIsModal
          aria-modal
          accessibilityLabel={label}
          onAccessibilityEscape={onClose}
        >
          <View {...swipe.panHandlers} style={styles.top}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
              style={styles.grabberHit}
            >
              <View style={styles.grabber} />
            </Pressable>
            <View style={styles.heading}>
              {Icon ? (
                <View aria-hidden importantForAccessibility="no-hide-descendants">
                  <Icon size={24} color={c.ink} />
                </View>
              ) : null}
              <Text accessibilityRole="header" style={[s.title, styles.title]}>
                {title}
              </Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(52, 48, 67, 0.45)" },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: r.card,
    borderTopRightRadius: r.card,
    backgroundColor: c.paper,
    boxShadow: "0 -8px 30px rgba(64, 44, 65, 0.18)",
  },
  top: { paddingHorizontal: space.xl, paddingTop: 10, gap: space.m },
  grabberHit: { alignSelf: "center", paddingVertical: 4, paddingHorizontal: 12 },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: c.line },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, fontSize: 24, lineHeight: 30 },
  body: { paddingHorizontal: space.xl, paddingTop: space.m, paddingBottom: 30, gap: space.m },
});
