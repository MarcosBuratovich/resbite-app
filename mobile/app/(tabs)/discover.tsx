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
  Sun,
  SlidersHorizontal,
  LayoutGrid,
  Palette,
  Mountain,
  Coffee,
  Leaf,
  Sparkles,
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
import { useApp } from "../../src/state/AppState";
export default function Discover() {
  const largeText = useLargeText();
  const { preview, session } = useApp(),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const catalogue = useCatalogue();
  const categories = [
    "All",
    ...new Set(catalogue.items.map((item) => item.category)),
  ];
  const selectedCategory = categories.includes(category) ? category : "All";
  const featured = catalogue.items.find(
    (item) => item.id === "coffee-together",
  );
  const results = useMemo(
    () => filterActivities(catalogue.items, query, selectedCategory),
    [catalogue.items, query, selectedCategory],
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
            <Title>Make room for{"\n"}a good time.</Title>
            <Copy style={{ color: c.muted }}>
              A little inspiration for your next get-together.
            </Copy>
          </View>
          <View style={styles.search}>
            <Search size={20} color={c.muted} />
            <TextInput
              accessibilityLabel="Search activities"
              value={query}
              onChangeText={setQuery}
              placeholder="What would you like to do?"
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
          {categories.map((cat) => (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityState={{ selected: cat === selectedCategory }}
              onPress={() => setCategory(cat)}
              style={[
                {
                  minHeight: 64,
                  minWidth: 76,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: cat === selectedCategory ? c.aquaDark : c.line,
                  backgroundColor:
                    cat === selectedCategory ? c.aquaSoft : c.paper,
                },
              ]}
            >
              {React.createElement(
                (
                  {
                    All: LayoutGrid,
                    Creative: Palette,
                    Adventure: Mountain,
                    "Meals & Drinks": Coffee,
                    Wellness: Leaf,
                  } as Record<string, typeof Sun>
                )[cat] || Sparkles,
                {
                  size: 20,
                  strokeWidth: 1.7,
                  color: cat === selectedCategory ? c.aquaDark : "#665381",
                },
              )}
              <Copy
                style={{
                  fontSize: 12,
                  fontFamily: fonts.body,
                  color: cat === selectedCategory ? c.aquaDark : c.ink,
                }}
              >
                {cat}
              </Copy>
            </Pressable>
          ))}
        </ScrollView>
        {!query && selectedCategory === "All" && featured && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Explore ${featured.title.toLowerCase()}`}
            onPress={() =>
              router.push({
                pathname: "/activity/[id]",
                params: { id: featured.id },
              })
            }
            style={styles.feature}
          >
            <View
              style={{
                padding: 22,
                paddingRight: largeText ? 22 : 0,
                width: largeText ? "100%" : "51%",
                gap: 10,
              }}
            >
              <Copy
                style={{
                  fontSize: 11,
                  color: c.aquaDark,
                  fontFamily: fonts.bold,
                }}
              >
                Better together
              </Copy>
              <Title style={{ fontSize: 26, lineHeight: 31 }}>
                {preview ? "A catch-up,\nover a cuppa." : featured.title}
              </Title>
              <View style={styles.smallArrow}>
                <ArrowUpRight size={20} color={c.aquaDark} />
              </View>
            </View>
            <Image
              source={activityArtwork(featured)}
              style={{
                width: largeText ? "100%" : "53%",
                height: 185,
                position: largeText ? "relative" : "absolute",
                right: largeText ? 0 : -4,
                bottom: 0,
              }}
              resizeMode="contain"
            />
          </Pressable>
        )}
        <View style={{ paddingHorizontal: 24, paddingTop: 23, gap: 17 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: largeText ? "stretch" : "baseline",
              flexWrap: "wrap",
              gap: 8,
              ...(largeText && { flexDirection: "column" }),
            }}
          >
            <Title style={{ fontSize: 23 }}>Find your next resbite</Title>
            <Copy style={{ fontSize: 11, color: c.muted }}>
              {catalogue.loading
                ? "Loading…"
                : catalogue.error
                  ? ""
                  : `${results.length} ideas`}
            </Copy>
          </View>
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
                title="Try activities again"
                onPress={catalogue.refresh}
              />
            </View>
          ) : catalogue.items.length === 0 ? (
            <View style={[s.card, { padding: 22, gap: 14 }]}>
              <Sparkles size={26} color={c.aquaDark} />
              <Title style={{ fontSize: 23 }}>
                A little inspiration is on its way.
              </Title>
              <Copy>No activities are available yet. Check again soon.</Copy>
              <Button
                title="Check for activities"
                onPress={catalogue.refresh}
                secondary
              />
            </View>
          ) : results.length === 0 ? (
            <View style={{ paddingVertical: 30, gap: 14 }}>
              <Copy>No activities match that search.</Copy>
              <Pressable
                onPress={() => {
                  setQuery("");
                  setCategory("All");
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
                      {a.category}
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
  feature: {
    marginHorizontal: 24,
    minHeight: 198,
    boxShadow: depth.card,
    backgroundColor: c.aquaSoft,
    borderRadius: 25,
    overflow: "hidden",
  },
  smallArrow: {
    height: 33,
    width: 33,
    borderRadius: 18,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    boxShadow: depth.small,
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
