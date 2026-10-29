import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { InfoSheet } from "./kit";
import { Copy, Field } from "./ui";
import { colors as c, fonts, r } from "./tokens";
import { countryLabel, searchCountries } from "../domain/countries";
import { PHONE_COPY } from "../domain/phoneCopy";

/** The country chooser: a searchable list in a bottom sheet. Picking a country calls onPick, then onClose. */
export function CountrySheet({
  visible,
  region,
  onPick,
  onClose,
}: {
  visible: boolean;
  region: string;
  onPick: (region: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const found = searchCountries(query);
  return (
    <InfoSheet
      visible={visible}
      title={PHONE_COPY.country}
      onClose={() => {
        setQuery("");
        onClose();
      }}
    >
      <Field label={PHONE_COPY.searchCountries} value={query} onChangeText={setQuery} autoCorrect={false} />
      <View style={styles.group}>
        {found.map((country) => {
          const chosen = country.region === region;
          return (
            <Pressable
              key={country.region}
              accessibilityRole="button"
              accessibilityLabel={countryLabel(country)}
              accessibilityState={{ selected: chosen }}
              onPress={() => {
                onPick(country.region);
                setQuery("");
                onClose();
              }}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={styles.tick}>{chosen ? <Check size={18} strokeWidth={2.4} color={c.aquaDark} /> : null}</View>
              <Copy style={styles.name}>{country.name}</Copy>
              <Copy style={styles.code}>+{country.code}</Copy>
            </Pressable>
          );
        })}
      </View>
    </InfoSheet>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: r.tile, backgroundColor: c.paper, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 14, paddingVertical: 6 },
  tick: { width: 20, alignItems: "center" },
  name: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: c.ink },
  code: { fontSize: 15, color: c.muted },
});
