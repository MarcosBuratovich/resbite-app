import React, { useCallback, useRef, useState } from "react";
import { AppState, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { BellOff } from "lucide-react-native";
import { useApp } from "../src/state/AppState";
import { Back, Button, Copy, ErrorNote, Title, s } from "../src/design/ui";
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
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice />
        <Back label="Profile" />
        <Copy style={{ color: c.aquaDark }}>YOUR PREFERENCES</Copy>
        <Title>Notifications</Title>
        <View
          style={[
            s.card,
            { padding: 22, gap: 14, backgroundColor: c.aquaSoft },
          ]}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <BellOff size={28} color={c.aquaDark} />
          </View>
          <Title style={{ fontSize: 24 }}>{notificationDelivery.label}</Title>
          <Copy>{notificationDelivery.detail}</Copy>
        </View>
        <View style={[s.card, { padding: 22, gap: 12 }]}>
          <Copy style={s.muted}>DEVICE PERMISSION</Copy>
          <Title style={{ fontSize: 23 }}>
            {copy?.title ??
              (busy ? "Checking permission…" : "Couldn’t check permission")}
          </Title>
          {copy && <Copy>{copy.detail}</Copy>}
          <ErrorNote message={error} />
          {!preview && Platform.OS !== "web" && (
            <Button
              title="Check permission again"
              secondary
              loading={busy}
              onPress={() => refresh.current()}
            />
          )}
          {!preview &&
            !!session &&
            permission &&
            !["undetermined", "unsupported", "preview"].includes(
              permission,
            ) && (
              <Button
                title="Open device settings"
                secondary
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
        </View>
        <Button
          title="Open My resbites"
          onPress={() => router.navigate("/plans")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
