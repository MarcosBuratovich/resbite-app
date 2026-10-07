import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Bike, Flower2, Lightbulb, Palette, Sun, Trees, Users } from "lucide-react-native";
import { categoryLabels, type CategoryKey } from "../domain/categories";
import { colors as c, fonts } from "./tokens";
import { Copy } from "./ui";

export type CategoryIcon = typeof Sun;
export const categoryIcons: Record<CategoryKey, CategoryIcon> = {
  creative: Palette,
  intellectual: Lightbulb,
  mindful: Flower2,
  natural: Trees,
  physical: Bike,
  community: Users,
  uplifting: Sun,
};

export function categoryText(keys: readonly CategoryKey[]) {
  return keys.map((key) => categoryLabels[key]).join(" · ");
}

/** A single-choice filter tile for browsing ideas. */
export function CategoryFilterTile({
  label,
  icon: Icon,
  selected,
  onPress,
}: {
  label: string;
  icon: CategoryIcon;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.filter,
        {
          borderColor: selected ? c.aquaDark : c.line,
          backgroundColor: selected ? c.aquaSoft : c.paper,
        },
      ]}
    >
      <Icon size={20} strokeWidth={1.7} color={selected ? c.aquaDark : "#665381"} />
      <Copy
        style={{
          fontSize: 12,
          fontFamily: fonts.body,
          color: selected ? c.aquaDark : c.ink,
        }}
      >
        {label}
      </Copy>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filter: {
    minHeight: 64,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
});
