import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { ChevronDown, Phone } from "lucide-react-native";
import { FieldCard } from "./kit";
import { CountrySheet } from "./CountrySheet";
import { Copy } from "./ui";
import { colors as c, fonts, r } from "./tokens";
import { countryByRegion } from "../domain/countries";
import { PHONE_COPY } from "../domain/phoneCopy";

/** The country button before the number: "+54" and a chevron; the name is in its label. At least 44 tall. */
export function CountryButton({ region, onPress, style }: { region: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const country = countryByRegion(region);
  const code = country?.code ?? "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={PHONE_COPY.countryButton(country?.name ?? region, code)}
      onPress={onPress}
      style={({ pressed }) => [styles.button, style, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Copy style={styles.code}>+{code}</Copy>
      <ChevronDown size={16} strokeWidth={2.2} color={c.muted} />
    </Pressable>
  );
}

/** The country button and the mobile-number input card, shared by sign-up, sign-in and Add your number. */
export function PhoneField({
  region,
  onRegionChange,
  ...props
}: Omit<TextInputProps, "style"> & { region: string; onRegionChange: (region: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <View style={styles.row}>
      <CountryButton region={region} onPress={() => setOpen(true)} />
      <View style={styles.field}>
        <FieldCard
          label={PHONE_COPY.numberField}
          placeholder={PHONE_COPY.numberField}
          icon={Phone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          {...props}
        />
      </View>
      <CountrySheet visible={open} region={region} onPick={onRegionChange} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  field: { flex: 1 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: r.panel,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
  },
  code: { fontFamily: fonts.medium, fontSize: 16, color: c.ink },
});
