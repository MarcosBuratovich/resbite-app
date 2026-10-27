import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import { useApp } from "./AppState";
import { useAccount } from "./AccountState";
import { supabase } from "../services/supabase";
import { withDeadline } from "../services/plans";
import { createPushTapRouter, type TapContext } from "../services/pushTaps";

/** Reads the plan as the signed-in person; an error or an empty read is null ("gone"). */
async function readAuthorizedPlan(_account: string, plan: string): Promise<{ id: string } | null> {
  try {
    const { data, error } = await withDeadline((signal) =>
      supabase.from("plans").select("id").eq("id", plan).abortSignal(signal).maybeSingle(),
    );
    return error ? null : (data ?? null);
  } catch {
    return null;
  }
}

/**
 * Opens the event when a Resbite push is tapped, while running or from a cold start. Waits for the session
 * and account to settle and the navigator to mount; an unreadable event lands on My resbites with a note.
 * `ready` is false while the root layout holds the navigator back.
 */
export function usePushRouting(ready: boolean) {
  const { session, preview, restoring, signingOut } = useApp();
  const account = useAccount();
  const navigation = useRootNavigationState();
  const settled =
    ready && !restoring && !signingOut && Boolean(navigation?.key) &&
    (!session || preview || account.status !== "checking");
  const approved = account.status === "approved" && account.reviewed;
  const refreshAccount = account.refresh;
  const refreshRef = useRef(refreshAccount);
  refreshRef.current = refreshAccount;
  const context = useRef<TapContext>({ ready: false, account: null, approved: false, preview: false });
  context.current = {
    ready: settled,
    account: session?.user.id ?? null,
    approved,
    preview,
  };
  const tapRouter = useRef<ReturnType<typeof createPushTapRouter> | undefined>(undefined);
  tapRouter.current ??= createPushTapRouter({
    context: () => context.current,
    readAuthorizedPlan,
    refreshAccount: () => void refreshRef.current(),
    open: (destination) => router.push(destination),
  });
  useEffect(() => {
    if (Platform.OS === "web") return;
    const notifications = require("expo-notifications") as typeof import("expo-notifications");
    const taps = tapRouter.current!;
    taps.launch(
      () => notifications.getLastNotificationResponse(),
      () => notifications.clearLastNotificationResponse(),
    );
    const subscription = notifications.addNotificationResponseReceivedListener((r) => {
      taps.receive(r);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    void tapRouter.current!.flush();
  }, [settled, session, preview, approved]);
}
