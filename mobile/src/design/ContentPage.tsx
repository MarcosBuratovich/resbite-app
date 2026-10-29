import React from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { CoverArt, IconButton, focusHeading } from "./kit";
import { colors as c, depth, fonts, space } from "./tokens";
import { s, useLargeText, useReduceMotion } from "./ui";
import type { EventPicture } from "../domain/events";

/** The cover's height; it runs under the status bar to the top of the screen. */
const COVER = 230;
/** The bar's own height under the status bar: the Back circle between 6 pt margins. */
const BAR = 56;
/** How far the bar takes to fade in once the cover has gone. */
const FADE = 60;

/**
 * A page with a picture on top (GL 13, M-06): the cover runs to the top of the screen, Back
 * floats over it in a paper circle, and once the cover has scrolled away a solid bar with the
 * title fades in (with Reduce Motion it simply appears). The title in the body is the page's
 * heading and takes focus on mount. `bottom` is fixed under the scroll (the action bar).
 */
export function ContentPage({
  title,
  picture,
  uri,
  pictureLabel,
  dimmed = false,
  onBack,
  bottom,
  children,
}: {
  title: string;
  picture: EventPicture;
  uri?: string | null;
  /** The organiser's description of the photo, for screen readers. */
  pictureLabel?: string;
  dimmed?: boolean;
  onBack: () => void;
  bottom?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const largeText = useLargeText();
  const scroll = React.useRef(new Animated.Value(0)).current;
  const titleRef = React.useRef<Text | null>(null);
  const barHeight = insets.top + BAR;
  // Solid once the cover has scrolled up to the bar.
  const start = COVER - barHeight;
  const barOpacity = scroll.interpolate({
    inputRange: [start, start + (reduce ? 1 : FADE)],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(titleRef.current));
    return () => cancelAnimationFrame(frame);
  }, []);
  const label = pictureLabel?.trim();
  return (
    <View testID="content-page" style={s.page}>
      <Animated.ScrollView
        testID="content-scroll"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scroll } } }], {
          useNativeDriver: Platform.OS !== "web",
        })}
        contentContainerStyle={styles.scrollBody}
      >
        <View
          style={[styles.cover, dimmed && { opacity: 0.5 }]}
          {...(label
            ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label, "aria-label": label }
            : {})}
        >
          <CoverArt picture={picture} uri={uri} />
        </View>
        <View style={styles.body}>
          <Text
            ref={titleRef}
            accessibilityRole="header"
            style={[styles.title, !largeText && styles.titleLine]}
          >
            {title}
          </Text>
          {children}
        </View>
      </Animated.ScrollView>
      <Animated.View
        testID="content-bar"
        pointerEvents="none"
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.bar, { height: barHeight, paddingTop: insets.top, opacity: barOpacity }]}
      >
        <Text numberOfLines={largeText ? 2 : 1} style={styles.barTitle}>
          {title}
        </Text>
      </Animated.View>
      <View style={[styles.back, { top: insets.top + 6 }]}>
        <IconButton icon={ArrowLeft} label="Back" tone="plain" onPress={onBack} />
      </View>
      {bottom}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollBody: { paddingBottom: space.xl },
  cover: { height: COVER, backgroundColor: c.cream, overflow: "hidden" },
  body: { paddingHorizontal: 20, paddingTop: space.l, gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 28, color: c.ink },
  titleLine: { lineHeight: 34 },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    // Clear of the Back circle on the left and a matching gutter on the right.
    paddingHorizontal: 16 + 44 + space.m,
    backgroundColor: c.paper,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  barTitle: { fontFamily: fonts.medium, fontSize: 17, color: c.ink, textAlign: "center" },
  back: {
    position: "absolute",
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.paper,
    boxShadow: depth.small,
  },
});
