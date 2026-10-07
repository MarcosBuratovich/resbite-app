import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/state/AppState";
import { AccountProvider, useAccount } from "../src/state/AccountState";
import { colors } from "../src/design/tokens";
import { Button, Copy, useReduceMotion } from "../src/design/ui";
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
        <AccountProvider>
          <StatusBar style="dark" />
          <Navigation />
        </AccountProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const {
    session,
    preview,
    restoring,
    signingOut,
    signOutError,
    clearSignOutError,
  } = useApp();
  const account = useAccount();
  const path = usePathname();
  const navigationStarted = useRef(false);
  const reduced = useReduceMotion();
  // Account checks can begin while a callback is changing routes. Keep the
  // navigator mounted: removing it based on its own pathname creates native
  // navigation state churn. Protected routes still gate all private screens,
  // and the account screen renders the checking/error/pending states.
  // On a cold start, wait before mounting protected deep links so the router
  // does not discard them. Once mounted, never tear down for an access refresh.
  const waitingForInitialAccess =
    !navigationStarted.current &&
    session &&
    !preview &&
    account.status === "checking" &&
    path !== "/auth" &&
    path !== "/auth/callback" &&
    path !== "/invite";
  if (restoring || waitingForInitialAccess)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          backgroundColor: colors.cream,
        }}
      >
        <ActivityIndicator
          accessibilityLabel={restoring ? "Restoring your session" : "Checking account access"}
        />
      </View>
    );
  navigationStarted.current = true;
  return (
    <View style={{ flex: 1 }}>
      {signOutError && !signingOut && (
        <SafeAreaView
          edges={["top", "left", "right"]}
          style={{ backgroundColor: colors.pinkSoft }}
        >
          <View style={{ padding: 16, gap: 12 }}>
            <Copy accessibilityRole="alert">{signOutError}</Copy>
            <Button
              title="Dismiss sign-out notice"
              secondary
              onPress={clearSignOutError}
            />
          </View>
        </SafeAreaView>
      )}
      <View
        style={{ flex: 1 }}
        pointerEvents={signingOut ? "none" : "auto"}
        accessibilityElementsHidden={signingOut}
        importantForAccessibility={signingOut ? "no-hide-descendants" : "auto"}
      >
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
          <Stack.Screen name="introduction" />
          <Stack.Screen name="invite" />
          <Stack.Screen name="delete-account" />
          <Stack.Protected guard={Boolean(session)}>
            <Stack.Screen name="account" />
            <Stack.Screen name="account-details" />
          </Stack.Protected>
          <Stack.Protected
            guard={
              preview ||
              (Boolean(session) &&
                account.status === "approved" &&
                account.reviewed)
            }
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="activity/[id]" />
            <Stack.Screen name="arrange" />
            <Stack.Screen name="people" />
            <Stack.Screen name="invitations" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="sample-chat" />
            <Stack.Screen name="data-privacy" />
          </Stack.Protected>
        </Stack>
      </View>
      {signingOut && (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: colors.cream,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 16,
          }}
        >
          <ActivityIndicator color={colors.aquaDark} />
          <Copy accessibilityLiveRegion="polite">
            {preview ? "Leaving preview…" : "Signing out…"}
          </Copy>
        </View>
      )}
    </View>
  );
}
