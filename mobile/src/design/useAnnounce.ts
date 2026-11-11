import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { announcement } from "../domain/circle";

/**
 * Says a line aloud when it appears or changes (C23). Only on iPhone: VoiceOver ignores `accessibilityLiveRegion`, which
 * Android's TalkBack reads by itself (announcing there too would say it twice), and the web has no announcer.
 */
export function useAnnounce(line: string | null | undefined) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const next = line || null;
    const say = announcement(last.current, next);
    last.current = next;
    if (say && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(say);
  }, [line]);
}
