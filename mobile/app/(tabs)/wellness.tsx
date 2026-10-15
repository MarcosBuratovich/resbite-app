import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlaskConical, Info } from "lucide-react-native";
import { Copy, Reveal, Title, s } from "../../src/design/ui";
import { Chip, IconButton, InfoSheet } from "../../src/design/kit";
import { categoryIcons } from "../../src/design/categories";
import { PreviewNotice } from "../../src/design/Chrome";
import { categoryPalette, colors as c, depth, fonts, r } from "../../src/design/tokens";
import { categoryLabels } from "../../src/domain/categories";
import { formatMinutes, wellnessSample } from "../../src/domain/accountCopy";

/**
 * Wellness (UX4-D5): sample data only, clearly labelled. A ring card with the week's total and
 * one card of category bars in each category's tint and ink. The disclaimer sits behind ⓘ.
 */
export default function Wellness() {
  const [about, setAbout] = useState(false);
  const total = formatMinutes(wellnessSample.reduce((sum, row) => sum + row.minutes, 0));
  const most = Math.max(...wellnessSample.map((row) => row.minutes));
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <PreviewNotice />
        <View style={styles.header}>
          <Title>Wellness</Title>
          <IconButton icon={Info} label="About sample data" onPress={() => setAbout(true)} />
        </View>
        <Chip text="Sample data" icon={FlaskConical} tone="pink" label="Sample wellness data" />
        <Reveal>
          <View style={styles.ringCard}>
            <View style={styles.ring}>
              <Text style={styles.total}>{total}</Text>
            </View>
            <Copy style={styles.together}>together this week</Copy>
          </View>
        </Reveal>
        <View style={styles.bars}>
          {wellnessSample.map((row, index) => {
            const Icon = categoryIcons[row.category];
            const { tint, ink } = categoryPalette[row.category];
            return (
              <View key={row.category} style={[styles.bar, index > 0 && styles.divider]}>
                <View style={styles.barTop}>
                  <View style={[styles.barIcon, { backgroundColor: tint }]}>
                    <Icon size={18} strokeWidth={2} color={ink} />
                  </View>
                  <Copy style={styles.barName}>{categoryLabels[row.category]}</Copy>
                  <Copy style={{ color: c.muted }}>{row.minutes} min</Copy>
                </View>
                <View style={[styles.track, { backgroundColor: tint }]}>
                  <View style={[styles.fill, { backgroundColor: ink, width: `${(row.minutes / most) * 100}%` }]} />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <InfoSheet visible={about} title="About sample data" onClose={() => setAbout(false)}>
        <Copy>
          These are example numbers for design review. They do not track your
          activity or measure health.
        </Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  ringCard: { padding: 24, gap: 12, alignItems: "center", borderRadius: r.card, backgroundColor: c.paper, boxShadow: depth.card },
  ring: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 14,
    borderColor: c.aqua,
    alignItems: "center",
    justifyContent: "center",
  },
  total: { fontFamily: fonts.display, fontSize: 30, color: c.ink },
  together: { color: c.muted },
  bars: { borderRadius: r.card, backgroundColor: c.paper, boxShadow: depth.card, paddingHorizontal: 18 },
  bar: { gap: 10, paddingVertical: 16 },
  divider: { borderTopWidth: 1, borderTopColor: c.line },
  barTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  barIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  barName: { flex: 1, fontFamily: fonts.medium },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
});
