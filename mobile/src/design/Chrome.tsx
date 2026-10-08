import React, { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { Eye } from "lucide-react-native";
import { Button, Copy } from "./ui";
import { Chip, InfoSheet } from "./kit";
import { useApp } from "../state/AppState";

/** Preview mode as a small header chip. Its sheet explains preview and offers Exit preview (spec "Preview mode"). */
export function PreviewNotice({ dismissible = true }: { dismissible?: boolean }) {
  const { preview, signOut } = useApp();
  const [open, setOpen] = useState(false);
  if (!preview) return null;
  return (
    <View style={{ alignSelf: "flex-start" }}>
      <Chip
        icon={Eye}
        tone="aqua"
        text="Preview"
        label="Preview mode"
        hint="Explains preview mode"
        onPress={() => setOpen(true)}
      />
      <InfoSheet visible={open} title="Preview" onClose={() => setOpen(false)}>
        <Copy>Actions stay on this device.</Copy>
        {dismissible && (
          <Button
            title="Exit preview"
            secondary
            onPress={async () => {
              setOpen(false);
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
          />
        )}
      </InfoSheet>
    </View>
  );
}
