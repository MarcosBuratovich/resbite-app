import React from "react";
import { View, Pressable, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { Copy } from "./ui";
import { colors as c } from "./tokens";
import { useApp } from "../state/AppState";
export function PreviewNotice({
  dismissible = true,
}: {
  dismissible?: boolean;
}) {
  const { preview, signOut } = useApp();
  if (!preview) return null;
  return (
    <View style={styles.preview}>
      <Copy style={{ fontSize: 11, color: c.aquaDark, flex: 1 }}>
        Design preview · actions stay on this device
      </Copy>
      {dismissible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exit preview"
          hitSlop={10}
          onPress={async () => {
            try {
              await signOut();
              router.replace("/");
            } catch {
              Alert.alert(
                "Couldn’t leave preview",
                "Please try again so local groups can be cleared.",
              );
            }
          }}
        >
          <X size={16} color={c.aquaDark} />
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  preview: {
    backgroundColor: c.aquaSoft,
    paddingHorizontal: 20,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
  },
});
