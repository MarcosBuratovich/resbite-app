import React from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Copy, TextAction } from "./ui";
import { colors as c, fonts } from "./tokens";

/**
 * A tick box with its label (GI2: "I’m 18 or over"): a 24 pt box in a row at least 44 pt tall, the whole
 * row being the checkbox. The sub-label (`children`) sits under it, outside the checkbox, so links in it stay
 * their own buttons for VoiceOver. `hint` says what ticking agrees to, for VoiceOver.
 */
export function TickRow({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked, disabled }}
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => onChange(!checked)}
        style={({ pressed }) => [styles.row, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked ? <Check size={16} strokeWidth={3} color={c.paper} /> : null}
        </View>
        <Copy style={styles.label}>{label}</Copy>
      </Pressable>
      {children ? <View style={styles.sub}>{children}</View> : null}
    </View>
  );
}

const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL;
const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL;

/**
 * "I agree to the Terms and Privacy Policy." with "Terms" and "Privacy Policy" opening their documents when
 * EXPO_PUBLIC_TERMS_URL and EXPO_PUBLIC_PRIVACY_URL are set; plain words otherwise.
 */
export function TermsLine({ text }: { text: string }) {
  const [before, rest = ""] = text.split("Terms");
  const [between, after = ""] = rest.split("Privacy Policy");
  if ((!termsUrl && !privacyUrl) || !rest) return <Copy style={styles.subText}>{text}</Copy>;
  const word = (title: string, url: string | undefined) =>
    url ? (
      <TextAction title={title} onPress={() => void Linking.openURL(url).catch(() => {})} />
    ) : (
      <Copy style={styles.subText}>{title}</Copy>
    );
  return (
    <View style={styles.line}>
      <Copy style={styles.subText}>{before.trim()}</Copy>
      {word("Terms", termsUrl)}
      <Copy style={styles.subText}>{between.trim()}</Copy>
      {word("Privacy Policy", privacyUrl)}
      {after ? <Copy style={styles.subText}>{after.trim()}</Copy> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "flex-start" },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: c.aquaDark,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: c.aquaDark },
  label: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 16 },
  sub: { paddingLeft: 36 },
  subText: { color: c.muted, fontSize: 14 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 },
});
