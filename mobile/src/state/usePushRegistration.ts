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
 * For the ask and Notification settings (Task 5). `reconcilePush()` registers this phone now: call it
 * after the permission changes in the app ("Turn on notifications"). It never rejects. `pushStatus` is
 * the last outcome for the current session: "registered", "permission-off", "disabled" (switched off,
 * web, preview or signed out), "failed" (retried on the next foreground), or null until one settles.
 */
export function usePushRegistration(): {
  pushStatus: PushStatus;
  reconcilePush: () => Promise<void>;
} {
  const pushStatus = useSyncExternalStore(pushSession.subscribe, pushSession.status);
  return { pushStatus, reconcilePush: pushSession.reconcile };
}
