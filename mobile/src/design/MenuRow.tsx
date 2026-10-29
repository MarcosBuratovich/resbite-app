import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors as c, fonts, space } from "./tokens";
import { useLargeText } from "./ui";

/**
 * One row of a menu sheet (the More sheet, M-08): a 24 pt icon and a semibold title on a 60 pt
 * row with a hairline under it. `destructive` is in the error colour. `label` is the spoken name
 * when it says more than the title ("Cancel this resbite, for everyone").
 */
export function MenuRow({
  title,
  icon: Icon,
  onPress,
  destructive = false,
  label,
}: {
  title: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
  label?: string;
}) {
  const largeText = useLargeText();
  const ink = destructive ? c.error : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icon size={24} strokeWidth={1.8} color={ink} />
      </View>
      <Text style={[styles.title, { color: ink }, !largeText && styles.titleLine]}>{title}</Text>
    </Pressable>
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
  // The sheet's body pads 24 pt each side; the band runs edge to edge.
  separator: { height: 8, backgroundColor: c.surface, marginHorizontal: -space.xl },
});
