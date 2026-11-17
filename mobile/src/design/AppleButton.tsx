import React from "react";
import { View } from "react-native";

/** Apple's own "Continue with Apple" button (guideline 4.8, HIG). Apple draws it: no colours or radius of ours. */
export function AppleButton({ onPress, disabled = false, hint }: { onPress: () => void; disabled?: boolean; hint?: string }) {
  // Lazy, as in appleSignIn.ts: the native module exists only on iOS, and this renders only there.
  const { AppleAuthenticationButton, AppleAuthenticationButtonType, AppleAuthenticationButtonStyle } =
    require("expo-apple-authentication") as typeof import("expo-apple-authentication");
  return (
    <View pointerEvents={disabled ? "none" : "auto"} accessibilityState={{ disabled }}>
      <AppleAuthenticationButton
        buttonType={AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={22}
        style={{ height: 44, width: "100%" }}
        accessibilityHint={hint}
        onPress={onPress}
      />
    </View>
  );
}
