import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useApp } from "./AppState";
import { activities } from "../services/catalogue";
import { readPublishedCatalogue } from "../services/liveCatalogue";
import type { Activity } from "../domain/rules";

type Snapshot = {
  key: string;
  items: Activity[];
  loading: boolean;
  error: string | null;
};

export function useCatalogue(activityId?: string, enabled = true) {
  const { preview, session, captureSession, signingOut } = useApp();
  const accountId = session?.user.id ?? "";
  const key = `${preview ? "preview" : accountId}:${activityId ?? "*"}:${enabled}`;
  const identity = useRef(key);
  identity.current = key;
  const focused = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    key: "",
    items: [],
    loading: true,
    error: null,
  });
  const refresh = useCallback(async () => {
    pending.current?.abort();
    pending.current = null;
    if (preview || !accountId || signingOut || !enabled || !focused.current)
      return;
    const controller = new AbortController();
    pending.current = controller;
    const assertSession = captureSession();
    const isCurrent = () =>
      identity.current === key &&
      pending.current === controller &&
      focused.current;
    setSnapshot({ key, items: [], loading: true, error: null });
    try {
      const items = await readPublishedCatalogue({
        accountId,
        activityId,
        signal: controller.signal,
        assertCurrent: () => {
          assertSession();
          if (!isCurrent()) throw Error("Activity check interrupted.");
        },
      });
      if (isCurrent()) setSnapshot({ key, items, loading: false, error: null });
    } catch {
      if (isCurrent())
        setSnapshot({
          key,
          items: [],
          loading: false,
          error:
            "We couldn’t load the activities. Check your connection and try again.",
        });
    }
  }, [
    key,
    preview,
    accountId,
    signingOut,
    enabled,
    activityId,
    captureSession,
  ]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();
      let previous = AppState.currentState;
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active" && previous !== "active") void refresh();
        previous = next;
      });
      return () => {
        focused.current = false;
        subscription.remove();
        pending.current?.abort();
        pending.current = null;
      };
    }, [refresh]),
  );
  if (preview)
    return {
      items:
        activityId === undefined
          ? activities
          : activities.filter((item) => item.id === activityId),
      loading: false,
      error: null,
      refresh,
    };
  if (!enabled) return { items: [], loading: false, error: null, refresh };
  return {
    ...(snapshot.key === key
      ? snapshot
      : { items: [], loading: true, error: null }),
    refresh,
  };
}
