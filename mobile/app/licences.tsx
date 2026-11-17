import React, { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Back, Copy, Title, s } from "../src/design/ui";
import { InfoSheet } from "../src/design/kit";
import { colors as c, fonts } from "../src/design/tokens";
import { LEGAL_COPY } from "../src/domain/legal";

type Row = { key: string; name: string; version: string; licence: string; body: string };
type Part = { key: string; title: string; data: Row[] };

/**
 * Licences (A25, CON-11): the fonts, the open-source packages and the libraries React Native builds in, each with its
 * licence text in a sheet. The notices are a large file, so it is read only when this screen opens.
 */
export default function Licences() {
  const sections = useMemo<Part[]>(() => {
    const { LICENCES, packageText } = require("../src/domain/licences") as typeof import("../src/domain/licences");
    const titles = LEGAL_COPY.licenceSections;
    return [
      {
        key: "fonts",
        title: titles.fonts,
        data: LICENCES.fonts.map((f) => ({ key: `font:${f.name}`, name: f.name, version: "", licence: f.licence, body: f.text })),
      },
      {
        key: "packages",
        title: titles.packages,
        data: LICENCES.packages.map((p) => ({
          key: `${p.name}@${p.version}`,
          name: p.name,
          version: p.version,
          licence: p.licence,
          body: packageText(p, LICENCES.texts),
        })),
      },
      {
        key: "native",
        title: titles.native,
        data: LICENCES.native.map((n) => ({
          key: `native:${n.name}`,
          name: n.name,
          version: n.version,
          licence: n.licence,
          body: LEGAL_COPY.nativeLicence(n.licence),
        })),
      },
    ];
  }, []);
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <SafeAreaView style={s.page}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.key}
        initialNumToRender={12}
        maxToRenderPerBatch={24}
        windowSize={7}
        contentContainerStyle={[s.body, { paddingBottom: 32 }]}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Back label="About and legal" />
            <Title>{LEGAL_COPY.licences}</Title>
            <Copy>{LEGAL_COPY.licencesIntro}</Copy>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={styles.header}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const label = item.version ? `${item.name} ${item.version}` : item.name;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${item.licence}`}
              onPress={() => setOpen(item)}
              style={styles.row}
            >
              <Text style={styles.name}>{label}</Text>
              <Text style={styles.licence}>{item.licence}</Text>
            </Pressable>
          );
        }}
      />
      <InfoSheet visible={open !== null} title={open?.name ?? ""} onClose={() => setOpen(null)}>
        <Copy selectable>{open?.body ?? ""}</Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { fontFamily: fonts.medium, fontSize: 15, color: c.ink, marginTop: 20, marginBottom: 4 },
  row: { minHeight: 44, justifyContent: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  name: { fontFamily: fonts.medium, fontSize: 14, color: c.ink, flexShrink: 1 },
  licence: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
});
