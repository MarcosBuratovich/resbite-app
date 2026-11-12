import { chatErrorMessage, isNotInGroup } from "../services/chat";

/**
 * Groups left on this phone since My resbites last read its list (UI Q3): it hides every occurrence of them until a list
 * read that started after the leave succeeds, so a read that fails right after a leave still shows the group gone, and
 * an invitation back shows again once the server says so. Each leave is told to the listeners (My resbites reads its list
 * again, UI Q4).
 */
export type LeftGroups = {
  note(series: string, at: number): void;
  hidden(series: string): boolean;
  /** A list read that started at `startedAt` succeeded: what was left before it is the server's to show now. */
  settle(startedAt: number): void;
  /** The list without any occurrence of a group left; the same list when none was. */
  without<T extends { series_id: string }>(plans: T[]): T[];
  listen(listener: (series: string) => void): () => void;
};

export function createLeftGroups(): LeftGroups {
  const noted = new Map<string, number>();
  const listeners = new Set<(series: string) => void>();
  return {
    note(series, at) {
      noted.set(series, at);
      for (const listener of [...listeners]) listener(series);
    },
    hidden: (series) => noted.has(series),
    settle(startedAt) {
      for (const [series, at] of noted) if (at < startedAt) noted.delete(series);
    },
    without: (plans) => (noted.size === 0 ? plans : plans.filter((p) => !noted.has(p.series_id))),
    listen(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type LeaveScope = { userId: string | null; preview: boolean };
/** Left, or not with the reason in words; null for a second tap while a leave of that group is on its way. */
export type LeaveResult = { left: true } | { left: false; error: string };

/**
 * Leave group, one path for the chat and the resbite page (G-N13, I10). `leave_series`, then, once it went through:
 * - the group is noted as left (My resbites hides it and reads its list again);
 * - the phone's reminders are synced, so this week's go with the guest row the leave took away (review I2);
 * - My resbites opens, when the group's chat or resbite page is the screen in focus, even if the person moved there
 *   from the screen they left from while the leave was on its way (UI Q4).
 * 42501 'Not in this group' is done too: after an attempt whose answer was lost, the leave went through (ruling GR4 M-2).
 * Any other failure changes nothing and is worded (`chatErrorMessage`). It runs to its end whatever screen is left.
 */
export function createGroupLeave(deps: {
  leave: (series: string) => Promise<void>;
  sync: (scope: LeaveScope) => Promise<void>;
  /** The series whose chat or resbite page is in focus, or null. */
  onScreen: () => string | null;
  toPlans: () => void;
  left: LeftGroups;
  now?: () => number;
}): (series: string, scope: LeaveScope) => Promise<LeaveResult | null> {
  const going = new Set<string>();
  return async (series, scope) => {
    if (going.has(series)) return null;
    going.add(series);
    try {
      try {
        await deps.leave(series);
      } catch (e) {
        if (!isNotInGroup(e)) return { left: false, error: chatErrorMessage(e) };
      }
      deps.left.note(series, (deps.now ?? Date.now)());
      void deps.sync(scope).catch(() => {});
      if (deps.onScreen() === series) deps.toPlans();
      return { left: true };
    } finally {
      going.delete(series);
    }
  };
}
