import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Copy } from "./ui";
import { ExternalLink } from "./LegalLinks";
import { LEGAL_URLS, termsRuns } from "../domain/legal";
import { colors as c, fonts } from "./tokens";

/**
 * A tick box with its label (GI2; plan 4: "I’m 18 or over and I accept the Terms of Use."): a 24 pt box in a row
 * at least 44 pt tall, the whole row being the checkbox. The sub-label (`children`) sits under it, outside the
 * checkbox, so links in it stay their own buttons for VoiceOver. `hint` says what ticking agrees to, for VoiceOver.
 */
export function TickRow({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
  role = "checkbox",
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
  disabled?: boolean;
  /**
   * "radio" for a row that is one of a group of choices (the Where sheet's places); the tick looks the same.
   * Tapping a chosen radio does nothing.
   */
  role?: "checkbox" | "radio";
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole={role}
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked, disabled }}
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        // A chosen radio stays chosen: another choice in its group replaces it.
        onPress={() => {
          if (role === "radio" && checked) return;
          onChange(!checked);
        }}
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

/**
 * "Read the Terms of Use. Our Privacy Policy explains how we use your data.": each document name is a link to its
 * page (always set, from LEGAL_URLS); a text with no name is plain.
 */
export function TermsLine({ text }: { text: string }) {
  const parsed = termsRuns(text, LEGAL_URLS);
  if (!parsed.some((run) => run.url)) return <Copy style={styles.subText}>{text}</Copy>;
  // Plain words are their own text; a link is its own button. A full stop after the last link stays
  // with it, pulled back over the link's own padding.
  const runs = parsed.map((run) => (run.url ? run : { ...run, text: run.text.trim() })).filter((run) => run.text);
  const tail = runs[runs.length - 1];
  const stop = runs.length > 1 && !tail.url && /^[.,;:!?]+$/.test(tail.text) ? tail.text : null;
  if (stop) runs.pop();
  return (
    <View style={styles.line}>
      {runs.map((run, i) => {
        const node = run.url ? (
          <ExternalLink key={i} title={run.text} url={run.url} />
        ) : (
          <Copy key={i} style={styles.subText}>
            {run.text}
          </Copy>
        );
        return stop && i === runs.length - 1 ? (
          <View key={i} style={styles.attached}>
            {node}
            <Copy style={[styles.subText, styles.stop]}>{stop}</Copy>
          </View>
        ) : (
          node
        );
      })}
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
  attached: { flexDirection: "row", alignItems: "center" },
  // TextAction pads its label by 4 on each side.
  stop: { marginLeft: -4 },
});
