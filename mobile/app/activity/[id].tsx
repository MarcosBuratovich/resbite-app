import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Clock3 } from "lucide-react-native";
import { activityArtwork } from "../../src/services/catalogue";
import { Button, Copy, ErrorNote, Title, Reveal, s, useLargeText } from "../../src/design/ui";
import { Chip, IconButton } from "../../src/design/kit";
import { useCatalogue } from "../../src/state/useCatalogue";
import { useApp } from "../../src/state/AppState";
import { categoryPalette, colors as c, r } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { categoryIcons } from "../../src/design/categories";
import { categoryLabels } from "../../src/domain/categories";

/** Idea detail (spec "Create tab and idea detail"): picture, title, chips, description, numbered tips, "Use idea". */
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { preview } = useApp();
  const largeText = useLargeText();
  const catalogue = useCatalogue(id ?? "");
  const a = catalogue.items[0];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/create"));
  const top = (
    <View style={styles.top}>
      <IconButton icon={ArrowLeft} label="Back" onPress={back} />
      <PreviewNotice />
    </View>
  );
  if (catalogue.loading || catalogue.error || !a)
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          {top}
          <Title>{catalogue.loading ? "Getting your activity…" : "Activity unavailable"}</Title>
          {catalogue.loading ? (
            <ActivityIndicator accessibilityLabel="Loading activity" color={c.aquaDark} />
          ) : (
            <>
              {catalogue.error ? (
                <ErrorNote message={catalogue.error} />
              ) : (
                <Copy>
                  This activity is not available to plan right now. Browse the other ideas, or start your own.
                </Copy>
              )}
              <Button title="Check activity again" onPress={catalogue.refresh} secondary />
              <Button title="Browse ideas" onPress={() => router.replace("/create")} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  const planAction = (
    <View style={[s.actionFooter, largeText && { paddingHorizontal: 0, borderTopWidth: 0 }]}>
      <Button title="Use idea" onPress={() => router.push({ pathname: "/arrange", params: { activity: a.id } })} />
    </View>
  );
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 28 }]}>
        {top}
        <Reveal>
          <View style={[styles.picture, { backgroundColor: categoryPalette[a.categories[0] ?? "community"].tint }]}>
            <Image
              accessibilityLabel={a.title}
              source={activityArtwork(a)}
              style={{ width: "100%", height: 230 }}
              resizeMode="contain"
            />
          </View>
        </Reveal>
        <Title>{a.title}</Title>
        <View style={styles.chips}>
          {a.categories.map((key) => (
            <Chip key={key} text={categoryLabels[key]} icon={categoryIcons[key]} category={key} />
          ))}
          {a.durationMinutes !== null && <Chip icon={Clock3} text={`${a.durationMinutes} minutes`} />}
        </View>
        <Copy>{a.description}</Copy>
        {a.tips.map((tip, i) => (
          <View key={i} style={styles.tip}>
            <View style={styles.tipNumber}>
              <Copy style={{ fontSize: 12, color: c.aquaDark }}>{i + 1}</Copy>
            </View>
            <Copy style={{ flex: 1, fontSize: 14 }}>{tip}</Copy>
          </View>
        ))}
        {preview && <Copy style={s.muted}>Activity content approved for the owner-only beta.</Copy>}
        {largeText && planAction}
      </ScrollView>
      {!largeText && planAction}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  picture: { borderRadius: r.card, alignItems: "center", padding: 20, overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tip: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: r.tile,
    backgroundColor: c.aquaSoft,
  },
  tipNumber: {
    minWidth: 27,
    minHeight: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.paper,
  },
});
