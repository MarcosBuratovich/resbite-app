import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ScalePressable } from "./kit";
import { colors as c, depth, fonts, space } from "./tokens";
import { useLargeText } from "./ui";

export type BarAction = {
  key: string;
  title: string;
  icon: LucideIcon;
  onPress: () => void;
  /** The pink pill: the page's one main action. */
  primary?: boolean;
  /** The spoken name when it says more than the title. */
  label?: string;
};

/**
 * The fixed row of labelled pills under a content page (M-06): a decorative icon beside a bold
 * label, on a hairline over paper. One action spans the width. `lead` sits first
 * and is twice as wide: the reply pill.
 */
export function ActionBar({ actions, lead }: { actions: BarAction[]; lead?: React.ReactNode }) {
  const largeText = useLargeText();
  return (
    <View testID="action-bar" style={[styles.bar, largeText && styles.barStacked]}>
      {lead}
      {actions.map(({ key, title, icon: Icon, onPress, primary, label }) => (
        <ScalePressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label ?? title}
          onPress={onPress}
          outerStyle={largeText ? undefined : styles.cell}
          style={({ pressed }) => [styles.pill, primary && styles.primary, pressed && { opacity: 0.9 }]}
        >
          <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Icon size={20} strokeWidth={1.8} color={c.ink} />
          </View>
          <Text style={styles.label}>{title}</Text>
        </ScalePressable>
      ))}
    </View>
  );
}

/**
 * The reply, in the bar's first cell (M-06): the answer as text, with `Change` underlined at the
 * right as the one button ("Change your answer"). Without `onChange` it is plain text.
 */
export function ReplyPill({ text, onChange }: { text: string; onChange?: () => void }) {
  const largeText = useLargeText();
  return (
    <View style={[styles.pill, styles.reply, largeText ? styles.replyStacked : styles.replyCell]}>
      <Text style={[styles.replyText, !largeText && styles.line]}>{text}</Text>
      {onChange ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your answer"
          onPress={onChange}
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          style={styles.change}
        >
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: space.l,
    paddingTop: space.m,
    paddingBottom: space.l,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.paper,
  },
  // Under Larger Text the pills stack, each as wide as the bar.
  barStacked: { flexDirection: "column" },
  cell: { flex: 1 },
  pill: {
    minHeight: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: c.line,
    backgroundColor: c.paper,
  },
  primary: { backgroundColor: c.pink, borderColor: "#F8CBD0", boxShadow: depth.button },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.ink, flexShrink: 1, textAlign: "center" },
  reply: { justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 8 },
  replyCell: { flex: 2 },
  replyStacked: { alignSelf: "stretch" },
  replyText: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: c.ink },
  line: { lineHeight: 20 },
  change: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingLeft: space.s },
  changeText: { fontFamily: fonts.bold, fontSize: 16, color: c.ink, textDecorationLine: "underline" },
});
