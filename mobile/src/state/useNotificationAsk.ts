import { useEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router";
import { useApp } from "./AppState";
import { usePushRegistration } from "./usePushRegistration";
import {
  askMoment,
  NOTIFICATIONS_TURN_ON_FAILED,
  shouldAsk,
  type AskMoment,
} from "../domain/notifications";
import {
  askForReminders,
  markNotificationsAsked,
  reminderPermission,
  remindersFor,
} from "../services/deviceReminders";

export type NotificationAskState = {
  /** The "Get notified?" sheet is open. */
  visible: boolean;
  /** Why turning notifications on failed, for the screen's ErrorNote. */
  error: string | null;
  turnOn: () => void;
  notNow: () => void;
};

/**
 * Plan 4: the one notification ask, from the event page, My resbites and the open link's waiting screen.
 * While `moment` is one (askMoment) and the screen is focused, it reads iPhone's permission and the ask's
 * own device flag (`notificationsAsked`), and opens once when shouldAsk says so; opening sets the flag,
 * whatever the answer.
 * It closes while the moment has passed (a guest who answers Can’t go) or the screen is covered.
 *
 * "Turn on notifications" asks as "Allow reminders" did (askForReminders: iPhone's prompt, then the
 * reminders), then registers this phone for push (reconcilePush). `perform` runs that work: the event page
 * passes its device runner (busy, its error, re-read chips); by default a failure sets `error`.
 */
export function useNotificationAsk(
  moment: AskMoment | null,
  options: { perform?: (work: () => Promise<void>) => void } = {},
): NotificationAskState {
  const { session, preview, captureSession } = useApp();
  const { reconcilePush } = usePushRegistration();
  const focused = useIsFocused();
  const userId = session?.user.id ?? null;
  const identity = `${userId}:${preview}`;
  const due = moment !== null && askMoment(moment);
  // The identity the sheet is open for, and the one already read on this screen: one read per account here.
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<{ identity: string; message: string } | null>(null);
  const settled = useRef<string | null>(null);
  const latest = useRef({ moment, options });
  latest.current = { moment, options };

  useEffect(() => {
    // Signed out there is no account to keep the flag for.
    if (!due || !focused || settled.current === identity || (!userId && !preview)) return;
    let active = true;
    const scope = { userId, preview };
    void Promise.all([reminderPermission(scope), remindersFor(scope)]).then(
      ([permission, prefs]) => {
        const current = latest.current.moment;
        if (!active || settled.current === identity || !current) return;
        settled.current = identity;
        if (!shouldAsk({ ...current, permission, notificationsAsked: prefs.notificationsAsked })) return;
        setAsking(identity);
        // Shown counts as asked, whatever the answer.
        void markNotificationsAsked(scope, captureSession()).catch(() => {});
      },
      // The next moment, focus or account reads again; nothing here blocks the screen.
      () => {},
    );
    return () => {
      active = false;
    };
  }, [due, focused, identity, userId, preview, captureSession]);

  return {
    visible: asking === identity && due && focused,
    error: error?.identity === identity ? error.message : null,
    turnOn: () => {
      setAsking(null);
      setError(null);
      const scope = { userId, preview };
      const work = async () => {
        try {
          await askForReminders(scope);
        } finally {
          // Whatever the prompt said: registers when allowed, removes nothing that wasn't. Never rejects.
          await reconcilePush();
        }
      };
      const perform = latest.current.options.perform;
      if (perform) return perform(work);
      void work().catch(() => setError({ identity, message: NOTIFICATIONS_TURN_ON_FAILED }));
    },
    notNow: () => setAsking(null),
  };
}
