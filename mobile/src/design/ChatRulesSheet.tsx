import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Copy, ErrorNote, TextAction } from "./ui";
import { focusHeading } from "./kit";
import { colors as c, fonts, space } from "./tokens";
import { CHAT_COPY } from "../domain/chatCopy";
import { SAFETY_COPY } from "../domain/safetyCopy";

/**
 * The chat rules (G-B4(d), challenge I6), drawn inside the sheet that asks: before a first message or announcement, and
 * after a send the server refused for them. "Chat rules", the line saying what waits for them when the sheet follows a
 * refusal (`held`), the rules, the line saying I agree didn't go through (`error`), then I agree and Cancel. I agree is
 * busy while its call runs, so a second tap sends nothing more.
 */
export function ChatRulesSheet({
  onAgree,
  onCancel,
  held,
  error,
}: {
  onAgree: () => Promise<unknown> | void;
  onCancel: () => void;
  /** What waits: "Your message hasn’t been sent…" or "Your announcement hasn’t been sent…"; none before a first send. */
  held?: string | null;
  /** `rulesNotSaved` once an I agree failed; I agree can be tapped again. */
  error?: string | null;
}) {
  const [agreeing, setAgreeing] = useState(false);
  const mounted = useRef(true);
  const title = useRef<Text | null>(null);
  useEffect(() => {
    mounted.current = true;
    const frame = requestAnimationFrame(() => focusHeading(title.current));
    return () => {
      mounted.current = false;
      cancelAnimationFrame(frame);
    };
  }, []);
  const agree = async () => {
    if (agreeing) return;
    setAgreeing(true);
    try {
      await onAgree();
    } finally {
      if (mounted.current) setAgreeing(false);
    }
  };
  return (
    <View style={styles.block}>
      <Text ref={title} accessibilityRole="header" style={styles.title}>
        {SAFETY_COPY.rulesTitle}
      </Text>
      {held ? <Copy style={styles.held}>{held}</Copy> : null}
      <Copy>{SAFETY_COPY.rules}</Copy>
      <ErrorNote message={error ?? null} />
      <Button icon={false} title={SAFETY_COPY.agree} loading={agreeing} disabled={agreeing} onPress={() => void agree()} />
      <View style={styles.centre}>
        <TextAction title={CHAT_COPY.cancel} disabled={agreeing} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.m },
  title: { fontFamily: fonts.display, fontSize: 24, color: c.ink },
  held: { fontFamily: fonts.medium },
  centre: { alignItems: "center" },
});
