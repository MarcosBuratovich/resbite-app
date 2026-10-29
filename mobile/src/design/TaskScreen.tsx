import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { IconButton } from "./kit";
import { Copy, s, useLargeText } from "./ui";
import { colors as c, fonts, space } from "./tokens";

/**
 * A task that creates or changes something (GL 13): a full screen with the close X at the top
 * left, the task's title in the middle, nothing on the right, and the main action pinned at the
 * bottom. `line` is a short error above the footer.
 */
export function TaskScreen({
  title,
  onClose,
  closeLabel = "Close",
  line,
  footer,
  scrollRef,
  titleRef,
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  line?: string | null;
  footer: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  titleRef?: React.RefObject<Text | null>;
  children: React.ReactNode;
}) {
  const largeText = useLargeText();
  return (
    <SafeAreaView testID="task-screen" style={s.page}>
      <View style={styles.bar}>
        <View style={styles.close}>
          <IconButton icon={X} label={closeLabel} onPress={onClose} />
        </View>
        <Text
          ref={titleRef}
          accessibilityRole="header"
          numberOfLines={largeText ? undefined : 2}
          style={[styles.title, !largeText && styles.titleLine]}
        >
          {title}
        </Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          testID="task-scroll"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.body}
        >
          {children}
        </ScrollView>
        <View testID="task-footer" style={styles.footer}>
          {/* Always mounted, so a line that appears is announced as a change (iOS ignores one that mounts with its text). */}
          <Copy accessibilityLiveRegion="polite" style={line ? styles.line : { ...styles.line, ...styles.lineEmpty }}>
            {line ?? ""}
          </Copy>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // The bar is 44 pt of control with the title between two 60 pt gutters so it never runs under the X.
  bar: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 6, justifyContent: "center" },
  close: { position: "absolute", left: 16, top: 6, zIndex: 1 },
  title: {
    fontFamily: fonts.medium,
    fontSize: 17,
    color: c.ink,
    textAlign: "center",
    marginHorizontal: 60 - 16,
  },
  titleLine: { lineHeight: 22 },
  body: { paddingHorizontal: 20, paddingTop: space.m, paddingBottom: space.xl, gap: 10 },
  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.m,
    paddingBottom: space.l,
    gap: space.s,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.paper,
  },
  line: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: c.error, textAlign: "center" },
  // Empty, the line takes no room: the negative margin cancels the footer's gap.
  lineEmpty: { height: 0, marginTop: -space.s },
});
