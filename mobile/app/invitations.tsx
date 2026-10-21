import { ArrowLeft, Copy as CopyIcon, Info, Link2Off, RefreshCw, Share2 } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, Platform, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Copy, ErrorNote, Title, s } from "../src/design/ui";
import { Chip, CoverCard, IconButton, InfoSheet } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { colors as c } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
import { useCoverUri } from "../src/state/useCoverUri";
import { useFocusedRefresh, type Run } from "../src/state/useFocusedRefresh";
import { planGateway } from "../src/services/plans";
import { readProfile } from "../src/services/profile";
import { invitationGateway } from "../src/services/invitations";
import { buildEventLink } from "../src/domain/appLinks";
import { canEditPlan, type Plan } from "../src/domain/plans";
import { eventPicture } from "../src/domain/events";
import { LINK_INFO, shareMessage, TURN_OFF_MESSAGE, TURN_OFF_TITLE } from "../src/domain/eventLinks";

const unavailable = "Only the organizer can invite people to an upcoming, active resbite.";

/**
 * GI1 "Invite people" (/invitations?plan=<id>): the event's one link. A card shows what guests see before
 * they reply; Share, Copy link and Turn off this link act on the link. The code is read from the database
 * on open, on focus and after a failed turn-off, and never stored on this device.
 */
export default function Invitations() {
  const { plan: planId } = useLocalSearchParams<{ plan: string }>();
  const { session, preview, localPlans } = useApp();
  const userId = session?.user.id;
  const identity = `${preview ? "preview" : (userId ?? "")}:${planId}`;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [about, setAbout] = useState(false);
  const coverUri = useCoverUri(plan?.cover_path ?? null);

  const load = useCallback(
    async (begin: () => Run) => {
      const { valid } = begin();
      setLoading(true);
      setError(null);
      try {
        if (!planId || (!preview && !userId)) throw Error(unavailable);
        let found: Plan | null | undefined;
        try {
          found = preview ? localPlans.find((p) => p.id === planId) : await planGateway.read(planId);
        } catch {
          throw Error("Couldn’t load this resbite. Check your connection and try again.");
        }
        if (!valid()) return;
        if (!found || !canEditPlan(found, userId, preview)) throw Error(unavailable);
        let next: string | null = null;
        let name: string | null = null;
        if (!preview) {
          [next, name] = await Promise.all([
            invitationGateway.link(found.id),
            // The name is only for the card; without it the card says "Invited by you".
            readProfile(userId!).then(
              (profile) => profile?.display_name?.trim() || null,
              () => null,
            ),
          ]);
          if (!valid()) return;
        }
        setPlan(found);
        setHost(name);
        setCode(next);
      } catch (e) {
        if (valid()) {
          setCode(null);
          setError(e instanceof Error ? e.message : "Couldn’t load the link. Check your connection and try again.");
        }
      } finally {
        if (valid()) setLoading(false);
      }
    },
    [planId, preview, userId, localPlans],
  );
  const { refresh, begin } = useFocusedRefresh(load, { identity });

  const link = code ? buildEventLink(code, process.env.EXPO_PUBLIC_INVITATION_ORIGIN) : null;

  async function share() {
    if (!plan || !link) return;
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
    if (!plan || busy) return;
    const { valid } = begin();
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const next = await invitationGateway.rotate(plan.id);
      if (!valid()) return;
      setCode(next);
      setNotice("The old link is off. Share this new link.");
    } catch (e) {
      if (!valid()) return;
      setError(e instanceof Error ? e.message : "Couldn’t confirm the link was turned off.");
      // Whether or not it was turned off, show the link that works now (or none, until Try again).
      const current = await invitationGateway.link(plan.id).catch(() => null);
      if (valid()) setCode(current);
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
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <View style={styles.top}>
          <IconButton
            icon={ArrowLeft}
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/plans"))}
          />
          <PreviewNotice dismissible={false} />
          <IconButton icon={Info} label="About invitation links" onPress={() => setAbout(true)} />
        </View>
        <Title>Invite people</Title>
        {plan && (
          <CoverCard
            heading={false}
            picture={eventPicture(plan)}
            uri={coverUri}
            pictureLabel={plan.cover_description}
            title={plan.title}
            startsAt={plan.starts_at}
            endsAt={plan.ends_at}
            // Guests see the area, never the exact place, before they reply.
            place={plan.area?.trim() || null}
            byline={`Invited by ${host ?? "you"}`}
          />
        )}
        {plan && <Copy style={s.muted}>This is what people see before they reply.</Copy>}
        {preview && plan && (
          <Copy>Preview can’t share invitation links. Real links need an approved tester account.</Copy>
        )}
        <ErrorNote message={error} />
        {!!notice && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {notice}
          </Copy>
        )}
        {loading && !plan && <Copy accessibilityLiveRegion="polite">Loading the link…</Copy>}
        {!preview && plan && (
          <View style={styles.chips}>
            <Chip
              icon={Share2}
              tone="aqua"
              text="Share"
              label="Share link"
              disabled={!link || busy}
              onPress={() => void share()}
            />
            <Chip icon={CopyIcon} tone="aqua" text="Copy link" disabled={!link || busy} onPress={() => void copy()} />
            <Chip
              icon={Link2Off}
              tone="pink"
              text="Turn off this link"
              disabled={!link || busy}
              onPress={confirmTurnOff}
            />
          </View>
        )}
        {!loading && !preview && (!plan || !link) && (
          <IconButton icon={RefreshCw} label="Try again" busy={busy} onPress={() => void refresh()} />
        )}
      </ScrollView>
      <InfoSheet visible={about} title="Invitation links" onClose={() => setAbout(false)}>
        {LINK_INFO.map((line, i) => (
          <Copy key={line} style={i > 0 ? s.muted : undefined}>
            {line}
          </Copy>
        ))}
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
});
