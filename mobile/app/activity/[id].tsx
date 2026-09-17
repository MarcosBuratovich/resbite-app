import React from "react";
import { Image, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { activities, artwork } from "../../src/services/catalogue";
import { Back, Button, Copy, Title, Reveal, s } from "../../src/design/ui";
import { colors as c } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    a = activities.find((x) => x.id === id);
  if (!a)
    return (
      <SafeAreaView style={s.page}>
        <Back />
        <Copy>Activity unavailable.</Copy>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.page}>
      <PreviewNotice />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 36 }]}>
        <Back label="Discover" />
        <Reveal>
          <View
            style={{
              backgroundColor: c.cream,
              borderRadius: 30,
              alignItems: "center",
              padding: 20,
            }}
          >
            <Image
              accessibilityLabel={a.title}
              source={artwork[a.id]}
              style={{ width: "100%", height: 250 }}
              resizeMode="contain"
            />
          </View>
        </Reveal>
        <Copy style={{ color: c.aquaDark }}>
          {a.category}
          {a.durationMinutes ? ` · ${a.durationMinutes} minutes` : ""}
        </Copy>
        <Title>{a.title}</Title>
        <Copy>{a.description}</Copy>
        <View
          style={[
            s.card,
            { padding: 20, gap: 14, backgroundColor: c.aquaSoft },
          ]}
        >
          <Title style={{ fontSize: 22, lineHeight: 28 }}>
            Make it your own
          </Title>
          {a.tips.map((tip, i) => (
            <Copy key={i}>
              {i + 1}. {tip}
            </Copy>
          ))}
        </View>
        <Copy style={s.muted}>Activity wording is a draft for review.</Copy>
        <Button
          title="Let’s make a plan"
          onPress={() =>
            router.push({ pathname: "/arrange", params: { activity: a.id } })
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}
