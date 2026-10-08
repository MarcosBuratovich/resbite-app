import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Bike, Flower2, Lightbulb, Palette, Sun, Trees, Users } from "lucide-react-native";
import { categoryLabels, type CategoryKey } from "../domain/categories";
import type { EventPicture } from "../domain/events";
import { artwork } from "../services/catalogue";
import { useCoverUri } from "../state/useCoverUri";
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

/** Idea artwork when available, otherwise the primary category's tile. */
export function EventPictureView({
  picture,
  size = 66,
  fill = false,
}: {
  picture: EventPicture;
  size?: number;
  /** Fill the parent (cover cards) instead of a size × size square. */
  fill?: boolean;
}) {
  if (picture.kind === "cover") return <CoverThumb picture={picture} size={size} fill={fill} />;
  if (picture.kind === "artwork")
    return (
      <Image
        source={artwork[picture.key]}
        style={fill ? styles.fill : { width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  const Icon = categoryIcons[picture.category];
  const { tint, ink } = categoryPalette[picture.category];
  if (fill)
    return (
      <View accessible={false} style={[styles.fill, { alignItems: "center", justifyContent: "center" }]}>
        <Icon size={64} strokeWidth={1.4} color={ink} />
      </View>
    );
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
  fill: { width: "100%", height: "100%" },
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

/** A cover thumbnail; until its signed link loads, or if it fails, the fallback picture shows. */
function CoverThumb({
  picture,
  size,
  fill,
}: {
  picture: Extract<EventPicture, { kind: "cover" }>;
  size: number;
  fill: boolean;
}) {
  const uri = useCoverUri(picture.path);
  if (!uri) return <EventPictureView picture={picture.fallback} size={size} fill={fill} />;
  return (
    <Image
      source={{ uri }}
      style={fill ? styles.fill : { width: size, height: size, borderRadius: size / 4 }}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
    />
  );
}
