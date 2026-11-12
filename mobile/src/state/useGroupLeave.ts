import { useCallback, useRef } from "react";
import { router, useFocusEffect } from "expo-router";
import { chatGateway } from "../services/chat";
import { focusedChat, setFocusedChat, syncReminders } from "../services/deviceReminders";
import { createGroupLeave, createLeftGroups, type StillCurrent } from "./groupLeave";

/** The group whose chat, resbite page or people list is the screen in focus; each clears only its own (a token per focus). */
let screen: { series: string; token: object } | null = null;

/** The groups left on this phone that My resbites hides until its next list read (UI Q3), per account. */
export const leftGroups = createLeftGroups();

const groupLeave = createGroupLeave({
  leave: (series) => chatGateway.leave(series),
  sync: (scope) => syncReminders(scope),
  onScreen: () => screen?.series ?? null,
  toPlans: () => router.dismissTo("/plans"),
  clearFocus: (series) => {
    if (focusedChat() === series) setFocusedChat(null);
  },
  left: leftGroups,
});

/** Leave group, from the chat's menu or the resbite page's More (`createGroupLeave`). */
export const leaveGroup = groupLeave.leave;
/** The chat's refused read after a leave whose answer was lost: the leave went through, so finish it (GR6 M5). */
export const finishLeave = groupLeave.finish;

/** `captureSession`'s check as a yes or no: the phone is still on the session it was taken on (GR6 M1). */
export function stillCurrent(assertSession: () => void): StillCurrent {
  return () => {
    try {
      assertSession();
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * While this screen is in focus, a leave of `series` that goes through lands on My resbites from it (UI Q4). The last
 * series it was given is kept, so a screen whose read fails mid-leave (the leave took its row away) still counts as the
 * group's (ruling GR6 M3).
 */
export function useGroupScreen(series: string | null | undefined): void {
  const known = useRef<string | null>(null);
  if (series) known.current = series;
  const registered = series ?? known.current;
  useFocusEffect(
    useCallback(() => {
      if (!registered) return;
      const mine = { series: registered, token: {} };
      screen = mine;
      return () => {
        if (screen?.token === mine.token) screen = null;
      };
    }, [registered]),
  );
}
