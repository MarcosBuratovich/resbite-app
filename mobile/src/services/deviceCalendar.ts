import { Platform } from "react-native";
import { storage } from "./supabase";
import type { CalendarRecord, CalendarSource } from "../domain/calendarEvent";
import { createCalendarRecordStore } from "./calendarRecordStore";
import {
  createCalendarService,
  createFakeCalendarAdapter,
  nativeCalendarAdapter,
  type CalendarService,
} from "./calendar";
import { deviceScope, type ReminderScope } from "./reminders";

// UX3 Add to calendar on this phone. Native opens iPhone's own form; web and preview use the fake
// (the plan's "Device fakes" rule).
const records = createCalendarRecordStore(storage);
const fake = createCalendarService(createFakeCalendarAdapter(), records);
let native: CalendarService | undefined;
const serviceFor = (preview: boolean) =>
  preview || Platform.OS === "web" ? fake : (native ??= createCalendarService(nativeCalendarAdapter(), records));

/**
 * "Add to calendar" (update false) or "Update calendar" (update true): opens the form filled in for the
 * event and returns whether it was added. Returns false without opening anything when signed out.
 */
export async function addToCalendar(
  scope: Pick<ReminderScope, "userId" | "preview">,
  plan: CalendarSource & { id: string },
  update: boolean,
  assertCurrent?: () => void,
): Promise<boolean> {
  const key = deviceScope(scope);
  if (!key) return false;
  return serviceFor(scope.preview).add(key, plan, update, assertCurrent);
}

/** What this phone added for the event, for `needsCalendarUpdate`; null when it wasn't added here. */
export async function calendarRecord(
  scope: Pick<ReminderScope, "userId" | "preview">,
  planId: string,
): Promise<CalendarRecord | null> {
  const key = deviceScope(scope);
  return key ? records.get(key, planId) : null;
}

/** Sign-out and account deletion. */
export const clearCalendarRecords = (scope: string): Promise<void> => records.clear(scope);
