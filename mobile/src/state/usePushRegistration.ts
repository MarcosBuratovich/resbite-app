import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import {
  createPushDeviceAdapter,
  createPushSession,
  nativePushDeps,
  pushEnabled,
  type PushStatus,
} from "../services/pushDevice";

/** Plan 4: the one push registration on this phone. AppProvider mirrors every session change into it and
 * holds and clears it on sign-out (sessionLifecycle). */
export const pushSession = createPushSession(
  createPushDeviceAdapter(nativePushDeps()),
  pushEnabled(),
);

/** Mounted once, by AppProvider: registers again when Resbite comes back to the foreground, as the
 * permission may have changed in Settings or the token rotated. (No push-token listener: fetching the
 * token fires it, so reconciling from it would loop.) */
export function usePushForeground() {
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && previous !== "active") void pushSession.reconcile();
      previous = state;
    });
    return () => subscription.remove();
  }, []);
}

/**
 * For the ask and Notification settings (Task 5).
 *
 * `reconcilePush()` registers this phone now: call it after the permission changes in the app ("Turn on
 * notifications"). It never rejects. Calls made together share one registration; one made while a
 * registration is under way gets a single one after it, so the new permission is always read.
 *
 * `pushStatus`, for the current session:
 * - "disabled": nothing can be registered (switched off, web, preview, signed out). Set at once.
 * - null: only while a real account's state is being checked, right after a sign-in or an account
 *   switch. The previous account's state never shows for the new one.
 * - "registered", "permission-off", or "failed" (retried on the next foreground): the last outcome.
 */
export function usePushRegistration(): {
  pushStatus: PushStatus;
  reconcilePush: () => Promise<void>;
} {
  const pushStatus = useSyncExternalStore(pushSession.subscribe, pushSession.status);
  return { pushStatus, reconcilePush: pushSession.reconcile };
}
