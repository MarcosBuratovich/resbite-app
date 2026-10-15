import {
  calendarEventDetails,
  calendarRecordOf,
  type CalendarEventDetails,
  type CalendarRecord,
  type CalendarSource,
} from "../domain/calendarEvent";
import { deviceMirror, type DeviceMirror } from "./deviceMirror";

// UX3 Add to calendar (spec "Calendar and reminders", plan decision P1): iPhone's own add-event form,
// opened with the details filled in. EventKitUI saves the event itself, so Resbite asks for no calendar
// permission and can't read, change or remove anything in the calendar.

/** How the form closed: "saved" or "canceled" (or "deleted") on iOS; Android only reports "done". */
export type CalendarResult = "saved" | "canceled" | "done" | "deleted";
export type CalendarAdapter = { add(details: CalendarEventDetails): Promise<CalendarResult> };
type Records = {
  remember(scope: string, planId: string, record: CalendarRecord, assertCurrent?: () => void): Promise<void>;
};

export function createCalendarService(adapter: CalendarAdapter, records: Records) {
  return {
    /**
     * Opens the form for the event ("Update calendar" fills in the updated note). Returns whether it was
     * added. What was added is remembered on this phone; that's a convenience, so it never fails the add.
     */
    async add(
      scope: string,
      plan: CalendarSource & { id: string },
      update: boolean,
      assertCurrent?: () => void,
    ): Promise<boolean> {
      const result = await adapter.add(calendarEventDetails(plan, update));
      if (result !== "saved" && result !== "done") return false;
      await records.remember(scope, plan.id, calendarRecordOf(plan), assertCurrent).catch(() => {});
      return true;
    },
  };
}
export type CalendarService = ReturnType<typeof createCalendarService>;

/** The real phone: iPhone's own form, with no permission prompt (expo-calendar's legacy API). */
export function nativeCalendarAdapter(): CalendarAdapter {
  return {
    async add(details) {
      const calendar = require("expo-calendar/legacy") as typeof import("expo-calendar/legacy");
      const { action } = await calendar.createEventInCalendarAsync(details);
      // Anything else the library may report counts as not added.
      return action === "saved" || action === "done" || action === "deleted" ? action : "canceled";
    },
  };
}

/** Web and preview: nothing opens; the entry counts as saved. Development builds show it on `__resbiteDevice`. */
export function createFakeCalendarAdapter(mirror: DeviceMirror | null = deviceMirror()): CalendarAdapter {
  return {
    async add(details) {
      mirror?.calendar.push(details);
      return "saved";
    },
  };
}
