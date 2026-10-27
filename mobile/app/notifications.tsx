import React, { useCallback, useRef, useState } from "react";
import { AppState, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Bell, BellOff, CalendarHeart, Info, RefreshCw, Settings, Smartphone } from "lucide-react-native";
import { useApp } from "../src/state/AppState";
import { Back, Copy, ErrorNote, Title, s } from "../src/design/ui";
import { Chip, IconButton, InfoSheet, RowGroup, StatusCard, SwitchRow } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { colors as c } from "../src/design/tokens";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATIONS_TURN_ON_FAILED,
  notificationDelivery,
  notificationEventsLead,
  permissionDetail,
  reminderCopy,
  UPDATES_ACTIONS,
  updatesChip,
  type NotificationPermission,
  type UpdatesAction,
} from "../src/domain/notifications";
import { REMINDERS_CHANGE_FAILED } from "../src/domain/eventDevice";
import {
  openNotificationSettings,
  readNotificationPermission,
} from "../src/services/notifications";
import { askForReminders, remindersFor, setRemindersEnabled } from "../src/services/deviceReminders";
import { permissionChip } from "../src/domain/accountCopy";
import { usePushRegistration } from "../src/state/usePushRegistration";
import { deviceMirror } from "../src/services/deviceMirror";

export default function Notifications() {
  const { preview, session, captureSession } = useApp();
  const { pushStatus, reconcilePush } = usePushRegistration();
  // Plan 4: whether this build sends updates (EXPO_PUBLIC_PUSH_ENABLED).
  const delivery = notificationDelivery.enabled;
  const identity = preview ? "preview" : (session?.user.id ?? "signed-out");
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState(false);
  // UX3 "Event reminders": this phone's switch for the person's reminders (null until read).
  const [reminders, setReminders] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  const reminderScope = { userId: session?.user.id ?? null, preview };
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
      setReminders(null);
      void remindersFor({ userId: session?.user.id ?? null, preview }).then(
        (prefs) => {
          if (active && currentIdentity.current === identity) setReminders(prefs.enabled);
        },
        () => {},
      );
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
  const detail = permission ? permissionDetail(permission, delivery) : null;
  const permissionTitle = permissionChip(permission, busy);
  // Plan 4: the Updates card shows the real state, and the one button that changes it.
  // QA seam (browser only, development builds): expo web can't register for push, so a script sets the state.
  const qa = Platform.OS === "web" ? deviceMirror()?.updates : undefined;
  const updates = updatesChip({
    enabled: qa ? qa.delivery : delivery,
    permission: qa ? qa.permission : permission,
    push: qa ? qa.push : pushStatus,
  });
  const [acting, setActing] = useState(false);
  const openSettings = async () => {
    try {
      await openNotificationSettings(preview);
    } catch {
      if (focused.current && currentIdentity.current === identity)
        setError(
          "Couldn’t open device settings. Please open Settings on your phone.",
        );
    }
  };
  async function act(action: UpdatesAction) {
    if (action === "settings") return void openSettings();
    if (acting) return;
    setActing(true);
    setError(null);
    try {
      // "Turn on notifications": iPhone's prompt, as the ask does (reminders too), then registers this phone.
      if (action === "turn-on")
        await askForReminders(reminderScope).finally(() => reconcilePush());
      else await reconcilePush();
    } catch {
      if (focused.current && currentIdentity.current === identity) setError(NOTIFICATIONS_TURN_ON_FAILED);
    } finally {
      setActing(false);
      // The permission may have changed: read it again.
      refresh.current();
    }
  }
  async function switchReminders(on: boolean) {
    if (switching) return;
    setSwitching(true);
    setError(null);
    setReminders(on);
    try {
      const prefs = await setRemindersEnabled(reminderScope, on, captureSession());
      if (focused.current && currentIdentity.current === identity) setReminders(prefs.enabled);
    } catch {
      if (focused.current && currentIdentity.current === identity) {
        setReminders(!on);
        setError(REMINDERS_CHANGE_FAILED);
      }
    } finally {
      setSwitching(false);
    }
  }
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice />
        <Back label="Profile" />
        <View style={styles.header}>
          <Title style={{ flexShrink: 1 }}>Notifications</Title>
          <IconButton icon={Info} label="About notifications" onPress={() => setAbout(true)} />
        </View>
        {/* UX3: reminders are set on this phone. Plan 4: updates follow the build's push switch and this phone. */}
        <View style={styles.group}>
          <RowGroup>
            <SwitchRow
              title="Event reminders"
              icon={Bell}
              value={reminders ?? false}
              disabled={reminders === null || switching}
              onValueChange={(on) => void switchReminders(on)}
            />
          </RowGroup>
          <Copy style={styles.hint}>{reminderCopy.line}</Copy>
        </View>
        <StatusCard icon={updates.on ? Bell : BellOff} title="Updates">
          <View style={styles.chips}>
            <Chip text={updates.text} />
            {updates.action && (
              <Chip
                text={UPDATES_ACTIONS[updates.action].text}
                icon={updates.action === "settings" ? Settings : updates.action === "retry" ? RefreshCw : Bell}
                tone={updates.action === "settings" ? undefined : "aqua"}
                label={UPDATES_ACTIONS[updates.action].label}
                disabled={updates.action !== "settings" && (acting || busy)}
                onPress={() => void act(updates.action!)}
              />
            )}
          </View>
        </StatusCard>
        <View style={styles.chips}>
          <Chip
            text={permissionTitle}
            icon={Smartphone}
            tone="status"
            label={`Phone permission: ${permissionTitle}`}
          />
        </View>
        {detail && <Copy style={styles.line}>{detail}</Copy>}
        <ErrorNote message={error} />
        <View style={styles.chips}>
          {!preview && Platform.OS !== "web" && (
            <Chip
              text="Check again"
              icon={RefreshCw}
              tone="aqua"
              hint="Checks the phone’s notification permission again."
              disabled={busy}
              onPress={() => {
                refresh.current();
                // The Updates chip follows this phone's registration too.
                if (delivery) void reconcilePush();
              }}
            />
          )}
          {/* Not twice: the Updates card already offers Settings when updates are off there. */}
          {!preview &&
            !!session &&
            permission &&
            updates.action !== "settings" &&
            !["undetermined", "unsupported", "preview"].includes(
              permission,
            ) && (
              <Chip
                text="Settings"
                icon={Settings}
                label="Open device settings"
                onPress={() => void openSettings()}
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
        {!delivery && <Copy>{notificationDelivery.label}</Copy>}
        {!delivery && <Copy>{notificationDelivery.detail}</Copy>}
        <Copy>{notificationEventsLead(delivery)}</Copy>
        {NOTIFICATION_EVENTS.map((line) => (
          <Copy key={line}>{line}</Copy>
        ))}
        <Copy>{reminderCopy.about}</Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  line: { textAlign: "center", color: c.muted },
  group: { gap: 10 },
  hint: { fontSize: 14, color: c.muted, marginHorizontal: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
});
