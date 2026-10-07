import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Bike, Flower2, Lightbulb, Palette, Sun, Trees, Users } from "lucide-react-native";
import {
  categoryKeys,
  categoryLabels,
  toggleCategory,
  type CategoryKey,
} from "../domain/categories";
import type { EventPicture } from "../domain/events";
import { artwork } from "../services/catalogue";
import { categoryPalette, colors as c, fonts } from "./tokens";
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

export function categoryText(keys: readonly CategoryKey[] | undefined) {
  return (keys ?? []).map((key) => categoryLabels[key]).join(" · ");
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

/** Multi-select category chips for the editor: one or two, a third is refused. */
export function CategoryChoices({
  value,
  onChange,
  disabled,
}: {
  value: CategoryKey[];
  onChange: (next: CategoryKey[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.choices}>
      {categoryKeys.map((key) => {
        const selected = value.includes(key);
        const full = !selected && value.length >= 2;
        const Icon = categoryIcons[key];
        const { tint, ink } = categoryPalette[key];
        return (
          <Pressable
            key={key}
            accessibilityRole="checkbox"
            accessibilityLabel={categoryLabels[key]}
            accessibilityState={{ checked: selected, disabled: disabled || full }}
            accessibilityHint={full ? "Two categories are already chosen" : undefined}
            disabled={disabled || full}
            onPress={() => onChange(toggleCategory(value, key))}
            style={[
              styles.choice,
              {
                backgroundColor: selected ? tint : c.paper,
                borderColor: selected ? ink : c.line,
                opacity: full ? 0.5 : 1,
              },
            ]}
          >
            <Icon size={16} strokeWidth={1.8} color={selected ? ink : c.muted} />
            <Copy style={{ fontSize: 13, color: selected ? ink : c.ink }}>
              {categoryLabels[key]}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Idea artwork when available, otherwise the primary category's tile. */
export function EventPictureView({
  picture,
  size = 66,
}: {
  picture: EventPicture;
  size?: number;
}) {
  if (picture.kind === "artwork")
    return (
      <Image
        source={artwork[picture.key]}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  const Icon = categoryIcons[picture.category];
  const { tint, ink } = categoryPalette[picture.category];
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.6} color={ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
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
