import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { ChevronRight } from "lucide-react-native";
import { Copy } from "./ui";
import { colors as c, depth, fonts, r } from "./tokens";
import { localDateTime, parseLocalDateTime } from "../domain/plans";
import { addDays, localDay } from "../domain/schedule";
import { PLAN_COPY } from "../domain/planCopy";

/**
 * One of the When sheet's cards (Date, Start time, End time): the label above the value, a chevron.
 * iOS opens the picker under the card (an inline calendar, or wheels under Larger Text, for the date;
 * wheels for a time). Android opens the system dialog. The web types the value in the card itself
 * ("YYYY-MM-DD" / "HH:mm"), taking it only once it reads as a real date or time.
 *
 * A part that is not chosen never shows a picker holding a value: UIDatePicker sends no change for the
 * date it already highlights. Opening such a card takes `seed` as the choice, then shows the picker.
 */
export function PickerCard({
  kind,
  label,
  value,
  text,
  seed,
  open,
  onOpen,
  onPick,
}: {
  kind: "date" | "time";
  label: string;
  /** "YYYY-MM-DD" or "HH:mm"; null while not chosen. */
  value: string | null;
  /** The value as the card shows it ("Sat 24 Oct", "19:00"); null while not chosen. */
  text: string | null;
  /** Where an unchosen picker starts, in the same format as `value`. */
  seed: string;
  /** iOS: this card's picker is showing. */
  open: boolean;
  onOpen: (open: boolean) => void;
  onPick: (value: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const shown = text ?? PLAN_COPY.notSet;
  const at = value ?? seed;
  const stamp = kind === "date" ? `${at} 12:00` : `${localDay(addDays(new Date(), 1))} ${at}`;
  const current = parseLocalDateTime(stamp) ?? addDays(new Date(), 1);
  const pick = (next: Date) => onPick(kind === "date" ? localDay(next) : localDateTime(next).slice(11));

  if (Platform.OS === "web")
    return (
      <View style={[styles.card, focused && styles.focused]}>
        <View style={styles.row}>
          <View style={styles.text}>
            <Copy style={styles.label}>{label}</Copy>
            <TextInput
              accessibilityLabel={label}
              value={draft}
              onChangeText={(next) => {
                setDraft(next);
                const ok = kind === "date" ? parseLocalDateTime(`${next} 12:00`) : parseLocalDateTime(`2000-01-01 ${next}`);
                if (ok) onPick(next);
              }}
              placeholder={kind === "date" ? "YYYY-MM-DD" : "HH:mm"}
              placeholderTextColor={c.muted}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[styles.input, styles.noOutline]}
            />
          </View>
        </View>
      </View>
    );

  const press = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: kind,
        display: "default",
        minimumDate: kind === "date" ? addDays(new Date(), 0) : undefined,
        onValueChange: (_event, next) => pick(next),
      });
      return;
    }
    if (!open && value === null) onPick(seed);
    onOpen(!open);
  };
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown}`}
        accessibilityState={{ expanded: Platform.OS === "android" ? undefined : open }}
        onPress={press}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface : c.paper }]}
      >
        <View style={styles.text}>
          <Copy style={styles.label}>{label}</Copy>
          <Copy style={text === null ? [styles.value, { color: c.muted }] : styles.value}>{shown}</Copy>
        </View>
        <ChevronRight size={20} color={c.muted} aria-hidden />
      </Pressable>
      {Platform.OS === "ios" && open ? (
        <View style={styles.picker}>
          <DateTimePicker
            accessibilityLabel={label}
            value={current}
            mode={kind}
            // Larger Text keeps the wheels for the date too: the inline calendar does not grow with it.
            display={kind === "date" && fontScale < 1.4 ? "inline" : "spinner"}
            minimumDate={kind === "date" ? addDays(new Date(), 0) : undefined}
            themeVariant="light"
            accentColor={c.aquaDark}
            onValueChange={(_event, next) => pick(next)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: r.panel,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    boxShadow: depth.card,
    overflow: "hidden",
  },
  // The native picker sizes itself; it is centred, and clipped by the card's corners if wider.
  picker: { alignItems: "center", paddingBottom: 8 },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  // The card draws the focus ring (2 pt aqua) in place of the browser outline.
  focused: { borderColor: c.aquaDark, boxShadow: `0 0 0 1px ${c.aquaDark}` },
  noOutline: { outlineStyle: "solid", outlineWidth: 0 },
  text: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: c.muted },
  value: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  input: { fontFamily: fonts.display, fontSize: 20, color: c.ink, paddingVertical: 4, minHeight: 36 },
});
