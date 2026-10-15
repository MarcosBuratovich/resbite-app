import React, { useCallback, useRef, useState } from "react";
import { AppState, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { BellOff, CalendarHeart, Info, RefreshCw, Settings, Smartphone } from "lucide-react-native";
import { useApp } from "../src/state/AppState";
import { Back, Copy, ErrorNote, Title, s } from "../src/design/ui";
import { Chip, IconButton, InfoSheet, StatusCard } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { colors as c } from "../src/design/tokens";
import {
  notificationDelivery,
  permissionCopy,
  type NotificationPermission,
} from "../src/domain/notifications";
import {
  openNotificationSettings,
  readNotificationPermission,
} from "../src/services/notifications";
import { permissionChip } from "../src/domain/accountCopy";

export default function Notifications() {
  const { preview, session } = useApp();
  const identity = preview ? "preview" : (session?.user.id ?? "signed-out");
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState(false);
  const refresh = useRef<() => void>(() => {});
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      let active = true;
      let revision = 0;
      const read = async () => {
        const request = ++revision;
        setBusy(true);
        setPermission(null);
        setError(null);
        try {
          const next = await readNotificationPermission(preview || !session);
          if (
            active &&
            request === revision &&
            currentIdentity.current === identity
          )
            setPermission(next);
        } catch {
          if (
            active &&
            request === revision &&
            currentIdentity.current === identity
          )
            setError(
              "Couldn’t check notification permission. Please try again.",
            );
        } finally {
          if (
            active &&
            request === revision &&
            currentIdentity.current === identity
          )
            setBusy(false);
        }
      };
      refresh.current = () => void read();
      void read();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void read();
      });
      return () => {
        active = false;
        focused.current = false;
        refresh.current = () => {};
        subscription.remove();
      };
    }, [identity, preview, session]),
  );
  const copy = permission ? permissionCopy[permission] : null;
  const permissionTitle = permissionChip(permission, busy);
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice />
        <Back label="Profile" />
        <View style={styles.header}>
          <Title style={{ flexShrink: 1 }}>Notifications</Title>
          <IconButton icon={Info} label="About notifications" onPress={() => setAbout(true)} />
        </View>
        <StatusCard icon={BellOff} title="Not active yet">
          <Chip
            text={permissionTitle}
            icon={Smartphone}
            tone="status"
            label={`Phone permission: ${permissionTitle}`}
          />
          {copy && <Copy style={styles.line}>{copy.detail}</Copy>}
        </StatusCard>
        <ErrorNote message={error} />
        <View style={styles.chips}>
          {!preview && Platform.OS !== "web" && (
            <Chip
              text="Check again"
              icon={RefreshCw}
              tone="aqua"
              label="Check permission again"
              disabled={busy}
              onPress={() => refresh.current()}
            />
          )}
          {!preview &&
            !!session &&
            permission &&
            !["undetermined", "unsupported", "preview"].includes(
              permission,
            ) && (
              <Chip
                text="Settings"
                icon={Settings}
                label="Open device settings"
                onPress={async () => {
                  try {
                    await openNotificationSettings(preview);
                  } catch {
                    if (focused.current && currentIdentity.current === identity)
                      setError(
                        "Couldn’t open device settings. Please open Settings on your phone.",
                      );
                  }
                }}
              />
            )}
          <Chip
            text="My resbites"
            icon={CalendarHeart}
            label="Open My resbites"
            onPress={() => router.navigate("/plans")}
          />
        </View>
      </ScrollView>
      <InfoSheet visible={about} title="About notifications" onClose={() => setAbout(false)}>
        <Copy>{notificationDelivery.label}</Copy>
        <Copy>{notificationDelivery.detail}</Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  line: { textAlign: "center", color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
});
