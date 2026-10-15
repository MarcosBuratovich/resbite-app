import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import { useApp } from "./AppState";
import { useAccount } from "./AccountState";
import { listenForReminders, syncReminders, type ReminderScope } from "../services/deviceReminders";

/**
 * UX3 reminders for the whole app, from the root layout. Keeps this phone's reminders in step with the
 * session (preview on its fake), re-syncs when Resbite comes back to the foreground, and opens the event
 * when a reminder is tapped, after the usual sign-in and account checks. `ready` is false while the root
 * layout holds the navigator back (restoring the session or the first account check).
 */
export function useDeviceReminders(ready: boolean) {
  const { session, preview, restoring, signingOut, localPlans } = useApp();
  const account = useAccount();
  const userId = session?.user.id ?? null;
  const accountReady = account.status === "approved" && account.reviewed;
  const previewPlans = preview ? localPlans : null;
  const scope = useRef<ReminderScope | null>(null);
  useEffect(() => {
    // Sign-out clears reminders itself; never sync over it.
    if (restoring || signingOut) {
      scope.current = null;
      return;
    }
    // Signed in: once the account is checked. Signed out: the phone keeps none, even when a session
    // ended without signing out.
    const next: ReminderScope | null = previewPlans
      ? { userId, preview: true, localPlans: previewPlans }
      : userId
        ? accountReady
          ? { userId, preview: false }
          : null
        : { userId: null, preview: false };
    scope.current = next;
    if (next) void syncReminders(next).catch(() => {});
  }, [restoring, signingOut, userId, accountReady, previewPlans]);
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && previous !== "active" && scope.current)
        void syncReminders(scope.current).catch(() => {});
      previous = state;
    });
    return () => subscription.remove();
  }, []);

  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => listenForReminders(setTapped), []);
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (!tapped || restoring) return;
    // A reminder belongs to a signed-in account; preview never shows one.
    if (!session || preview) {
      setTapped(null);
      return;
    }
    if (!accountReady || !ready || !navigation?.key) return;
    setTapped(null);
    router.push({ pathname: "/event", params: { plan: tapped } });
  }, [tapped, restoring, session, preview, accountReady, ready, navigation?.key]);
}
