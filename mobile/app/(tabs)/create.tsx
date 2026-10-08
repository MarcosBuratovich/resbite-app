import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { LayoutGrid, Plus, Search, Sparkles, UserRound, X } from "lucide-react-native";
import { Button, Copy, ErrorNote, Title, s, useLargeText } from "../../src/design/ui";
import { Chip, IconButton, Tile } from "../../src/design/kit";
import { categoryPalette, colors as c, depth, fonts, r } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { activityArtwork } from "../../src/services/catalogue";
import { useCatalogue } from "../../src/state/useCatalogue";
import { filterActivities } from "../../src/domain/rules";
import { categoryKeys, categoryLabels, type CategoryKey } from "../../src/domain/categories";
import { categoryIcons } from "../../src/design/categories";
import { useApp } from "../../src/state/AppState";

/** The Create tab (spec "Create tab and idea detail"): start from scratch, or pick an idea. */
export default function Create() {
  const largeText = useLargeText();
  const { preview, session } = useApp(),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState<CategoryKey | "all">("all"),
    [searching, setSearching] = useState(false);
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
            <RefreshControl refreshing={catalogue.loading} onRefresh={catalogue.refresh} tintColor={c.aquaDark} />
          ) : undefined
        }
      >
        <View style={styles.top}>
          <View style={styles.header}>
            <Title>Create</Title>
            <View style={styles.headerActions}>
              <IconButton
                icon={searching ? X : Search}
                label={searching ? "Close search" : "Search"}
                onPress={() => {
                  if (searching) setQuery("");
                  setSearching(!searching);
                }}
              />
              <IconButton icon={UserRound} label="Your profile" onPress={() => router.navigate("/profile")} />
            </View>
          </View>
          <PreviewNotice />
          {searching && (
            <View style={styles.search}>
              <Search size={20} color={c.muted} />
              <TextInput
                accessibilityLabel="Search ideas"
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search ideas"
                placeholderTextColor={c.muted}
                style={styles.searchInput}
              />
            </View>
          )}
          <Tile
            size="large"
            icon={Plus}
            title="Start from scratch"
            hint="Opens a new resbite you name yourself"
            onPress={() => router.push("/arrange")}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip
            text="All"
            icon={LayoutGrid}
            label="All ideas"
            selected={category === "all"}
            onPress={() => setCategory("all")}
          />
          {categoryKeys.map((key) => (
            <Chip
              key={key}
              text={categoryLabels[key]}
              icon={categoryIcons[key]}
              category={key}
              selected={category === key}
              onPress={() => setCategory(key)}
            />
          ))}
        </ScrollView>
        <View style={styles.list}>
          {catalogue.loading ? (
            <View style={{ paddingVertical: 30, gap: 14 }}>
              <ActivityIndicator accessibilityLabel="Loading activities" color={c.aquaDark} />
              <Copy>Finding a little inspiration…</Copy>
            </View>
          ) : catalogue.error ? (
            <View style={{ paddingVertical: 20, gap: 14 }}>
              <ErrorNote message={catalogue.error} />
              <Button title="Try ideas again" onPress={catalogue.refresh} />
            </View>
          ) : catalogue.items.length === 0 ? (
            <View style={[s.card, { padding: 22, gap: 14 }]}>
              <Sparkles size={26} color={c.aquaDark} />
              <Copy>No ideas are available yet. You can still start your own.</Copy>
              <Button title="Check for ideas" onPress={catalogue.refresh} secondary />
            </View>
          ) : results.length === 0 ? (
            <View style={{ paddingVertical: 30, gap: 14 }}>
              <Copy>No ideas match that search.</Copy>
              <Chip
                text="Clear search"
                tone="aqua"
                onPress={() => {
                  setQuery("");
                  setCategory("all");
                }}
              />
            </View>
          ) : (
            <View testID="idea-grid" style={styles.grid}>
              {results.map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={a.title}
                  onPress={() => router.push({ pathname: "/activity/[id]", params: { id: a.id } })}
                  style={({ pressed }) => [styles.card, largeText && { width: "100%" }, pressed && { opacity: 0.9 }]}
                >
                  <View style={[styles.art, { backgroundColor: categoryPalette[a.categories[0] ?? "community"].tint }]}>
                    <Image source={activityArtwork(a)} resizeMode="contain" style={{ width: "100%", height: 134 }} />
                  </View>
                  <View style={styles.cardPanel}>
                    <Copy style={styles.cardTitle}>{a.title}</Copy>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { padding: 24, gap: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerActions: { flexDirection: "row", gap: 8 },
  search: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.tile,
    paddingHorizontal: 15,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.ink, paddingVertical: 15 },
  filters: { paddingHorizontal: 24, gap: 8, paddingBottom: 19 },
  list: { paddingHorizontal: 24, paddingTop: 4, gap: 17 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    width: "47.8%",
    boxShadow: depth.card,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.tile,
    overflow: "hidden",
    backgroundColor: c.paper,
  },
  art: { height: 149, justifyContent: "center" },
  cardPanel: { padding: 12 },
  cardTitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
});
