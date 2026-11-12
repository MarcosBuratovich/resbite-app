import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors as c, fonts, space } from "./tokens";
import { useLargeText } from "./ui";

/**
 * One row of a menu sheet (the More sheet, M-08): a 24 pt icon and a semibold title on a 60 pt
 * row with a hairline under it. `destructive` is in the error colour. `label` is the spoken name
 * when it says more than the title ("Cancel this resbite, for everyone"). `hint` is a muted sub-line
 * under the title ("Ana decides. Then you can invite each other in the app."), read as the hint.
 */
export function MenuRow({
  title,
  icon: Icon,
  onPress,
  destructive = false,
  label,
  hint,
  busy = false,
  disabled = false,
  ref,
}: {
  title: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
  label?: string;
  hint?: string;
  /** The row's action is running: dimmed and not pressable. */
  busy?: boolean;
  /** Another action is running: dimmed and not pressable. */
  disabled?: boolean;
  /** The row's own view, so a sheet can move focus to it. */
  ref?: React.Ref<View>;
}) {
  const largeText = useLargeText();
  const ink = destructive ? c.error : c.ink;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityHint={hint}
      accessibilityState={{ busy, disabled: disabled || busy }}
      aria-busy={busy}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.row, (disabled || busy) && { opacity: 0.45 }, pressed && { opacity: 0.7 }]}
    >
      <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icon size={24} strokeWidth={1.8} color={ink} />
      </View>
      {hint ? (
        <View style={styles.text}>
          <Text style={[styles.stackedTitle, { color: ink }, !largeText && styles.titleLine]}>{title}</Text>
          <Text style={[styles.hint, !largeText && styles.hintLine]}>{hint}</Text>
        </View>
      ) : (
        <Text style={[styles.title, { color: ink }, !largeText && styles.titleLine]}>{title}</Text>
      )}
    </Pressable>
  );
}

/**
 * A menu row that says where things stand rather than doing anything ("Request sent"): the row's look, muted, no
 * button; one element for screen readers, read as its title.
 */
export function MenuLabel({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const largeText = useLargeText();
  return (
    <View accessible accessibilityLabel={title} style={styles.row}>
      <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icon size={24} strokeWidth={1.8} color={c.muted} />
      </View>
      <Text style={[styles.title, { color: c.muted }, !largeText && styles.titleLine]}>{title}</Text>
    </View>
  );
}

/** The 8 pt band that sets a menu's last group (the destructive row) apart. */
export function MenuSeparator() {
  return <View testID="menu-separator" aria-hidden style={styles.separator} />;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.l,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  title: { flex: 1, fontFamily: fonts.medium, fontSize: 16 },
  titleLine: { lineHeight: 22 },
  // With a hint the title and its sub-line stack in the space the title alone takes.
  text: { flex: 1, gap: 2, paddingVertical: space.s },
  stackedTitle: { fontFamily: fonts.medium, fontSize: 16 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  hintLine: { lineHeight: 18 },
  // The sheet's body pads 24 pt each side; the band runs edge to edge.
  separator: { height: 8, backgroundColor: c.surface, marginHorizontal: -space.xl },
});
