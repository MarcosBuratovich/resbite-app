import React from "react";
import { Platform } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import * as Haptics from "expo-haptics";
import { colors as c } from "../../src/design/tokens";

export const unstable_settings = { initialRouteName: "discover" };

// Let iOS render its native glass, selection motion and accessibility behavior.
// Keeping the navigator mounted also preserves each tab's search and form state.
export default function TabLayout() {
  return (
    <NativeTabs
      tintColor={c.aquaDark}
      iconColor={{ default: "#625D70", selected: c.aquaDark }}
      labelStyle={{
        default: { fontSize: 11, fontWeight: "400", color: "#625D70" },
        selected: { fontSize: 11, fontWeight: "400", color: c.aquaDark },
      }}
      backgroundColor={Platform.OS === "ios" ? undefined : c.paper}
      indicatorColor={c.aquaSoft}
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      backBehavior="history"
      screenListeners={{
        tabPress: (event) => {
          if (Platform.OS !== "web" && !event.data.isPrevented) {
            void Haptics.selectionAsync().catch(() => {});
          }
        },
      }}
    >
      <NativeTabs.Trigger name="discover">
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "safari", selected: "safari.fill" }}
          md="explore"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plans">
        <NativeTabs.Trigger.Label>My resbites</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="wellness">
        <NativeTabs.Trigger.Label>Wellness</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "leaf", selected: "leaf.fill" }}
          md="spa"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
