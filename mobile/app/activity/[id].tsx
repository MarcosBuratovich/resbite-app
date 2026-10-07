import React from "react";
import { ActivityIndicator, Image, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { activityArtwork } from "../../src/services/catalogue";
import {
  Back,
  Button,
  Copy,
  ErrorNote,
  Title,
  Reveal,
  s,
  useLargeText,
} from "../../src/design/ui";
import { useCatalogue } from "../../src/state/useCatalogue";
import { useApp } from "../../src/state/AppState";
import { colors as c } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { Clock3, Sparkles } from "lucide-react-native";
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { preview } = useApp();
  const largeText = useLargeText();
  const catalogue = useCatalogue(id ?? "");
  const a = catalogue.items[0];
  if (catalogue.loading || catalogue.error || !a)
    return (
      <SafeAreaView style={s.page}>
        <PreviewNotice />
        <ScrollView contentContainerStyle={s.body}>
          <Back label="Discover" />
          <Title>
            {catalogue.loading
              ? "Getting your activity…"
              : "Activity unavailable"}
          </Title>
          {catalogue.loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading activity"
              color={c.aquaDark}
            />
          ) : (
            <>
              {catalogue.error ? (
                <ErrorNote message={catalogue.error} />
              ) : (
                <Copy>
                  This activity is not available to plan right now. Explore the
                  catalogue for another idea.
                </Copy>
              )}
              <Button
                title="Check activity again"
                onPress={catalogue.refresh}
                secondary
              />
              <Button
                title="Explore activities"
                onPress={() => router.replace("/discover")}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  const planAction = (
    <View style={s.actionFooter}>
      <Button
        title="Let’s make a plan"
        onPress={() =>
          router.push({ pathname: "/arrange", params: { activity: a.id } })
        }
      />
      <Copy style={{ ...s.muted, fontSize: 11, textAlign: "center" }}>
        Choose a time and place next
      </Copy>
    </View>
  );
  return (
    <SafeAreaView style={s.page}>
      <PreviewNotice />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 28 }]}>
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
              source={activityArtwork(a)}
              style={{ width: "100%", height: 230 }}
              resizeMode="contain"
            />
          </View>
        </Reveal>
        <View style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: c.aquaSoft,
                paddingHorizontal: 13,
                paddingVertical: 6,
                borderRadius: 18,
              }}
            >
              <Copy style={{ color: c.aquaDark, fontSize: 12 }}>
                {a.category}
              </Copy>
            </View>
            {a.durationMinutes !== null && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Clock3 size={15} color={c.muted} />
                <Copy style={s.muted}>{a.durationMinutes} minutes</Copy>
              </View>
            )}
          </View>
          <Title>{a.title}</Title>
          <Copy>{a.description}</Copy>
        </View>
        {a.tips.length > 0 && (
          <View
            style={[
              s.card,
              { padding: 20, gap: 14, backgroundColor: c.aquaSoft },
            ]}
          >
            <View
              style={{ flexDirection: "row", gap: 9, alignItems: "center" }}
            >
              <Sparkles size={19} color={c.aquaDark} />
              <Title style={{ fontSize: 22, lineHeight: 28, flexShrink: 1 }}>
                Make it your own
              </Title>
            </View>
            {a.tips.map((tip, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <View
                  style={{
                    minWidth: 27,
                    minHeight: 27,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.paper,
                  }}
                >
                  <Copy style={{ fontSize: 12, color: c.aquaDark }}>
                    {i + 1}
                  </Copy>
                </View>
                <Copy style={{ flex: 1, fontSize: 14 }}>{tip}</Copy>
              </View>
            ))}
          </View>
        )}
        {preview && (
          <Copy style={s.muted}>
            Activity content approved for the owner-only beta.
          </Copy>
        )}
        {largeText && planAction}
      </ScrollView>
      {!largeText && planAction}
    </SafeAreaView>
  );
}
