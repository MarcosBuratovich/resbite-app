import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Back, Button, Copy, ErrorNote, TextAction, Title, s, useLargeText } from "../src/design/ui";
import { STEP_SETTLED_MS, focusHeading } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { colors as c, depth, fonts, r, space } from "../src/design/tokens";
import { EVENT_COPY } from "../src/domain/eventPage";
import { PLAN_COPY } from "../src/domain/planCopy";
import { SAFETY_COPY } from "../src/domain/safetyCopy";
import type { AfterUnblock, BlockedRow } from "../src/state/blockedPeople";
import { useBlockedPeople } from "../src/state/useBlockedPeople";

/**
 * Blocked people (G-S10), from Data & privacy: the people the reader blocked, newest first, by name (cleaned as the chat
 * cleans a name, "Someone" when none is left), each with Unblock (spoken "Unblock <name>"), which acts at once, so a chat
 * open beneath hears it (B3). Once it went through, "Unblocked <name>." is said and focus moves to the next row, or to
 * the empty line (ruling SR4). With nobody, `noneBlocked`. A failed read says why with Try again, and names nobody. A
 * failed unblock keeps the row and says why beside it.
 */
export default function BlockedPeople() {
  const k = useBlockedPeople();
  const v = k.view;
  const names = useRef(new Map<string, Text>());
  const empty = useRef<Text>(null);
  const after = v.kind === "list" || v.kind === "none" ? v.after : null;
  useMoveOn(after, (id) => (id === null ? empty.current : (names.current.get(id) ?? null)));
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice />
        <Back label="Privacy" />
        <Title>{SAFETY_COPY.blockedPeople}</Title>
        {after ? (
          <Copy accessibilityLiveRegion="polite" style={styles.notice}>
            {after.notice}
          </Copy>
        ) : null}
        {v.kind === "loading" ? <ActivityIndicator accessibilityLabel={PLAN_COPY.loading} color={c.aquaDark} /> : null}
        {v.kind === "failed" ? (
          <View style={styles.failed}>
            <ErrorNote message={v.message} />
            <Button icon={false} secondary title={EVENT_COPY.tryAgain} loading={v.retrying} onPress={() => void k.load()} />
          </View>
        ) : null}
        {v.kind === "none" ? <Copy ref={empty}>{SAFETY_COPY.noneBlocked}</Copy> : null}
        {v.kind === "list" ? (
          <View style={styles.card}>
            {v.rows.map((row, i) => (
              <React.Fragment key={row.userId}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <Person
                  row={row}
                  nameRef={(el) => {
                    if (el) names.current.set(row.userId, el);
                    else names.current.delete(row.userId);
                  }}
                  onUnblock={() => void k.unblock(row.userId)}
                />
              </React.Fragment>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Once per unblock that went through: focus to the row that took its place (or the empty line), as the steps move focus
 * (`focusHeading`, after a frame on the web and once settled on the phone); and on iPhone "Unblocked <name>." is said
 * after it, since VoiceOver ignores the live region that TalkBack and the web read.
 */
function useMoveOn(after: AfterUnblock | null, target: (focus: string | null) => Text | null) {
  const latest = useRef({ after, target });
  latest.current = { after, target };
  const seq = after?.seq ?? null;
  useEffect(() => {
    const now = latest.current.after;
    if (seq === null || !now) return;
    const web = Platform.OS === "web";
    const move = () => focusHeading(latest.current.target(now.focus));
    const frame = web ? requestAnimationFrame(move) : undefined;
    const settled = web ? undefined : setTimeout(move, STEP_SETTLED_MS);
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibilityWithOptions(now.notice, { queue: true });
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [seq]);
}

/**
 * One blocked person: the name, wrapping to as many lines as it needs (a single long word breaks inside the card), and
 * Unblock beside it (under it with Larger Text); then why an unblock failed.
 */
function Person({ row, nameRef, onUnblock }: { row: BlockedRow; nameRef: (el: Text | null) => void; onUnblock: () => void }) {
  const largeText = useLargeText();
  return (
    <View style={styles.person}>
      <View style={[styles.line, largeText && styles.stacked]}>
        <Text ref={nameRef} style={[styles.name, largeText && styles.nameStacked]}>
          {row.name}
        </Text>
        <TextAction title={row.action} label={row.label} busy={row.busy} disabled={row.disabled} onPress={onUnblock} />
      </View>
      <ErrorNote message={row.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { color: c.aquaDark },
  failed: { gap: space.m, alignItems: "flex-start" },
  card: { borderRadius: r.card, backgroundColor: c.paper, boxShadow: depth.card, paddingVertical: 4 },
  divider: { height: 1, backgroundColor: c.line, marginHorizontal: 18 },
  person: { paddingHorizontal: 18, paddingVertical: 8, gap: space.xs },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.m, minHeight: 44 },
  stacked: { flexDirection: "column", alignItems: "flex-start", gap: 0 },
  // The name takes the room Unblock leaves (minWidth 0, so on the web a long word can't widen it past the card), and
  // a word longer than the line breaks inside it.
  name: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: c.ink },
  // Stacked, the name spans the card, so it wraps there rather than at its own width.
  nameStacked: { flex: 0, alignSelf: "stretch", lineHeight: undefined },
});
