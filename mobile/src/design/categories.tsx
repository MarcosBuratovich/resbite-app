import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Bike, Flower2, Lightbulb, Palette, Sun, Trees, Users } from "lucide-react-native";
import type { CategoryKey } from "../domain/categories";
import type { EventPicture } from "../domain/events";
import { artwork } from "../services/catalogue";
import { useCoverUri } from "../state/useCoverUri";
import { categoryPalette } from "./tokens";

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
