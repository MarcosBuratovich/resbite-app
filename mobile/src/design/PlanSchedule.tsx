import React, { useEffect, useMemo, useState } from "react";
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
 * The pickers show `pickerSeed` (the chosen day, at the chosen time or 10:00). A picked date
 * goes to `onDay`, which keeps the chosen time (or waits for one); a picked time goes through
 * `pickedValue`, which keeps the chosen day.
 *
 * A part that isn't chosen never shows a picker holding a value: UIDatePicker sends no change
 * for the date it already highlights, so that value could not be confirmed. It shows "Choose a
 * day" / "Choose a time" instead. On iOS and the web, tapping it takes the picker's starting
 * point as the choice (the suggested day; or the chosen day at 10:00) and shows the picker; on
 * Android it opens the dialog. A picker that has been shown stays for this visit to the step,
 * so typing a partial date on the web never hides the field.
 */
export function PlanSchedule({
  part,
  value,
  day,
  set,
  onDay,
  onChange,
  disabled,
}: {
  part: "date" | "time";
  value: string;
  /** The day chosen on a chip, even before a time is: the pickers show it. */
  day: string | null;
  /** Whether this part is chosen: a day (from the value or a chip), or a time. */
  set: boolean;
  /** A picked day (the date part). */
  onDay: (day: string) => void;
  /** A typed value (web) or a picked time. */
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const now = new Date();
  const today = localDay(now);
  // Local midnight today, so the calendar keeps today choosable; the time itself is validated.
  const minimumDate = useMemo(() => addDays(new Date(), 0), [today]);
  const [shown, setShown] = useState(set);
  useEffect(() => {
    if (set) setShown(true);
  }, [set]);
  if (Platform.OS === "web" && part === "time") return null;
  const seed = pickerSeed(value, day, now);
  const pick = (next: Date) => (part === "date" ? onDay(localDay(next)) : onChange(pickedValue(part, next, seed)));
  const dialog = () =>
    DateTimePickerAndroid.open({
      value: seed,
      mode: part,
      display: "default",
      minimumDate: part === "date" ? minimumDate : undefined,
      onValueChange: (_event, next) => pick(next),
    });
  const Icon: LucideIcon = part === "date" ? CalendarDays : Clock3;
  if (!set && !shown) {
    // A time needs a day first, as the time chips do.
    const needsDay = part === "time" && day === null;
    const text = part === "date" ? "Choose a day" : "Choose a time";
    return (
      <CardButton
        icon={Icon}
        title={text}
        label={text}
        hint={needsDay ? "Choose a day first" : undefined}
        disabled={disabled || needsDay}
        onPress={() => (Platform.OS === "android" ? dialog() : pick(seed))}
      />
    );
  }
  if (Platform.OS === "web") return <WebField value={value} onChange={onChange} disabled={disabled} />;
  if (Platform.OS === "android") {
    const chosen = day ? parseLocalDateTime(`${day} 12:00`) : null;
    const time = splitLocal(value).time;
    const text = part === "date" ? (chosen ? spokenDate(chosen, now) : "Choose a day") : (time ?? "Choose a time");
    const action = part === "date" ? "Change date" : "Change time";
    return (
      <CardButton icon={Icon} title={text} subtitle={action} label={`${action}, ${text}`} disabled={disabled} onPress={dialog} />
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

/** A full-width card button: "Choose a day" / "Choose a time", or Android's chosen value with its Change line. */
function CardButton({
  icon: Icon,
  title,
  subtitle,
  label,
  hint,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  label: string;
  hint?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
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
        <Copy style={styles.value}>{title}</Copy>
        {subtitle ? <Copy style={styles.change}>{subtitle}</Copy> : null}
      </View>
    </Pressable>
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
