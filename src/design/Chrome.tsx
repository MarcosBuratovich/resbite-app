import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import {
  Compass,
  CalendarDays,
  Flower2,
  UserRound,
  X,
} from "lucide-react-native";
import { Copy } from "./ui";
import { colors as c, fonts } from "./tokens";
import { useApp } from "../state/AppState";
export function PreviewNotice() {
  const { preview, setPreview } = useApp();
  if (!preview) return null;
  return (
    <View style={styles.preview}>
      <Copy style={{ fontSize: 11, color: c.aquaDark, flex: 1 }}>
        Design preview · actions stay on this device
      </Copy>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Exit preview"
        hitSlop={10}
        onPress={() => {
          setPreview(false);
          router.replace("/");
        }}
      >
        <X size={16} color={c.aquaDark} />
      </Pressable>
    </View>
  );
}
export function BottomNav() {
  const path = usePathname(),
    insets = useSafeAreaInsets();
  const tabs = [
    ["/discover", "Discover", Compass],
    ["/plans", "My resbites", CalendarDays],
    ["/wellness", "Wellness", Flower2],
    ["/profile", "Profile", UserRound],
  ] as const;
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 14) }]}>
      {tabs.map(([href, label, Icon]) => {
        const selected = path === href;
        return (
          <Pressable
            key={href}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={() => router.replace(href)}
            style={styles.tab}
          >
            <View
              style={[styles.icon, selected && { backgroundColor: c.aquaSoft }]}
            >
              <Icon
                size={22}
                strokeWidth={selected ? 2 : 1.65}
                color={selected ? c.aquaDark : c.muted}
              />
            </View>
            <Copy
              style={{
                fontSize: 10,
                fontFamily: selected ? fonts.bold : fonts.body,
                color: selected ? c.aquaDark : c.muted,
                lineHeight: 16,
              }}
            >
              {label}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  nav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: c.paper,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: c.line,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  tab: { alignItems: "center", minWidth: 70, gap: 3 },
  icon: { paddingVertical: 6, paddingHorizontal: 17, borderRadius: 20 },
  preview: {
    backgroundColor: c.aquaSoft,
    paddingHorizontal: 20,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
  },
});
