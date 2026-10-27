import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { colors as c, fonts } from "./tokens";

/**
 * One text field shown as six cells: the field lies over the cells with its own text transparent, so typing,
 * pasting, the one-time-code suggestion and VoiceOver all use the real field.
 */
export function CodeField({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, 5);
  return (
    <View style={styles.code}>
      <View aria-hidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.cells}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={[styles.cell, focused && i === active && styles.cellActive]}>
            <Text style={styles.digit}>{value[i] ?? ""}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        accessibilityLabel="6-digit code"
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus
        maxLength={6}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        selectionColor="transparent"
        style={[StyleSheet.absoluteFill, styles.codeInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  code: { position: "relative" },
  cells: { flexDirection: "row", gap: 8 },
  cell: {
    flex: 1,
    maxWidth: 52,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: { borderColor: c.aquaDark, borderWidth: 2 },
  digit: { fontFamily: fonts.display, fontSize: 24, color: c.ink },
  codeInput: {
    color: "transparent",
    backgroundColor: "transparent",
    borderWidth: 0,
    fontSize: 24,
    ...(Platform.OS === "web" ? { outlineStyle: "solid" as const, outlineWidth: 0 } : null),
  },
});
