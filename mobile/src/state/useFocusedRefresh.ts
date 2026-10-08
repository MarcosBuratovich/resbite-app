import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useApp } from "./AppState";

/** One run of a screen's work. It stays valid only while nothing it depends on has moved on. */
export type Run = {
  /** False once the session changed, the screen lost focus or identity, or a newer run began. */
  valid: () => boolean;
  /** Throws if the session captured when the run began has changed. */
  assertSession: () => void;
};

/**
 * The refresh scaffolding shared by the event page and the invitation claim (UX1).
 * `load` runs when the screen gains focus and whenever the app returns to the foreground;
 * losing focus or going to the background invalidates every run in flight. `load` (and any
 * other operation) calls `begin()` once its own guards pass: that captures the session and
 * starts a new run, which also invalidates any earlier one. `identity` names what the screen
 * shows (account, route and preview); a run is invalid once it changes.
 */
export function useFocusedRefresh(
  load: (begin: () => Run) => Promise<void>,
  { identity, onBackground }: { identity: string; onBackground?: () => void },
) {
  const { captureSession } = useApp();
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const focused = useRef(false),
    generation = useRef(0);
  const background = useRef(onBackground);
  background.current = onBackground;
  const begin = useCallback((): Run => {
    const assertSession = captureSession();
    const run = ++generation.current;
    const valid = () => {
      try {
        assertSession();
      } catch {
        return false;
      }
      return focused.current && currentIdentity.current === identity && generation.current === run;
    };
    return { valid, assertSession };
  }, [identity, captureSession]);
  const refresh = useCallback(() => load(begin), [load, begin]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
        else {
          background.current?.();
          ++generation.current;
        }
      });
      return () => {
        focused.current = false;
        ++generation.current;
        sub.remove();
      };
    }, [refresh]),
  );
  return { refresh, begin, focused };
}
