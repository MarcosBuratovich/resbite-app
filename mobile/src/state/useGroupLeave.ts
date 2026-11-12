import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";
import { chatGateway } from "../services/chat";
import { syncReminders } from "../services/deviceReminders";
import { createGroupLeave, createLeftGroups } from "./groupLeave";

/** The group whose chat or resbite page is the screen in focus; each screen clears only its own (a token per focus). */
let screen: { series: string; token: object } | null = null;

/** The groups left on this phone that My resbites hides until its next list read (UI Q3). */
export const leftGroups = createLeftGroups();

/** Leave group, from the chat's menu or the resbite page's More (`createGroupLeave`). */
export const leaveGroup = createGroupLeave({
  leave: (series) => chatGateway.leave(series),
  sync: (scope) => syncReminders(scope),
  onScreen: () => screen?.series ?? null,
  toPlans: () => router.dismissTo("/plans"),
  left: leftGroups,
});

/** While this screen is in focus, a leave of `series` that goes through lands on My resbites from it (UI Q4). */
export function useGroupScreen(series: string | null | undefined): void {
  useFocusEffect(
    useCallback(() => {
      if (!series) return;
      const mine = { series, token: {} };
      screen = mine;
      return () => {
        if (screen?.token === mine.token) screen = null;
      };
    }, [series]),
  );
}
