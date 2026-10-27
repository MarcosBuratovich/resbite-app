import { Check, X } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Copy, ErrorNote, Title, s } from "./ui";
import { Chip } from "./kit";
import { responseText } from "../domain/eventView";
import { INVITE_COPY, requestDetail } from "../domain/inviteCopy";
import type { HostRequest } from "../services/joinRequests";

/** Open-link approval: people who answered through the event link and wait for the host. */
export function WaitingForYou({
  requests,
  deciding,
  disabled,
  error,
  onApprove,
  onDecline,
}: {
  requests: readonly HostRequest[];
  /** The user whose decision is in flight. */
  deciding: string | null;
  disabled: boolean;
  error: string | null;
  onApprove: (request: HostRequest) => void;
  onDecline: (request: HostRequest) => void;
}) {
  if (requests.length === 0) return null;
  const off = disabled || deciding !== null;
  return (
    <View style={{ gap: 10 }}>
      <Title style={{ fontSize: 23 }}>{INVITE_COPY.waitingForYou}</Title>
      <ErrorNote message={error} />
      {requests.map((r) => {
        return (
          <View key={r.user_id} style={styles.row}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Copy>{r.name}</Copy>
              <Copy style={s.muted}>{requestDetail(responseText(r.response), r.ending)}</Copy>
            </View>
            <View style={styles.actions}>
              <Chip
                icon={Check}
                tone="aqua"
                text={INVITE_COPY.approve}
                label={INVITE_COPY.approveLabel(r.name)}
                hint={INVITE_COPY.approveHint}
                disabled={off}
                onPress={() => onApprove(r)}
              />
              <Chip
                icon={X}
                tone="pink"
                text={INVITE_COPY.decline}
                label={INVITE_COPY.declineLabel(r.name)}
                hint={INVITE_COPY.declineHint}
                disabled={off}
                onPress={() => onDecline(r)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, minHeight: 44 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginLeft: "auto" },
});
