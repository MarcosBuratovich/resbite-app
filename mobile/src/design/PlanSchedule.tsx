import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { CalendarDays, Clock3, type LucideIcon } from "lucide-react-native";
import { Copy } from "./ui";
import { colors as c, depth, fonts, r } from "./tokens";
import { parseLocalDateTime } from "../domain/plans";
import { addDays, localDay, pickedValue, pickerSeed, splitLocal, spokenDate } from "../domain/schedule";

/**
 * The When step's picker cards (steps v2): the picker comes first, full width, with the
 * suggestions below it. iOS shows the date as an inline calendar (wheels under Larger Text)
 * and the time as wheels, both inside their cards. Android has no inline picker, so each card
 * shows its value in large type and opens the system dialog. The web keeps the typed
 * "Date and time (local)" field in the date card's place; it covers the time as well.
 *
 * The pickers show `pickerSeed` (the chosen day, at the chosen time or 10:00) and every pick
 * goes through `pickedValue`: a picked date keeps the chosen time, a picked time keeps the day.
 */
export function PlanSchedule({
  part,
  value,
  day,
  onChange,
  disabled,
}: {
  part: "date" | "time";
  value: string;
  /** The day chosen on a chip, even before a time is: the pickers show it. */
  day: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const now = new Date();
  const today = localDay(now);
  // Local midnight today, so the calendar keeps today choosable; the time itself is validated.
  const minimumDate = useMemo(() => addDays(new Date(), 0), [today]);
  if (Platform.OS === "web")
    return part === "date" ? <WebField value={value} onChange={onChange} disabled={disabled} /> : null;
  const seed = pickerSeed(value, day, now);
  const pick = (next: Date) => onChange(pickedValue(part, next, seed));
  if (Platform.OS === "android") {
    const chosen = day ? parseLocalDateTime(`${day} 12:00`) : null;
    const time = splitLocal(value).time;
    const text = part === "date" ? (chosen ? spokenDate(chosen, now) : "Choose a day") : (time ?? "Choose a time");
    const Icon: LucideIcon = part === "date" ? CalendarDays : Clock3;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${part === "date" ? "Change date" : "Change time"}, ${text}`}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() =>
          DateTimePickerAndroid.open({
            value: seed,
            mode: part,
            display: "default",
            minimumDate: part === "date" ? minimumDate : undefined,
            onValueChange: (_event, next) => pick(next),
          })
        }
        style={({ pressed }) => [
          styles.card,
          styles.row,
          { backgroundColor: pressed ? c.surface : c.paper, opacity: disabled ? 0.55 : 1 },
        ]}
      >
        <View style={styles.circle}>
          <Icon size={24} strokeWidth={2} color={c.aquaDark} />
        </View>
        <View style={styles.text}>
          <Copy style={styles.value}>{text}</Copy>
          <Copy style={styles.change}>{part === "date" ? "Change date" : "Change time"}</Copy>
        </View>
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, styles.picker]}>
      <DateTimePicker
        value={seed}
        mode={part}
        // Larger Text keeps the wheels for the date too: the inline calendar does not grow with it.
        display={part === "date" && fontScale < 1.4 ? "inline" : "spinner"}
        minimumDate={part === "date" ? minimumDate : undefined}
        themeVariant="light"
        accentColor={c.aquaDark}
        disabled={disabled}
        onValueChange={(_event, next) => pick(next)}
      />
    </View>
  );
}

/** Web QA types into this field; it stands in for both native pickers. */
function WebField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.card, styles.row, focused && styles.focused]}>
      <View aria-hidden style={styles.circle}>
        <CalendarDays size={24} strokeWidth={2} color={c.aquaDark} />
      </View>
      <View style={styles.text}>
        <Copy style={styles.caption}>Date and time (local)</Copy>
        <TextInput
          accessibilityLabel="Date and time (local)"
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD HH:mm"
          placeholderTextColor={c.muted}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, styles.noOutline]}
        />
      </View>
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
  },
  // The native picker sizes itself; it is centred, and clipped by the card's corners if wider.
  picker: { alignItems: "center", overflow: "hidden", paddingVertical: 8 },
  row: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  // The card draws the focus ring (2 pt aqua) in place of the browser outline.
  focused: { borderColor: c.aquaDark, boxShadow: `0 0 0 1px ${c.aquaDark}` },
  noOutline: { outlineStyle: "solid", outlineWidth: 0 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.aquaSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  value: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  change: { fontFamily: fonts.medium, fontSize: 14, color: c.aquaDark },
  caption: { fontFamily: fonts.medium, fontSize: 13, color: c.muted },
  input: { fontFamily: fonts.display, fontSize: 22, color: c.ink, paddingVertical: 4, minHeight: 36 },
});
