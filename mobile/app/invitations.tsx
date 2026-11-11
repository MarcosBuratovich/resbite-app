import { ArrowLeft, Info, RefreshCw } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Copy, ErrorNote, Title, s } from "../src/design/ui";
import { fonts } from "../src/design/tokens";
import { EventLinkCard } from "../src/design/EventLinkCard";
import { EVENT_COPY } from "../src/domain/eventPage";
import { IconButton, InfoSheet } from "../src/design/kit";
import { PickStep, SendStep } from "../src/design/ContactPicker";
import { ConnectionsPicker, SectionTitle } from "../src/design/ConnectionsPicker";
import { CircleCard } from "../src/design/CircleCard";
import { PreviewNotice } from "../src/design/Chrome";
import { useApp } from "../src/state/AppState";
import { useContactInvites } from "../src/state/useContactInvites";
import { useAccount } from "../src/state/AccountState";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { useFocusedRefresh, type Run } from "../src/state/useFocusedRefresh";
import { planGateway } from "../src/services/plans";
import { readProfile } from "../src/services/profile";
import { readGuests } from "../src/services/rsvp";
import { canEditPlan, type Plan } from "../src/domain/plans";
import { firstGuestName } from "../src/domain/circle";
import { CIRCLE_COPY } from "../src/domain/circleCopy";
import { LINK_INFO, linkDate } from "../src/domain/eventLinks";

const unavailable = INVITE_COPY.hostsOnly;

/**
 * "Invite people" (/invitations?plan=<id>): a host (the owner or an admin) sets the circle of trust (CO-04), picks
 * Resbite connections (CO-03), phone contacts or adds numbers to invite, then sends each person's own link. The event
 * link (Share, Copy and Turn off) follows the contacts.
 */
export default function Invitations() {
  const { plan: planId } = useLocalSearchParams<{ plan: string }>();
  const { session, preview, localPlans } = useApp();
  const userId = session?.user.id;
  const identity = `${preview ? "preview" : (userId ?? "")}:${planId}`;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [onPlan, setOnPlan] = useState<string[]>([]);
  const [firstGuest, setFirstGuest] = useState<string>(CIRCLE_COPY.eachGuest);
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
    onPlan,
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
        // The plan read embeds the admins, who invite as the owner does. Once that no longer holds (a reload after the
        // circle card's refusal, or a return to the screen), the screen shows only the refusal.
        if (!found || !canEditPlan(found, userId, preview, Date.now(), found.admins)) {
          setPlan(null);
          throw Error(unavailable);
        }
        let name: string | null = null;
        let guests: string[] = [];
        let first: string = CIRCLE_COPY.eachGuest;
        if (!preview) {
          [name, [guests, first]] = await Promise.all([
            // The name is only for the invitation message; without it the message says "Your host".
            readProfile(userId!).then(
              (profile) => profile?.display_name?.trim() || null,
              () => null,
            ),
            // Who is on the resbite already, so their connections read "Invited". Without it every connection can
            // be picked, and the server answers "already" for those on it. The same list names the circle card's
            // first guest (CO-04), else "Each guest".
            readGuests(found.id).then(
              (list): [string[], string] => [list.map((g) => g.userId), firstGuestName(list, [found.owner_id, ...found.admins])],
              (): [string[], string] => [[], CIRCLE_COPY.eachGuest],
            ),
          ]);
          if (!valid()) return;
        }
        setPlan(found);
        setHost(name);
        setOnPlan(found.owner_id ? [found.owner_id, ...guests] : guests);
        setFirstGuest(first);
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
        {plan && !contacts.outcome && (
          <>
            {!preview && canEditPlan(plan, userId, preview, Date.now(), plan.admins) && (
              <CircleCard
                key={plan.id}
                plan={plan}
                firstGuest={firstGuest}
                onReload={() => void refresh()}
              />
            )}
            <ConnectionsPicker k={contacts} />
            {contacts.connections.length > 0 && <SectionTitle>{INVITE_COPY.phoneContacts}</SectionTitle>}
            <PickStep k={contacts} previewing={preview} />
          </>
        )}
        {plan && contacts.outcome && (
          <SendStep
            outcome={contacts.outcome}
            error={contacts.error}
            onSend={(item, via) => void contacts.send(item, via).then((m) => contacts.setError(m))}
            onDone={() => (router.canGoBack() ? router.back() : router.replace("/plans"))}
          />
        )}
        {plan && !preview && (
          <View style={styles.link}>
            <Copy accessibilityRole="header" style={styles.linkHeading}>
              {EVENT_COPY.shareLink}
            </Copy>
            <EventLinkCard plan={plan} titled={false} />
          </View>
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
  link: { gap: 12, marginTop: 8 },
  linkHeading: { fontFamily: fonts.display, fontSize: 22 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
