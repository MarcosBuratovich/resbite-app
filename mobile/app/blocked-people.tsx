import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Back, Button, Copy, ErrorNote, TextAction, Title, s, useLargeText } from "../src/design/ui";
import { PreviewNotice } from "../src/design/Chrome";
import { colors as c, depth, fonts, r, space } from "../src/design/tokens";
import { EVENT_COPY } from "../src/domain/eventPage";
import { PLAN_COPY } from "../src/domain/planCopy";
import { SAFETY_COPY } from "../src/domain/safetyCopy";
import type { BlockedRow } from "../src/state/blockedPeople";
import { useBlockedPeople } from "../src/state/useBlockedPeople";

/**
 * Blocked people (G-S10), from Data & privacy: the people the reader blocked, newest first, by name (cleaned as the chat
 * cleans a name, "Someone" when none is left), each with "Unblock <name>", which acts at once, so a chat open beneath
 * hears it (B3). With nobody, `noneBlocked`. A failed read says why with Try again, and names nobody. A failed unblock
 * keeps the row and says why beside it.
 */
export default function BlockedPeople() {
  const k = useBlockedPeople();
  const v = k.view;
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice />
        <Back label="Privacy" />
        <Title>{SAFETY_COPY.blockedPeople}</Title>
        {v.kind === "loading" ? <ActivityIndicator accessibilityLabel={PLAN_COPY.loading} color={c.aquaDark} /> : null}
        {v.kind === "failed" ? (
          <View style={styles.failed}>
            <ErrorNote message={v.message} />
            <Button icon={false} secondary title={EVENT_COPY.tryAgain} loading={v.retrying} onPress={() => void k.load()} />
          </View>
        ) : null}
        {v.kind === "none" ? <Copy>{SAFETY_COPY.noneBlocked}</Copy> : null}
        {v.kind === "list" ? (
          <View style={styles.card}>
            {v.rows.map((row, i) => (
              <React.Fragment key={row.userId}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <Person row={row} onUnblock={() => void k.unblock(row.userId)} />
              </React.Fragment>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One blocked person: the name, Unblock beside it (under it with Larger Text), and why an unblock failed. */
function Person({ row, onUnblock }: { row: BlockedRow; onUnblock: () => void }) {
  const largeText = useLargeText();
  return (
    <View style={styles.person}>
      <View style={[styles.line, largeText && styles.stacked]}>
        <Text style={[styles.name, largeText && styles.free]}>{row.name}</Text>
        <TextAction title={row.action} busy={row.busy} disabled={row.disabled} onPress={onUnblock} />
      </View>
      <ErrorNote message={row.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  failed: { gap: space.m, alignItems: "flex-start" },
  card: { borderRadius: r.card, backgroundColor: c.paper, boxShadow: depth.card, paddingVertical: 4 },
  divider: { height: 1, backgroundColor: c.line, marginHorizontal: 18 },
  person: { paddingHorizontal: 18, paddingVertical: 8, gap: space.xs },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.m, minHeight: 44 },
  stacked: { flexDirection: "column", alignItems: "flex-start", gap: 0 },
  // minWidth 0: on the web a long name would otherwise keep its full width and push Unblock off the card.
  name: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: c.ink },
  free: { flex: 0, lineHeight: undefined },
});
