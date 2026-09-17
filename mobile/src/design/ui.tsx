import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Pressable,
  Text,
  View,
  StyleSheet,
  TextInput,
  Platform,
  type TextStyle,
  type ViewStyle,
  type TextInputProps,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ArrowLeft, ArrowRight, AlertCircle } from "lucide-react-native";
import { router } from "expo-router";
import { colors as c, fonts } from "./tokens";
import { motionPolicy } from "../domain/rules";
export function useReduceMotion() {
  const [reduce, set] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(set);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", set);
    return () => sub.remove();
  }, []);
  return reduce;
}
export function Copy({
  children,
  style,
  ...props
}: {
  children?: React.ReactNode;
  style?: TextStyle | TextStyle[];
  [key: string]: any;
}) {
  return (
    <Text {...props} style={[s.copy, style]}>
      {children}
    </Text>
  );
}
export function Title({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  return (
    <Text accessibilityRole="header" style={[s.title, style]}>
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  loading = false,
  secondary = false,
  disabled = false,
  icon = true,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  secondary?: boolean;
  disabled?: boolean;
  icon?: boolean;
}) {
  const reduce = useReduceMotion(),
    scale = useSharedValue(1),
    policy = motionPolicy(reduce);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={anim}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        disabled={disabled || loading}
        onPress={() => {
          if (Platform.OS !== "web") void Haptics.selectionAsync();
          onPress();
        }}
        onPressIn={() =>
          (scale.value = withTiming(policy.pressScale, { duration: 90 }))
        }
        onPressOut={() =>
          (scale.value = withTiming(1, { duration: policy.duration }))
        }
        style={[
          s.button,
          secondary && s.secondary,
          (disabled || loading) && { opacity: 0.65 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={c.ink} />
        ) : (
          <>
            <Copy style={{ fontFamily: fonts.bold, fontSize: 15 }}>
              {title}
            </Copy>
            {icon && <ArrowRight size={19} color={c.ink} />}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Copy style={{ fontFamily: fonts.medium, fontSize: 13 }}>{label}</Copy>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#99929F"
        {...props}
        style={[s.field, props.style]}
      />
    </View>
  );
}
export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <View accessibilityRole="alert" style={s.error}>
      <AlertCircle size={18} color={c.error} />
      <Copy style={{ color: c.error, flex: 1, fontSize: 13 }}>{message}</Copy>
    </View>
  ) : null;
}
export function Back({ label = "Back" }: { label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={s.back}
    >
      <ArrowLeft size={22} color={c.ink} />
      <Copy style={{ fontSize: 13 }}>{label}</Copy>
    </Pressable>
  );
}
export function Reveal({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const reduce = useReduceMotion();
  return (
    <Animated.View
      entering={FadeIn.duration(reduce ? 120 : 240)}
      exiting={FadeOut.duration(100)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
export const s = StyleSheet.create({
  copy: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: c.ink },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 39,
    color: c.ink,
  },
  button: {
    minHeight: 56,
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: 19,
    backgroundColor: c.aqua,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondary: { backgroundColor: c.paper, borderWidth: 1, borderColor: c.line },
  field: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: c.ink,
    backgroundColor: c.paper,
  },
  error: {
    backgroundColor: c.pinkSoft,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    gap: 10,
  },
  back: {
    alignSelf: "flex-start",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  page: { flex: 1, backgroundColor: c.paper },
  body: { padding: 24, gap: 22, paddingBottom: 115 },
  chip: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: c.cream,
  },
  divider: { height: 1, backgroundColor: c.line },
  muted: { color: c.muted, fontSize: 13 },
  card: {
    backgroundColor: c.paper,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: c.line,
    overflow: "hidden",
  },
});
