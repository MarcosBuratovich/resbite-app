import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { CalendarDays, Clock3, type LucideIcon } from "lucide-react-native";
import { Copy, useLargeText } from "./ui";
import { colors as c, depth, fonts, r } from "./tokens";
import { localDateTime, parseLocalDateTime } from "../domain/plans";
import { defaultEnd } from "../domain/eventTime";
import { addDays, localDay, pickedValue, pickerSeed, splitLocal, spokenDate, spokenDateTime } from "../domain/schedule";

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
  if (Platform.OS === "web")
    return <WebField label="Date and time (local)" icon={CalendarDays} value={value} onChange={onChange} disabled={disabled} />;
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

/**
 * UX3 optional end time (mockup "When step: optional end"), shown once "+ End time" is tapped. The end
 * may fall on a later day, so iOS shows one date-and-time picker (compact, wheels under Larger Text) and
 * Android opens its date dialog, then its time dialog. The web keeps a typed "End date and time (local)"
 * field, like the start's. "Remove" clears the end.
 */
export function EndSchedule({
  value,
  start,
  onChange,
  onRemove,
  disabled,
}: {
  /** The end in the editor's local `YYYY-MM-DD HH:mm` format. */
  value: string;
  /** The start, the end's lower bound and its seed when the end can't be read. */
  start: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const remove = <RemoveEnd onPress={onRemove} disabled={disabled} />;
  if (Platform.OS === "web")
    return (
      <WebField
        label="End date and time (local)"
        icon={Clock3}
        value={value}
        onChange={onChange}
        disabled={disabled}
        accessory={remove}
      />
    );
  const seed = parseLocalDateTime(value) ?? parseLocalDateTime(defaultEnd(start)) ?? addDays(new Date(), 1);
  const minimumDate = parseLocalDateTime(start) ?? undefined;
  const pick = (next: Date) => onChange(localDateTime(next));
  if (Platform.OS === "android") {
    const dialog = () =>
      DateTimePickerAndroid.open({
        value: seed,
        mode: "date",
        display: "default",
        minimumDate,
        onValueChange: (_event, day) =>
          DateTimePickerAndroid.open({ value: day, mode: "time", display: "default", onValueChange: (_e, at) => pick(at) }),
      });
    const text = spokenDateTime(seed, new Date());
    return (
      <View style={[styles.card, styles.row]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change end, ${text}`}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={dialog}
          style={({ pressed }) => [styles.endButton, { opacity: disabled ? 0.55 : pressed ? 0.7 : 1 }]}
        >
          <View style={styles.circle}>
            <Clock3 size={24} strokeWidth={2} color={c.aquaDark} />
          </View>
          <View style={styles.text}>
            <Copy style={styles.caption}>Ends</Copy>
            <Copy style={styles.endValue}>{text}</Copy>
          </View>
        </Pressable>
        {remove}
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.endCard]}>
      <View style={styles.endHeader}>
        <View aria-hidden style={styles.circle}>
          <Clock3 size={24} strokeWidth={2} color={c.aquaDark} />
        </View>
        <Copy style={[styles.caption, styles.text]}>Ends</Copy>
        {remove}
      </View>
      <DateTimePicker
        accessibilityLabel="End date and time"
        value={seed}
        mode="datetime"
        // Larger Text keeps the wheels, as the start's date does: the compact buttons do not grow with it.
        display={fontScale < 1.4 ? "compact" : "spinner"}
        minimumDate={minimumDate}
        themeVariant="light"
        accentColor={c.aquaDark}
        disabled={disabled}
        onValueChange={(_event, next) => pick(next)}
      />
    </View>
  );
}

/** The end card's "Remove" action: a 44 pt text button that reads "Remove end time". */
function RemoveEnd({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Remove end time"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.remove, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}
    >
      <Copy style={styles.removeText}>Remove</Copy>
    </Pressable>
  );
}

/** Web QA types into these fields: the start's stands in for both native pickers, the end's for its picker. */
function WebField({
  label,
  icon: Icon,
  value,
  onChange,
  disabled,
  accessory,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  accessory?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  // Under Larger Text the accessory (Remove) moves under the field, so the field keeps its width at 320 px.
  const below = useLargeText() && accessory;
  return (
    <View style={[styles.card, focused && styles.focused]}>
      <View style={styles.row}>
        <View aria-hidden style={styles.circle}>
          <Icon size={24} strokeWidth={2} color={c.aquaDark} />
        </View>
        <View style={styles.text}>
          <Copy style={styles.caption}>{label}</Copy>
          <TextInput
            accessibilityLabel={label}
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
        {!below && accessory}
      </View>
      {below ? <View style={styles.below}>{accessory}</View> : null}
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
  // UX3 end card.
  endCard: { gap: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: "flex-start" },
  endHeader: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 14 },
  endButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, minHeight: 54 },
  endValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  below: { alignItems: "flex-end", paddingHorizontal: 10, paddingBottom: 6, marginTop: -6 },
  remove: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  removeText: { fontFamily: fonts.medium, fontSize: 15, color: "#963F58" },
});
