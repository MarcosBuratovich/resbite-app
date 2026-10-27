import React from "react";
import { Bell, BellOff, CalendarPlus, CalendarSync } from "lucide-react-native";
import { Chip } from "./kit";
import type { EventDevice } from "../state/useEventDevice";

// UX3 Add to calendar and reminders on the event page (spec "Calendar and reminders"; mockup "Calendar and
// reminders"). The chips sit in the event page's chip row, before Open in Maps. The notification ask that
// replaced "Get reminders?" is NotificationAsk.

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
