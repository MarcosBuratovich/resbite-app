import React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Copy, Title, Reveal, s } from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
import { BottomNav, PreviewNotice } from "../src/design/Chrome";
export default function Wellness() {
  return (
    <SafeAreaView style={s.page}>
      <PreviewNotice />
      <ScrollView contentContainerStyle={s.body}>
        <Copy style={{ color: c.aquaDark }}>A LITTLE MORE BALANCE</Copy>
        <Title>Time for what feels good.</Title>
        <View style={[s.card, { padding: 16, backgroundColor: c.pinkSoft }]}>
          <Copy>Sample dashboard</Copy>
          <Copy style={s.muted}>
            These are example numbers for design review. They do not track your
            activity or measure health.
          </Copy>
        </View>
        <Reveal>
          <View
            style={[
              s.card,
              { padding: 26, gap: 10, backgroundColor: c.aquaSoft },
            ]}
          >
            <Copy>This week · sample</Copy>
            <Title style={{ fontSize: 48, lineHeight: 58 }}>2h 30m</Title>
            <Copy>of getting together</Copy>
          </View>
        </Reveal>
        <Title style={{ fontSize: 24 }}>A little of everything.</Title>
        {[
          { name: "Creative", minutes: 60, color: c.pink, width: 80 },
          { name: "Adventure", minutes: 60, color: c.aqua, width: 80 },
          { name: "Meals & Drinks", minutes: 30, color: c.purple, width: 40 },
        ].map((row) => (
          <View key={row.name} style={{ gap: 10 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Copy>{row.name}</Copy>
              <Copy>{row.minutes} min</Copy>
            </View>
            <View
              style={{ height: 12, borderRadius: 6, backgroundColor: c.cream }}
            >
              <View
                style={{
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: row.color,
                  width: `${row.width}%`,
                }}
              />
            </View>
          </View>
        ))}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}
