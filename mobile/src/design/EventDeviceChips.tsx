import React from "react";
import { StyleSheet, View } from "react-native";
import { Bell, BellOff, CalendarPlus, CalendarSync } from "lucide-react-native";
import { Button, Copy } from "./ui";
import { Chip, InfoSheet } from "./kit";
import { GET_REMINDERS_LINE } from "../domain/eventDevice";
import type { EventDevice } from "../state/useEventDevice";

// UX3 Add to calendar and reminders on the event page (spec "Calendar and reminders"; mockup "Calendar and
// reminders"). The chips sit in the event page's chip row, before Open in Maps.

/** "Add to calendar" (or "Update calendar") and "Reminders on" / "Reminders off". */
export function EventDeviceChips({ device }: { device: EventDevice }) {
  if (!device.shown) return null;
  const reminders = device.reminders;
  return (
    <>
      <Chip
        icon={device.calendarUpdate ? CalendarSync : CalendarPlus}
        tone="aqua"
        text={device.calendarUpdate ? "Update calendar" : "Add to calendar"}
        hint={device.calendarUpdate ? "Opens your calendar with the new time and place" : "Opens your calendar"}
        disabled={device.busy}
        onPress={device.addToCalendar}
      />
      {reminders && (
        <Chip
          icon={reminders.on ? Bell : BellOff}
          text={reminders.text}
          label={reminders.label}
          hint={reminders.hint}
          disabled={device.busy}
          onPress={device.pressReminders}
        />
      )}
    </>
  );
}

/** "Get reminders?": shown once, before iPhone's own prompt. Either answer counts as asked. */
export function ReminderSheet({ device }: { device: EventDevice }) {
  return (
    <InfoSheet visible={device.asking} title="Get reminders?" onClose={device.notNow}>
      <Copy>{GET_REMINDERS_LINE}</Copy>
      <View style={styles.actions}>
        <Button title="Allow reminders" icon={false} onPress={device.allowReminders} />
        <Button title="Not now" secondary icon={false} onPress={device.notNow} />
      </View>
    </InfoSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
});
