import React, { useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import {
  Search,
  ArrowUpRight,
  SlidersHorizontal,
  LayoutGrid,
  Sparkles,
  Plus,
} from "lucide-react-native";
import {
  Button,
  Copy,
  ErrorNote,
  Title,
  s,
  useLargeText,
} from "../../src/design/ui";
import { colors as c, fonts, depth } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { activityArtwork } from "../../src/services/catalogue";
import { useCatalogue } from "../../src/state/useCatalogue";
import { filterActivities } from "../../src/domain/rules";
import { categoryKeys, categoryLabels, type CategoryKey } from "../../src/domain/categories";
import { CategoryFilterTile, categoryIcons, categoryText } from "../../src/design/categories";
import { useApp } from "../../src/state/AppState";
export default function Create() {
  const largeText = useLargeText();
  const { preview, session } = useApp(),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState<CategoryKey | "all">("all");
  const catalogue = useCatalogue();
  const results = useMemo(
    () => filterActivities(catalogue.items, query, category),
    [catalogue.items, query, category],
  );
  if (!preview && !session) return <Redirect href="/" />;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          !preview ? (
            <RefreshControl
              refreshing={catalogue.loading}
              onRefresh={catalogue.refresh}
              tintColor={c.aquaDark}
            />
          ) : undefined
        }
      >
        <PreviewNotice />
        <View style={{ padding: 24, gap: 20 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
            >
              <Image
                source={require("../../assets/brand/resbite-mark.png")}
                style={{ width: 25, height: 25 }}
              />
              <Copy style={{ fontFamily: fonts.display, fontSize: 23 }}>
                resbite
              </Copy>
            </View>
            <Pressable
              accessibilityLabel="Your profile"
              accessibilityRole="button"
              onPress={() => router.navigate("/profile")}
              style={[
                styles.avatar,
                largeText && {
                  width: undefined,
                  height: undefined,
                  minWidth: 44,
                  minHeight: 44,
                  padding: 10,
                },
              ]}
            >
              <Copy style={{ fontFamily: fonts.bold, color: c.aquaDark }}>
                R
              </Copy>
            </Pressable>
          </View>
          <View style={{ gap: 8 }}>
            <Title>What shall we{"\n"}do together?</Title>
            <Copy style={{ color: c.muted }}>
              Plan anything with your people, or borrow an idea.
            </Copy>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start your own resbite"
            accessibilityHint="Opens a new plan you name yourself"
            onPress={() => router.push("/arrange")}
            style={[
              styles.start,
              largeText && { flexDirection: "column", alignItems: "flex-start" },
            ]}
          >
            <View style={styles.startIcon}>
              <Plus size={24} strokeWidth={2} color="#963F58" />
            </View>
            <View style={{ flex: largeText ? undefined : 1, gap: 4 }}>
              <Title style={{ fontSize: 23, lineHeight: 28 }}>
                Start your own resbite
              </Title>
              <Copy style={{ color: c.ink }}>
                Dinner, a walk, a birthday — anything you’d enjoy together.
              </Copy>
            </View>
          </Pressable>
          <View style={{ gap: 4 }}>
            <Title style={{ fontSize: 23 }}>Or start from an idea</Title>
            <Copy style={{ fontSize: 11, color: c.muted }}>
              {catalogue.loading
                ? "Loading…"
                : catalogue.error
                  ? ""
                  : `${results.length} ideas`}
            </Copy>
          </View>
          <View style={styles.search}>
            <Search size={20} color={c.muted} />
            <TextInput
              accessibilityLabel="Search ideas"
              value={query}
              onChangeText={setQuery}
              placeholder="Search ideas"
              placeholderTextColor={c.muted}
              style={{
                flex: 1,
                fontFamily: fonts.body,
                fontSize: 14,
                color: c.ink,
                paddingVertical: 15,
              }}
            />
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            gap: 9,
            paddingBottom: 19,
          }}
        >
          <CategoryFilterTile
            label="All"
            icon={LayoutGrid}
            selected={category === "all"}
            onPress={() => setCategory("all")}
          />
          {categoryKeys.map((key) => (
            <CategoryFilterTile
              key={key}
              label={categoryLabels[key]}
              icon={categoryIcons[key]}
              selected={category === key}
              onPress={() => setCategory(key)}
            />
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 24, paddingTop: 4, gap: 17 }}>
          {catalogue.loading ? (
            <View style={{ paddingVertical: 30, gap: 14 }}>
              <ActivityIndicator
                accessibilityLabel="Loading activities"
                color={c.aquaDark}
              />
              <Copy>Finding a little inspiration…</Copy>
            </View>
          ) : catalogue.error ? (
            <View style={{ paddingVertical: 20, gap: 14 }}>
              <ErrorNote message={catalogue.error} />
              <Button
                title="Try ideas again"
                onPress={catalogue.refresh}
              />
            </View>
          ) : catalogue.items.length === 0 ? (
            <View style={[s.card, { padding: 22, gap: 14 }]}>
              <Sparkles size={26} color={c.aquaDark} />
              <Title style={{ fontSize: 23 }}>
                A little inspiration is on its way.
              </Title>
              <Copy>No ideas are available yet. You can still start your own.</Copy>
              <Button
                title="Check for ideas"
                onPress={catalogue.refresh}
                secondary
              />
            </View>
          ) : results.length === 0 ? (
            <View style={{ paddingVertical: 30, gap: 14 }}>
              <Copy>No ideas match that search.</Copy>
              <Pressable
                onPress={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                <Copy style={{ color: c.aquaDark, fontFamily: fonts.bold }}>
                  Clear search
                </Copy>
              </Pressable>
            </View>
          ) : (
            <View style={styles.grid}>
              {results.map((a, i) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={a.title}
                  onPress={() =>
                    router.push({
                      pathname: "/activity/[id]",
                      params: { id: a.id },
                    })
                  }
                  style={[styles.card, largeText && { width: "100%" }]}
                >
                  <View
                    style={[
                      styles.art,
                      {
                        backgroundColor: [
                          c.purpleSoft,
                          c.pinkSoft,
                          c.aquaSoft,
                          c.cream,
                        ][i % 4],
                      },
                    ]}
                  >
                    <Image
                      source={activityArtwork(a)}
                      resizeMode="contain"
                      style={{ width: "100%", height: 134 }}
                    />
                    <View style={styles.cardArrow}>
                      <ArrowUpRight size={14} color={c.ink} />
                    </View>
                  </View>
                  <View style={{ padding: 12, gap: 4 }}>
                    <Copy style={{ fontSize: 10, color: c.muted }}>
                      {categoryText(a.categories)}
                    </Copy>
                    <Copy
                      style={{
                        fontFamily: fonts.medium,
                        fontSize: 14,
                        lineHeight: 19,
                      }}
                    >
                      {a.title}
                    </Copy>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          <Copy style={{ fontSize: 11, color: c.muted, marginTop: 8 }}>
            Small plans. More time together.
          </Copy>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.aquaSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 17,
    paddingHorizontal: 15,
  },
  start: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: c.pink,
    boxShadow: depth.button,
  },
  startIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    width: "47.8%",
    boxShadow: depth.card,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: c.paper,
  },
  art: { height: 149, justifyContent: "center" },
  cardArrow: {
    position: "absolute",
    right: 9,
    bottom: 9,
    borderRadius: 15,
    backgroundColor: c.paper,
    padding: 6,
  },
});
