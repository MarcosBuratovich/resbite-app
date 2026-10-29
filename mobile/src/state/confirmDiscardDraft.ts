import { Alert, Platform } from "react-native";

/** Asks before deleting a draft from this device, then calls `discard` (My resbites' draft tiles). */
export function confirmDiscardDraft(discard: () => void) {
  const message = "Delete this draft from this device?";
  if (Platform.OS === "web") {
    if (window.confirm(message)) discard();
  } else
    Alert.alert("Discard draft?", message, [
      { text: "Keep draft", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: discard },
    ]);
}
