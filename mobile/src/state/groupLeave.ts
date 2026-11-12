import { chatErrorMessage, isNotInGroup } from "../services/chat";
import { errorField } from "../services/contactInvites";

/**
 * Groups left on this phone since My resbites last read its list (UI Q3), each the account's that left it (ruling GR6
 * M1): My resbites hides every occurrence of them until a list read that started at or after the leave succeeds
 * (GR6 M2), so a read that fails right after a leave still shows the group gone, and an invitation back shows again
 * once the server says so. Each leave is told to the listeners (My resbites reads its list again, UI Q4).
 */
export type LeftGroups = {
  note(series: string, at: number, account: string | null): void;
  hidden(series: string, account: string | null): boolean;
  /** A list read of `account`'s that started at `startedAt` succeeded: what was left by then is the server's to show. */
  settle(startedAt: number, account: string | null): void;
  /** The list without any occurrence of a group `account` left; the same list when it left none. */
  without<T extends { series_id: string }>(plans: T[], account: string | null): T[];
  listen(listener: (series: string) => void): () => void;
};

export function createLeftGroups(): LeftGroups {
  const noted = new Map<string, { at: number; account: string }>();
  const listeners = new Set<(series: string) => void>();
  const mine = (series: string, account: string | null) => account !== null && noted.get(series)?.account === account;
  return {
    note(series, at, account) {
      if (account === null) return;
      noted.set(series, { at, account });
      for (const listener of [...listeners]) listener(series);
    },
    hidden: mine,
    settle(startedAt, account) {
      // A read started in the same millisecond as the leave started after its answer: the leave's own listener starts
      // one so, and it settles the leave (re-review N2).
      for (const [series, left] of noted) if (left.account === account && left.at <= startedAt) noted.delete(series);
    },
    without: (plans, account) =>
      account === null || ![...noted.values()].some((left) => left.account === account)
        ? plans
        : plans.filter((p) => !mine(p.series_id, account)),
    listen(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type LeaveScope = { userId: string | null; preview: boolean };
/** Left, or not with the reason in words; null for a second tap while a leave of that group is on its way. */
export type LeaveResult = { left: true } | { left: false; error: string };
/** The session the leave started on is still the phone's (no sign-out, no other account): `captureSession`'s check. */
export type StillCurrent = () => boolean;

/** A refusal the server gave for certain; anything else (a lost connection, a timeout) may have gone through. */
const definite = (e: unknown) => ["42501", "22023"].includes(String(errorField(e, "code") ?? ""));

/**
 * Leave group, one path for the chat and the resbite page (G-N13, I10). `leave_series`, then, once it went through, and
 * only while the phone is still on the account that started it (ruling GR6 M1):
 * - the group is noted as left (My resbites hides it and reads its list again);
 * - the phone's reminders are synced, so this week's go with the guest row the leave took away (review I2);
 * - the group's chat no longer counts as the one in focus, so its pushes aren't held back (H36, GR6 M10);
 * - My resbites opens when the group's chat, resbite page or people list is the screen in focus, even if the person moved
 *   there from the screen they left from while the leave was on its way (UI Q4).
 * 42501 'Not in this group' is done too: after an attempt whose answer was lost, the leave went through (ruling GR4 M-2).
 * Any other failure changes nothing and is worded (`chatErrorMessage`); one whose outcome is unknown is remembered, so
 * the chat's own refused read ('Not in this chat') can finish it on the phone (`finish`, GR6 M5).
 */
export function createGroupLeave(deps: {
  leave: (series: string) => Promise<void>;
  sync: (scope: LeaveScope) => Promise<void>;
  /** The series whose chat, resbite page or people list is in focus, or null. */
  onScreen: () => string | null;
  toPlans: () => void;
  /** Clears the focused chat when it is this series'. */
  clearFocus: (series: string) => void;
  left: LeftGroups;
  now?: () => number;
}): {
  leave: (series: string, scope: LeaveScope, current?: StillCurrent) => Promise<LeaveResult | null>;
  finish: (series: string, scope: LeaveScope, current?: StillCurrent) => boolean;
} {
  const going = new Set<string>();
  const unknown = new Set<string>();
  const done = (series: string, scope: LeaveScope, current: StillCurrent) => {
    unknown.delete(series);
    if (!current()) return;
    deps.left.note(series, (deps.now ?? Date.now)(), scope.userId);
    void deps.sync(scope).catch(() => {});
    deps.clearFocus(series);
    if (deps.onScreen() === series) deps.toPlans();
  };
  return {
    async leave(series, scope, current = () => true) {
      if (going.has(series)) return null;
      going.add(series);
      try {
        try {
          await deps.leave(series);
        } catch (e) {
          if (!isNotInGroup(e)) {
            if (definite(e)) unknown.delete(series);
            else unknown.add(series);
            return { left: false, error: chatErrorMessage(e) };
          }
        }
        done(series, scope, current);
        return { left: true };
      } finally {
        going.delete(series);
      }
    },
    finish(series, scope, current = () => true) {
      if (!unknown.has(series) || going.has(series)) return false;
      done(series, scope, current);
      return true;
    },
  };
}
