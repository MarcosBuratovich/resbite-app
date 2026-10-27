import { ArrowLeft, Info, RefreshCw } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Copy, ErrorNote, Title, s } from "../src/design/ui";
import { IconButton, InfoSheet } from "../src/design/kit";
import { PickStep, SendStep } from "../src/design/ContactPicker";
import { PreviewNotice } from "../src/design/Chrome";
import { useApp } from "../src/state/AppState";
import { useContactInvites } from "../src/state/useContactInvites";
import { useAccount } from "../src/state/AccountState";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { useFocusedRefresh, type Run } from "../src/state/useFocusedRefresh";
import { planGateway } from "../src/services/plans";
import { readProfile } from "../src/services/profile";
import { canEditPlan, type Plan } from "../src/domain/plans";
import { LINK_INFO, linkDate } from "../src/domain/eventLinks";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const { user } = useAccount();
  const contacts = useContactInvites({
    planId,
    scope: preview ? undefined : userId,
    userPhone: user?.phone,
    message: {
      host: host ?? INVITE_COPY.hostFallback,
      title: plan?.title.trim() ?? "",
      when: plan ? linkDate(plan.starts_at, plan.ends_at) : "",
    },
    enabled: !preview && !!plan,
  });

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
        let name: string | null = null;
        if (!preview) {
          // The name is only for the invitation message; without it the message says "Your host".
          name = await readProfile(userId!).then(
            (profile) => profile?.display_name?.trim() || null,
            () => null,
          );
          if (!valid()) return;
        }
        setPlan(found);
        setHost(name);
      } catch (e) {
        if (valid()) {
          setError(e instanceof Error ? e.message : "Couldn’t load this resbite. Check your connection and try again.");
        }
      } finally {
        if (valid()) setLoading(false);
      }
    },
    [planId, preview, userId, localPlans],
  );
  const { refresh } = useFocusedRefresh(load, { identity });

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
        <Title>{contacts.outcome ? INVITE_COPY.almostHeading : INVITE_COPY.heading}</Title>
        {plan && !contacts.outcome && <PickStep k={contacts} previewing={preview} />}
        {plan && contacts.outcome && (
          <SendStep
            outcome={contacts.outcome}
            error={contacts.error}
            onSend={(item, via) => void contacts.send(item, via).then((m) => contacts.setError(m))}
            onDone={() => (router.canGoBack() ? router.back() : router.replace("/plans"))}
          />
        )}
        <ErrorNote message={error} />
        {loading && !plan && <Copy accessibilityLiveRegion="polite">Loading this resbite…</Copy>}
        {!loading && !preview && !plan && (
          <IconButton icon={RefreshCw} label="Try again" busy={loading} onPress={() => void refresh()} />
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
 });
