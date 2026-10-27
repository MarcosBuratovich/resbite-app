import { Copy as CopyIcon, Link2Off, RefreshCw, Share2 } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Share, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, ErrorNote, Title, s } from "./ui";
import { Chip, IconButton } from "./kit";
import { colors as c } from "./tokens";
import { buildEventLink } from "../domain/appLinks";
import { shareMessage, TURN_OFF_MESSAGE, TURN_OFF_TITLE } from "../domain/eventLinks";
import { INVITE_COPY } from "../domain/inviteCopy";
import { invitationGateway } from "../services/invitations";

/**
 * GI1 / open-link approval: the event's one link, on the event page. Share, Copy and Turn off act on it. The
 * code is read from the database when the card opens and after a failed turn-off, and never stored on the device.
 */
export function EventLinkCard({ plan }: { plan: { id: string; title: string; starts_at: string; ends_at?: string | null } }) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  // Only the latest request may set state, and nothing after the card closes.
  const run = useRef(0);
  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  const load = useCallback(async () => {
    const mine = ++run.current;
    setLoading(true);
    setError(null);
    try {
      const next = await invitationGateway.link(plan.id);
      if (run.current === mine) setCode(next);
    } catch (e) {
      if (run.current === mine) {
        setCode(null);
        setError(e instanceof Error ? e.message : "Couldn’t load the link. Check your connection and try again.");
      }
    } finally {
      if (run.current === mine) setLoading(false);
    }
  }, [plan.id]);
  useEffect(() => {
    setNotice("");
    void load();
  }, [load]);

  const link = code ? buildEventLink(code, process.env.EXPO_PUBLIC_INVITATION_ORIGIN) : null;

  async function share() {
    if (!link) return;
    setError(null);
    setNotice("");
    try {
      await Share.share({ message: shareMessage(plan, link) });
    } catch {
      // Closing the share sheet is not a failure; the link stays as it is.
    }
  }
  async function copy() {
    if (!link) return;
    setError(null);
    setNotice("");
    let copied = false;
    try {
      copied = await Clipboard.setStringAsync(link);
    } catch {
      copied = false;
    }
    if (copied) setNotice("Link copied.");
    else setError("Couldn’t copy the link. Use Share instead.");
  }
  async function turnOff() {
    if (busy) return;
    const mine = ++run.current;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const next = await invitationGateway.rotate(plan.id);
      if (run.current !== mine) return;
      setCode(next);
      setNotice("The old link is off. Share this new link.");
    } catch (e) {
      if (run.current !== mine) return;
      setError(e instanceof Error ? e.message : "Couldn’t confirm the link was turned off.");
      // Whether or not it was turned off, show the link that works now (or none, until Try again).
      const current = await invitationGateway.link(plan.id).catch(() => null);
      if (run.current === mine) setCode(current);
    } finally {
      setBusy(false);
    }
  }
  function confirmTurnOff() {
    if (Platform.OS === "web") {
      if (window.confirm(`${TURN_OFF_TITLE}\n\n${TURN_OFF_MESSAGE}`)) void turnOff();
    } else
      Alert.alert(TURN_OFF_TITLE, TURN_OFF_MESSAGE, [
        { text: "Keep", style: "cancel" },
        { text: "Turn off", style: "destructive", onPress: () => void turnOff() },
      ]);
  }

  return (
    <View style={{ gap: 10 }}>
      <Title style={{ fontSize: 23 }}>{INVITE_COPY.eventLink}</Title>
      <Copy style={s.muted}>{INVITE_COPY.linkInfoLine}</Copy>
      <ErrorNote message={error} />
      {!!notice && (
        <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
          {notice}
        </Copy>
      )}
      {loading && !link && <Copy accessibilityLiveRegion="polite">Loading the link…</Copy>}
      <View style={styles.chips}>
        <Chip icon={Share2} tone="aqua" text="Share" label="Share link" disabled={!link || busy} onPress={() => void share()} />
        <Chip icon={CopyIcon} tone="aqua" text="Copy link" disabled={!link || busy} onPress={() => void copy()} />
        <Chip icon={Link2Off} tone="pink" text="Turn off this link" disabled={!link || busy} onPress={confirmTurnOff} />
      </View>
      {!loading && !link && <IconButton icon={RefreshCw} label="Try again" busy={busy} onPress={() => void load()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
});
