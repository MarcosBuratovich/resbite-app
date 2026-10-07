import React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Copy,
  Title,
  Reveal,
  IconBadge,
  s,
  useLargeText,
} from "../../src/design/ui";
import { colors as c } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { Palette, Mountain, Coffee, Heart } from "lucide-react-native";
export default function Wellness() {
  const largeText = useLargeText();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <PreviewNotice />
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <IconBadge icon={Heart} />
              <Copy>This week · sample</Copy>
            </View>
            <Title style={{ fontSize: largeText ? 32 : 48, lineHeight: 58 }}>
              2h 30m
            </Title>
            <Copy>of getting together</Copy>
          </View>
        </Reveal>
        <Title style={{ fontSize: 24 }}>A little of everything.</Title>
        {[
          {
            name: "Creative",
            icon: Palette,
            tone: "rose" as const,
            minutes: 60,
            color: c.pink,
            width: 80,
          },
          {
            name: "Adventure",
            icon: Mountain,
            tone: "aqua" as const,
            minutes: 60,
            color: c.aqua,
            width: 80,
          },
          {
            name: "Meals & Drinks",
            icon: Coffee,
            tone: "violet" as const,
            minutes: 30,
            color: c.purple,
            width: 40,
          },
        ].map((row) => (
          <View key={row.name} style={[s.card, { gap: 12, padding: 16 }]}>
            <View
              style={{
                flexDirection: largeText ? "column" : "row",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 1,
                }}
              >
                <IconBadge icon={row.icon} tone={row.tone} />
                <Copy style={{ flexShrink: 1 }}>{row.name}</Copy>
              </View>
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
    </SafeAreaView>
  );
}
