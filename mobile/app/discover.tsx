import React, { useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import {
  Search,
  ArrowUpRight,
  Sun,
  SlidersHorizontal,
} from "lucide-react-native";
import { Copy, Title, Reveal, s } from "../src/design/ui";
import { colors as c, fonts } from "../src/design/tokens";
import { PreviewNotice, BottomNav } from "../src/design/Chrome";
import { activities, artwork, categories } from "../src/services/catalogue";
import { filterActivities } from "../src/domain/rules";
import { useApp } from "../src/state/AppState";
export default function Discover() {
  const { preview, session } = useApp(),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const results = useMemo(
    () => filterActivities(activities, query, category),
    [query, category],
  );
  if (!preview && !session) return <Redirect href="/" />;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <PreviewNotice />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 115 }}
        keyboardShouldPersistTaps="handled"
      >
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
                source={require("../assets/brand/resbite-mark.png")}
                style={{ width: 25, height: 25 }}
              />
              <Copy style={{ fontFamily: fonts.display, fontSize: 23 }}>
                resbite
              </Copy>
            </View>
            <Pressable
              accessibilityLabel="Your profile"
              accessibilityRole="button"
              onPress={() => router.push("/profile")}
              style={styles.avatar}
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
                fontSize: 13,
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
              accessibilityState={{ selected: cat === category }}
              onPress={() => setCategory(cat)}
              style={[
                s.chip,
                { backgroundColor: cat === category ? c.ink : c.cream },
              ]}
            >
              <Copy
                style={{
                  fontSize: 12,
                  fontFamily: fonts.medium,
                  color: cat === category ? "white" : c.ink,
                }}
              >
                {cat}
              </Copy>
            </Pressable>
          ))}
        </ScrollView>
        {!query && category === "All" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explore coffee together"
            onPress={() => router.push("/activity/coffee-together")}
            style={styles.feature}
          >
            <View
              style={{ padding: 22, paddingRight: 0, width: "51%", gap: 10 }}
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
                A catch-up,{"\n"}over a cuppa.
              </Title>
              <View style={styles.smallArrow}>
                <ArrowUpRight size={20} color={c.aquaDark} />
              </View>
            </View>
            <Image
              source={artwork["coffee-together"]}
              style={{
                width: "53%",
                height: 185,
                position: "absolute",
                right: -4,
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
              alignItems: "baseline",
            }}
          >
            <Title style={{ fontSize: 23 }}>Find your next resbite</Title>
            <Copy style={{ fontSize: 11, color: c.muted }}>
              {results.length} ideas
            </Copy>
          </View>
          {results.length === 0 ? (
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
                  style={styles.card}
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
                      source={artwork[a.id]}
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
                        fontFamily: fonts.bold,
                        fontSize: 13,
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
      <BottomNav />
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
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    width: "47.8%",
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
