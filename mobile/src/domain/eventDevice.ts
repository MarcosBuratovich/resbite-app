// UX3 event page: the calendar action's wording comes from `needsCalendarUpdate` (calendarEvent.ts). Plan 4: the ask is
// the notification ask (`shouldAsk`, notifications.ts), which replaced "Get reminders?". Plan 3: the mute is the server's.

/**
 * Controller ruling P10: iPhone's add-event form opens without a permission only on iOS 17 or later; older
 * versions (and a form that is already open) make it fail. Resbite never asks for calendar access.
 */
export const CALENDAR_OPEN_FAILED = "We couldn’t open your calendar. Add to calendar needs iOS 17 or later.";
export const REMINDERS_CHANGE_FAILED = "Couldn’t change reminders on this phone. Try again.";
