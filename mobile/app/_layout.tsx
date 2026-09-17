import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/state/AppState";
import { colors } from "../src/design/tokens";
import { useReduceMotion } from "../src/design/ui";
void SplashScreen.preventAutoHideAsync().catch(() => {});
export default function Root() {
  const [loaded, error] = useFonts({
    Montserrat: require("../assets/fonts/Montserrat-Regular.ttf"),
    MontserratSemi: require("../assets/fonts/Montserrat-SemiBold.ttf"),
    MontserratBold: require("../assets/fonts/Montserrat-Bold.ttf"),
    Quicksand: require("../assets/fonts/Quicksand-SemiBold.ttf"),
  });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.cream,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.aquaDark} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Navigation />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { session, preview, restoring } = useApp();
  const reduced = useReduceMotion();
  if (restoring)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          backgroundColor: colors.cream,
        }}
      >
        <ActivityIndicator accessibilityLabel="Restoring your session" />
      </View>
    );
  return (
    <Stack
      key={session?.user.id || "signed-out"}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
        animation: reduced ? "fade" : "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="invite" />
      <Stack.Protected guard={Boolean(session) || preview}>
        <Stack.Screen name="discover" />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="arrange" />
        <Stack.Screen name="plans" />
        <Stack.Screen name="wellness" />
        <Stack.Screen name="profile" />
      </Stack.Protected>
    </Stack>
  );
}
