import { GluestackButton } from "./gluestack";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  useWindowDimensions,
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
  withSpring,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";
import { router } from "expo-router";
import { colors as c, fonts, depth } from "./tokens";
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
export function useLargeText() {
  return useWindowDimensions().fontScale >= 1.4;
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
  const largeText = useLargeText();
  return (
    <Text
      {...props}
      style={[s.copy, style, largeText && { lineHeight: undefined }]}
    >
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
  const largeText = useLargeText();
  return (
    <Text
      accessibilityRole="header"
      style={[
        s.title,
        style?.fontSize
          ? { lineHeight: Math.round(style.fontSize * 1.23) }
          : undefined,
        style,
        largeText && { lineHeight: undefined },
      ]}
    >
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
      <GluestackButton
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        isDisabled={disabled || loading}
        onPress={() => {
          if (Platform.OS !== "web")
            void Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        onPressIn={() =>
          (scale.value = withTiming(policy.pressScale, { duration: 90 }))
        }
        onPressOut={() =>
          (scale.value = reduce
            ? withTiming(1, { duration: 0 })
            : withSpring(1, { damping: 18, stiffness: 260, mass: 0.7 }))
        }
        style={({ pressed }) => [
          s.button,
          secondary && s.secondary,
          (disabled || loading) && { opacity: 0.65, boxShadow: "none" },
          pressed && {
            backgroundColor: secondary ? c.purpleSoft : "#EBA1AC",
            boxShadow: depth.pressed,
          },
        ]}
      >
        <Copy style={s.buttonLabel}>{title}</Copy>
        {loading ? (
          <ActivityIndicator color={c.ink} />
        ) : (
          icon && <ArrowRight size={19} strokeWidth={1.6} color={c.ink} />
        )}
      </GluestackButton>
    </Animated.View>
  );
}
export type Accent = "aqua" | "rose" | "violet" | "amber";
const accents = {
  aqua: { background: c.aquaSoft, foreground: c.aquaDark },
  rose: { background: c.pinkSoft, foreground: "#963F58" },
  violet: { background: c.purpleSoft, foreground: "#665381" },
  amber: { background: "#FFF1D9", foreground: "#805B22" },
};
export function IconBadge({
  icon: Icon,
  tone = "aqua",
}: {
  icon: LucideIcon;
  tone?: Accent;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 36,
        height: 36,
        borderRadius: 11,
        backgroundColor: accents[tone].background,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.85)",
        boxShadow: depth.small,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={20} strokeWidth={1.7} color={accents[tone].foreground} />
    </View>
  );
}
export function ActionGroup({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={[s.card, { paddingHorizontal: 14, paddingVertical: 4, gap: 2 }]}
    >
      {children}
    </View>
  );
}
export function ActionRow({
  title,
  description,
  icon: Icon,
  tone = "aqua",
  onPress,
  disabled = false,
  loading = false,
  destructive = false,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  tone?: Accent;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
}) {
  return (
    <GluestackButton
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      isDisabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        paddingVertical: 9,
        gap: 12,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 10,
        backgroundColor: pressed ? c.cream : "transparent",
        opacity: disabled || loading ? 0.55 : 1,
      })}
    >
      <IconBadge icon={Icon} tone={destructive ? "rose" : tone} />
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontSize: 14, color: destructive ? c.error : c.ink }}>
          {title}
        </Copy>
        {description && (
          <Copy style={{ fontSize: 12, color: c.muted }}>{description}</Copy>
        )}
      </View>
      {loading ? (
        <ActivityIndicator color={c.aquaDark} />
      ) : (
        <ChevronRight size={16} color={c.muted} />
      )}
    </GluestackButton>
  );
}
export function TextAction({
  title,
  onPress,
  disabled = false,
  destructive = false,
  icon: Icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <GluestackButton
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      isDisabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
      })}
    >
      {Icon && <Icon size={17} color={destructive ? c.error : c.aquaDark} />}
      <Copy
        style={{
          fontSize: 13,
          flexShrink: 1,
          color: destructive ? c.error : c.aquaDark,
        }}
      >
        {title}
      </Copy>
    </GluestackButton>
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
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: c.pink,
    borderWidth: 1,
    borderColor: "#F8CBD0",
    boxShadow: depth.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondary: {
    backgroundColor: c.paper,
    borderColor: "#E5DBE9",
    boxShadow: depth.small,
  },
  buttonLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  field: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  page: { flex: 1, backgroundColor: "#FAF9F7" },
  actionFooter: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: 1,
    borderColor: c.line,
    backgroundColor: c.paper,
  },
  body: { padding: 20, gap: 16, paddingBottom: 115 },
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    boxShadow: depth.card,
  },
});
