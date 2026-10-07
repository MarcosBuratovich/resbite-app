import React from "react";
import { Tabs } from "expo-router";
import { CirclePlus, CalendarDays, Leaf, UserRound } from "lucide-react-native";
import { colors as c, fonts } from "../../src/design/tokens";

// Browser-only design review. iPhone and Android use the native tab layout.
export default function WebTabLayout() {
  return (
    <Tabs
      initialRouteName="create"
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.aquaDark,
        tabBarInactiveTintColor: "#625D70",
        tabBarActiveBackgroundColor: c.aquaSoft,
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 10 },
        tabBarItemStyle: { borderRadius: 20, margin: 6, paddingVertical: 5, overflow: "hidden" },
        tabBarStyle: {
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          height: 72,
          borderRadius: 28,
          borderTopWidth: 0,
          backgroundColor: c.paper,
          boxShadow: "0 6px 28px rgba(36, 60, 60, 0.14)",
        },
        sceneStyle: { backgroundColor: c.paper, paddingBottom: 96 },
      }}
    >
      <Tabs.Screen name="create" options={{ title: "Create", tabBarIcon: ({ color }) => <CirclePlus size={22} strokeWidth={1.7} color={color} /> }} />
      <Tabs.Screen name="plans" options={{ title: "My resbites", tabBarIcon: ({ color }) => <CalendarDays size={22} strokeWidth={1.7} color={color} /> }} />
      <Tabs.Screen name="wellness" options={{ title: "Wellness", tabBarIcon: ({ color }) => <Leaf size={22} strokeWidth={1.7} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <UserRound size={22} strokeWidth={1.7} color={color} /> }} />
    </Tabs>
  );
}
