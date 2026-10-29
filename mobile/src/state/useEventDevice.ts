import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useApp, type LocalPlan } from "./AppState";
import { canAddToCalendar, needsCalendarUpdate } from "../domain/calendarEvent";
import { createDeviceActions } from "../domain/deviceActions";
import { CALENDAR_OPEN_FAILED } from "../domain/eventDevice";
import { NOTIFICATIONS_TURN_ON_FAILED } from "../domain/notifications";
import { addToCalendar, calendarRecord } from "../services/deviceCalendar";
import { useNotificationAsk, type NotificationAskState } from "./useNotificationAsk";

export type EventDevice = {
  /** The calendar chip and the notification ask show for the organizer and Going or Maybe guests, on upcoming active events. */
  shown: boolean;
  /** "Update calendar" once the time or place changed after it was added on this phone. */
  calendarUpdate: boolean;
  busy: boolean;
  error: string | null;
  /** "Get notified?" (NotificationAsk). */
  ask: NotificationAskState;
  addToCalendar: () => void;
};

/**
 * UX3 Add to calendar on the event page. Reads what this phone added whenever the page gains focus or Resbite
 * returns to the foreground. (Reminders are the server's mute now, Plan 3.) Plan 4: the first time an organizer or a Going or Maybe guest is here with iPhone's
 * permission never asked for, it shows "Get notified?" once (useNotificationAsk), only while the chips show;
 * answering Going or Maybe makes the guest one, so the sheet follows a confirmed answer and never stands in
 * its way.
 */
export function useEventDevice(plan: LocalPlan | null, view: { owner: boolean; response: string | null }): EventDevice {
  const { session, preview, captureSession } = useApp();
  const userId = session?.user.id ?? null;
  const scope = { userId, preview };
  const shown = plan !== null && canAddToCalendar(plan, view, Date.now());
  const [update, setUpdate] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const identity = `${userId}:${preview}:${plan?.id}`;
  useEffect(() => {
    setUpdate(null);
    setError(null);
  }, [identity]);
  const latest = useRef({ plan, shown, scope });
  latest.current = { plan, shown, scope };

  const read = useCallback(async () => {
    const { plan: current, shown: visible, scope: who } = latest.current;
    if (!current || !visible) return;
    const request = ++revision.current;
    try {
      const record = await calendarRecord(who, current.id);
      if (request !== revision.current) return;
      setUpdate(needsCalendarUpdate(record, current));
    } catch {
      // The calendar chip waits for the next read; nothing here blocks the page.
    }
  }, []);
  // Re-read when the event's time or place changes, or when the person becomes a guest who's going.
  useEffect(() => {
    void read();
  }, [read, identity, shown, plan?.starts_at, plan?.ends_at, plan?.place_label]);
  useFocusEffect(
    useCallback(() => {
      void read();
      const sub = AppState.addEventListener("change", (next) => {
        if (next === "active") void read();
      });
      return () => sub.remove();
    }, [read]),
  );

  /** One device action at a time; the chips re-read afterwards (`read` is stable). */
  const [actions] = useState(() =>
    createDeviceActions({ busy: setBusy, error: setError, settled: () => void read() }),
  );
  const run = (work: () => Promise<void>, failure: string) => actions.run(work, failure);
  // Turning notifications on runs as a device action: the chips are busy meanwhile and re-read after. It is
  // queued behind an action already running, never dropped: its sheet has closed and its flag is set.
  const ask = useNotificationAsk(shown ? view : null, {
    perform: (work) => void actions.run(work, NOTIFICATIONS_TURN_ON_FAILED, { queue: true }),
  });
  return {
    shown,
    calendarUpdate: update ?? false,
    busy,
    error,
    ask,
    addToCalendar: () => {
      const current = plan;
      if (!current) return;
      // Never asks for calendar access: iPhone's own form saves the event (plan decision P1).
      void run(async () => {
        await addToCalendar(scope, current, update ?? false, captureSession());
      }, CALENDAR_OPEN_FAILED);
    },
  };
}
