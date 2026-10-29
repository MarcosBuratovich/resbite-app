import React from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { ScalePressable } from "./kit";
import { Copy } from "./ui";
import { colors as c, depth, fonts, r } from "./tokens";

export type OpenRowState = "open" | "filled" | "missing";

/**
 * One line of the plan screen (When, Where): an icon, a small label, then a bold placeholder
 * while it is still open, or its value. `open` is a dashed card that invites a tap; `missing`
 * is outlined in the error colour with `message` above it. The whole row is one button.
 */
export function OpenRow({
  icon: Icon,
  label,
  placeholder,
  value,
  hint,
  state,
  message,
  onPress,
  accessibilityLabel,
  rowRef,
  onLayout,
}: {
  icon: LucideIcon;
  label: string;
  placeholder: string;
  value: string | null;
  hint?: string | null;
  state: OpenRowState;
  message?: string | null;
  onPress: () => void;
  accessibilityLabel: string;
  /** The row's button (accessibility focus lands here); `onLayout` is the whole row (scroll to its y). */
  rowRef?: React.RefObject<View | null>;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const missing = state === "missing";
  const open = state === "open";
  const showMessage = missing && !!message;
  const text = value || placeholder;
  return (
    <View onLayout={onLayout} style={styles.wrap}>
      {showMessage && (
        // The button's hint says it; hiding the visible copy stops VoiceOver speaking it twice.
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Copy style={styles.message}>{message}</Copy>
        </View>
      )}
      <ScalePressable
        ref={rowRef}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={showMessage ? message! : undefined}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          open && styles.open,
          missing && styles.missing,
          pressed && { opacity: 0.9 },
        ]}
      >
        <View style={styles.icon} aria-hidden importantForAccessibility="no-hide-descendants">
          <Icon size={20} strokeWidth={1.8} color={c.ink} />
        </View>
        <View style={styles.text}>
          <Copy style={styles.label}>{label}</Copy>
          <Copy style={open || !value ? { ...styles.value, ...styles.placeholder } : styles.value}>{text}</Copy>
          {!open && !!value && !!hint && <Copy style={styles.hint}>{hint}</Copy>}
        </View>
        <ChevronRight size={20} color={c.muted} aria-hidden />
      </ScalePressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  message: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: c.error, marginLeft: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: r.panel,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    backgroundColor: c.paper,
    boxShadow: depth.card,
  },
  // The thicker borders take the extra width from the padding so the row never changes size.
  open: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: c.purple,
    backgroundColor: "#FFFDFC",
    boxShadow: "none",
    paddingVertical: 9.5,
    paddingLeft: 15.5,
    paddingRight: 13.5,
  },
  missing: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: c.error,
    boxShadow: "none",
    paddingVertical: 9,
    paddingLeft: 15,
    paddingRight: 13,
  },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 1, minWidth: 0 },
  label: { fontSize: 12, lineHeight: 16, color: c.muted },
  value: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: c.ink },
  placeholder: { fontFamily: fonts.bold },
  hint: { fontSize: 13, lineHeight: 18, color: c.muted },
});
