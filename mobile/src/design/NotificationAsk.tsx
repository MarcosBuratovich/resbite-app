import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Copy } from "./ui";
import { InfoSheet } from "./kit";
import { NOTIFICATION_ASK } from "../domain/notifications";
import type { NotificationAskState } from "../state/useNotificationAsk";

/**
 * Plan 4: "Get notified?", the one notification ask, shown once before iPhone's own prompt (it replaced
 * UX3's "Get reminders?"). Either answer counts as asked; "Not now" never blocks anything. Used by the event
 * page, My resbites and the open link's waiting screen (useNotificationAsk).
 */
export function NotificationAsk({ ask }: { ask: NotificationAskState }) {
  return (
    <InfoSheet visible={ask.visible} title={NOTIFICATION_ASK.title} onClose={ask.notNow}>
      <Copy>{NOTIFICATION_ASK.body}</Copy>
      <View style={styles.actions}>
        <Button title={NOTIFICATION_ASK.turnOn} icon={false} onPress={ask.turnOn} />
        <Button title={NOTIFICATION_ASK.notNow} secondary icon={false} onPress={ask.notNow} />
      </View>
    </InfoSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
});
