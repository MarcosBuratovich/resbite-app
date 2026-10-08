import React, { useEffect, useState } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarDays, ChevronDown, Clock3 } from "lucide-react-native";
import { Button, Copy, Field, Title, useReduceMotion } from "./ui";
import { colors as c } from "./tokens";
import { localDateTime, parseLocalDateTime } from "../domain/plans";

export function PlanSchedule({
  value,
  onChange,
  disabled,
  picker,
  onPickerClose,
  buttons = true,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Controlled mode (UX1 When step): the parent opens the picker sheet. */
  picker?: "date" | "time" | null;
  onPickerClose?: () => void;
  /** Show the Date and Time buttons (native only). */
  buttons?: boolean;
}) {
  const [ownMode, setOwnMode] = useState<"date" | "time" | null>(null);
  const controlled = picker !== undefined;
  const mode = controlled ? picker : ownMode;
  const setMode = (next: "date" | "time" | null) => {
    if (!controlled) setOwnMode(next);
    else if (next === null) onPickerClose?.();
  };
  const [candidate, setCandidate] = useState(new Date());
  const reduce = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const date = parseLocalDateTime(value);
  // A parent-opened picker starts from the current value, as open() does.
  useEffect(() => {
    if (!controlled || !picker) return;
    Keyboard.dismiss();
    setCandidate(parseLocalDateTime(value) ?? new Date(Date.now() + 86400000));
  }, [controlled, picker]);
  const open = (next: "date" | "time") => {
    Keyboard.dismiss();
    setCandidate(date ?? new Date(Date.now() + 86400000));
    setMode(next);
  };
  if (Platform.OS === "web")
    return (
      <Field
        label="Date and time (local)"
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD HH:mm"
        editable={!disabled}
      />
    );
  const nativePicker = mode && (
    <DateTimePicker
      value={candidate}
      mode={mode}
      display={
        Platform.OS === "ios"
          ? mode === "date" && fontScale < 1.4
            ? "inline"
            : "spinner"
          : "default"
      }
      minimumDate={mode === "date" ? new Date() : undefined}
      themeVariant="light"
      accentColor={c.aquaDark}
      onDismiss={() => setMode(null)}
      onValueChange={(_event, next) => {
        setCandidate(next);
        if (Platform.OS === "android") {
          onChange(localDateTime(next));
          setMode(null);
        }
      }}
    />
  );
  return (
    <>
      {buttons && (
        <View style={styles.controls}>
          {(
            [
              [
                "date",
                "Date",
                CalendarDays,
                date?.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
              ],
              [
                "time",
                "Time",
                Clock3,
                date?.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                }),
              ],
            ] as const
          ).map(([key, label, Icon, text]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Change ${label.toLowerCase()}: ${text ?? "Choose"}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => open(key)}
              style={({ pressed }) => [
                styles.control,
                { backgroundColor: pressed ? c.aquaSoft : c.cream },
              ]}
            >
              <Icon color={c.aquaDark} size={21} strokeWidth={1.6} />
              <View style={{ flex: 1, gap: 2 }}>
                <Copy style={{ fontSize: 11, color: c.muted }}>{label}</Copy>
                <Copy>{text ?? "Choose"}</Copy>
              </View>
              <ChevronDown color={c.aquaDark} size={17} />
            </Pressable>
          ))}
        </View>
      )}
      {Platform.OS === "android" ? (
        nativePicker
      ) : (
        <Modal
          visible={mode !== null}
          transparent
          animationType={reduce ? "fade" : "slide"}
          onRequestClose={() => setMode(null)}
        >
          <View style={styles.backdrop}>
            <Pressable
              accessibilityLabel="Close date picker"
              accessibilityRole="button"
              style={StyleSheet.absoluteFill}
              onPress={() => setMode(null)}
            />
            <SafeAreaView
              edges={["bottom"]}
              style={styles.sheet}
              accessibilityViewIsModal
            >
              <ScrollView
                contentContainerStyle={{ paddingVertical: 24, gap: 20 }}
              >
                <View style={styles.handle} />
                <Title style={{ fontSize: 27, marginHorizontal: 24 }}>
                  {mode === "date" ? "Pick a day." : "Pick a time."}
                </Title>
                {nativePicker}
                <View style={{ paddingHorizontal: 24, gap: 20 }}>
                  <Button
                    title="Done"
                    onPress={() => {
                      onChange(localDateTime(candidate));
                      setMode(null);
                    }}
                  />
                  <Button
                    title={
                      mode === "date"
                        ? "Keep previous date"
                        : "Keep previous time"
                    }
                    secondary
                    icon={false}
                    onPress={() => setMode(null)}
                  />
                </View>
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 10 },
  control: {
    minHeight: 72,
    borderRadius: 19,
    padding: 15,
    gap: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(34, 30, 45, 0.25)",
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: c.paper,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.line,
    alignSelf: "center",
  },
});
