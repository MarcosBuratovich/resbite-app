import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useApp, type LocalPlan } from "./AppState";
import { canAddToCalendar, needsCalendarUpdate } from "../domain/calendarEvent";
import {
  CALENDAR_OPEN_FAILED,
  REMINDERS_CHANGE_FAILED,
  reminderChip,
  shouldAskForReminders,
  type ReminderChip,
} from "../domain/eventDevice";
import type { NotificationPermission } from "../domain/notifications";
import { addToCalendar, calendarRecord } from "../services/deviceCalendar";
import {
  askForReminders,
  markRemindersAsked,
  muteReminders,
  reminderPermission,
  remindersFor,
  type ReminderPrefs,
} from "../services/deviceReminders";
import { remindersAllowed } from "../services/reminders";
import { openNotificationSettings } from "../services/notifications";

export type EventDevice = {
  /** The calendar and reminder chips show for the organizer and Going or Maybe guests, on upcoming active events. */
  shown: boolean;
  /** "Update calendar" once the time or place changed after it was added on this phone. */
  calendarUpdate: boolean;
  /** Null until this phone's reminder state has been read. */
  reminders: ReminderChip | null;
  busy: boolean;
  error: string | null;
  /** The "Get reminders?" sheet. */
  asking: boolean;
  addToCalendar: () => void;
  pressReminders: () => void;
  allowReminders: () => void;
  notNow: () => void;
};

/**
 * UX3 Add to calendar and reminders on the event page. Reads what this phone added and its reminder state
 * whenever the page gains focus or Resbite returns to the foreground (Settings may have changed the
 * permission). The first time an organizer or a Going or Maybe guest is here with iPhone's permission
 * never asked for, it shows "Get reminders?" once; answering Going or Maybe makes the guest one, so the sheet
 * follows a confirmed answer and never stands in its way.
 */
export function useEventDevice(plan: LocalPlan | null, view: { owner: boolean; response: string | null }): EventDevice {
  const { session, preview, captureSession } = useApp();
  const userId = session?.user.id ?? null;
  const scope = { userId, preview };
  const shown = plan !== null && canAddToCalendar(plan, view, Date.now());
  const [state, setState] = useState<{
    permission: NotificationPermission;
    prefs: ReminderPrefs;
    update: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const working = useRef(false);
  const revision = useRef(0);
  const askedHere = useRef(false);
  const identity = `${userId}:${preview}:${plan?.id}`;
  useEffect(() => {
    setState(null);
    setError(null);
    setAsking(false);
    askedHere.current = false;
  }, [identity]);
  const latest = useRef({ plan, shown, scope });
  latest.current = { plan, shown, scope };

  const read = useCallback(async () => {
    const { plan: current, shown: visible, scope: who } = latest.current;
    if (!current || !visible) return;
    const request = ++revision.current;
    try {
      const [permission, prefs, record] = await Promise.all([
        reminderPermission(who),
        remindersFor(who),
        calendarRecord(who, current.id),
      ]);
      if (request !== revision.current) return;
      setState({ permission, prefs, update: needsCalendarUpdate(record, current) });
      if (!askedHere.current && shouldAskForReminders({ permission, asked: prefs.asked, enabled: prefs.enabled })) {
        askedHere.current = true;
        setAsking(true);
        // Shown counts as asked, whatever the answer.
        void markRemindersAsked(who, captureSession()).catch(() => {});
      }
    } catch {
      // The chips wait for the next read; nothing here blocks the page.
    }
  }, [captureSession]);
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

  /** One device action at a time; the chips re-read afterwards. */
  async function run(work: () => Promise<void>, failure: string) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError(failure);
    } finally {
      working.current = false;
      setBusy(false);
      void read();
    }
  }
  const chip = state
    ? reminderChip({
        permission: state.permission,
        allowed: remindersAllowed(state.permission),
        enabled: state.prefs.enabled,
        muted: plan !== null && state.prefs.muted.includes(plan.id),
      })
    : null;

  return {
    shown,
    calendarUpdate: state?.update ?? false,
    reminders: chip,
    busy,
    error,
    asking,
    addToCalendar: () => {
      const current = plan;
      if (!current) return;
      // Never asks for calendar access: iPhone's own form saves the event (plan decision P1).
      void run(async () => {
        await addToCalendar(scope, current, state?.update ?? false, captureSession());
      }, CALENDAR_OPEN_FAILED);
    },
    pressReminders: () => {
      const current = plan;
      if (!current || !chip) return;
      if (chip.action === "notifications") {
        router.push("/notifications");
        return;
      }
      if (chip.action === "settings") {
        void run(() => openNotificationSettings(preview), "Couldn’t open device settings. Please open Settings on your phone.");
        return;
      }
      void run(async () => {
        if (chip.action === "ask") {
          const permission = await askForReminders(scope);
          // Turning reminders on here also turns them back on for this event.
          if (remindersAllowed(permission) && state?.prefs.muted.includes(current.id))
            await muteReminders(scope, current.id, false, captureSession());
          return;
        }
        await muteReminders(scope, current.id, chip.action === "mute", captureSession());
      }, REMINDERS_CHANGE_FAILED);
    },
    allowReminders: () => {
      setAsking(false);
      void run(async () => {
        await askForReminders(scope);
      }, REMINDERS_CHANGE_FAILED);
    },
    notNow: () => setAsking(false),
  };
}
