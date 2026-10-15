import type { CalendarEventDetails } from "../domain/calendarEvent";

/**
 * UX3 (the plan's "Device fakes" rule): on web and in preview, reminders and calendar entries go to in-memory fakes. In
 * development builds the fakes also record what they did here, on `globalThis.__resbiteDevice`, so the
 * browser QA scripts can check it. `permission` is the fake reminder permission; a script may set it
 * ("denied", say) before a tap. Never present in a release build.
 */
export type DeviceMirror = {
  reminders: { id: string; at: string; body: string }[];
  calendar: CalendarEventDetails[];
  permission: "undetermined" | "granted" | "denied";
};

declare global {
  var __resbiteDevice: DeviceMirror | undefined;
}

export function deviceMirror(): DeviceMirror | null {
  if (typeof __DEV__ === "undefined" || !__DEV__) return null;
  return (globalThis.__resbiteDevice ??= { reminders: [], calendar: [], permission: "undetermined" });
}
