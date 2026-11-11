import { ArrowLeft, Info, RefreshCw } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { readGuests, UNNAMED_GUEST } from "../src/services/rsvp";
import { canEditPlan, type Plan } from "../src/domain/plans";
import { firstGuestName, firstName } from "../src/domain/circle";
import { CIRCLE_COPY } from "../src/domain/circleCopy";
import { messageFor } from "../src/domain/contactInvites";
import { LINK_INFO, linkDate } from "../src/domain/eventLinks";
import { circleGateway, type Allowance } from "../src/services/circle";
import { errorField } from "../src/services/contactInvites";

const unavailable = INVITE_COPY.hostsOnly;
const loadFailed = "Couldn’t load this resbite. Check your connection and try again.";
/** The allowance of someone the server doesn't count as invited (42501 'Not invited'): nothing to bring. */
const NOTHING: Allowance = { allowed: 0, used: 0, remaining: 0, level: 0, mayBring: false };

/**
 * "Invite people" (/invitations?plan=<id>): a host (the owner or an admin) sets the circle of trust (CO-04), picks
 * Resbite connections (CO-03), phone contacts or adds numbers to invite, then sends each person's own link. The event
 * link (Share, Copy and Turn off) follows the contacts.
 *
 * Bring mode (CO-06, `&bring=1`, from the resbite page's Bring someone row): a guest the host's circle trusts picks
 * connections and phone contacts the same way, up to the invites left, with no circle card and no event link; each
 * link's message names them and the organizer (CO-P9). A host ignores `bring`; anyone else without it is refused.
 */
export default function Invitations() {
  const { plan: planId, bring } = useLocalSearchParams<{ plan: string; bring?: string }>();
  const { session, preview, localPlans } = useApp();
  const userId = session?.user.id;
  const bringAsked = bring === "1";
  const identity = `${preview ? "preview" : (userId ?? "")}:${planId}`;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mode, setMode] = useState<"host" | "bring">(bringAsked ? "bring" : "host");
  /** This account's own name, for the links' message; null when it couldn't be read. */
  const [own, setOwn] = useState<string | null>(null);
  /** Bring mode: the organizer's first name, else "Your host"; and what this guest may bring. */
  const [organizer, setOrganizer] = useState<string>(INVITE_COPY.hostFallback);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [onPlan, setOnPlan] = useState<string[]>([]);
  const [firstGuest, setFirstGuest] = useState<string>(CIRCLE_COPY.eachGuest);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const { user } = useAccount();
  const bringing = mode === "bring";
  /** Bring mode with invites left: the pickers show, capped at what is left. */
  const canBring = bringing && !!allowance?.mayBring && allowance.remaining > 0;
  const contacts = useContactInvites({
    planId,
    scope: preview ? undefined : userId,
    userPhone: user?.phone,
    message: messageFor({
      own,
      organizer: bringing ? organizer : undefined,
      title: plan?.title.trim() ?? "",
      when: plan ? linkDate(plan.starts_at, plan.ends_at) : "",
    }),
    enabled: !preview && !!plan && (!bringing || canBring),
    onPlan,
    limit: bringing ? (allowance?.remaining ?? 0) : undefined,
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
          throw Error(loadFailed);
        }
        if (!valid()) return;
        if (!found) {
          setPlan(null);
          throw Error(unavailable);
        }
        // Bring mode, for anyone but a host (the owner or an admin), who gets host mode whatever `bring` says.
        const hosting = preview || found.owner_id === userId || found.admins.includes(userId ?? "");
        if (bringAsked && !hosting) {
          const [allowed, organizerName, ownName, guests] = await Promise.all([
            // The server decides whether this guest may bring (CO-P8); someone it doesn't count as invited may not.
            circleGateway.allowance(found.id).catch((e: unknown) => {
              if (errorField(e, "code") === "42501") return NOTHING;
              throw Error(loadFailed);
            }),
            // The organizer's first name, for the line under the title and the links' message.
            (found.owner_id ? readProfile(found.owner_id) : Promise.resolve(null)).then(
              (profile) => firstName(profile?.display_name) || INVITE_COPY.hostFallback,
              () => INVITE_COPY.hostFallback,
            ),
            // This guest's own name: the message's inviter. Without it the message names only the organizer.
            readProfile(userId!).then(
              (profile) => profile?.display_name?.trim() || null,
              () => null,
            ),
            // Who is on the resbite already, so their connections read "Invited".
            readGuests(found.id).then(
              (list) => list.map((g) => g.userId),
              (): string[] => [],
            ),
          ]);
          if (!valid()) return;
          setMode("bring");
          setPlan(found);
          setOwn(ownName);
          setOrganizer(organizerName);
          setAllowance(allowed);
          setOnPlan(found.owner_id ? [found.owner_id, ...guests] : guests);
          return;
        }
        // The plan read embeds the admins, who invite as the owner does. Once that no longer holds (a reload after the
        // circle card's refusal, or a return to the screen), the screen shows only the refusal.
        if (!canEditPlan(found, userId, preview, Date.now(), found.admins)) {
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
              (list): [string[], string] => [
                list.map((g) => g.userId),
                firstGuestName(list, [found.owner_id, ...found.admins], UNNAMED_GUEST),
              ],
              (): [string[], string] => [[], CIRCLE_COPY.eachGuest],
            ),
          ]);
          if (!valid()) return;
        }
        setMode("host");
        setAllowance(null);
        setPlan(found);
        setOwn(name);
        setOnPlan(found.owner_id ? [found.owner_id, ...guests] : guests);
        setFirstGuest(first);
      } catch (e) {
        if (valid()) {
          setError(e instanceof Error ? e.message : loadFailed);
        }
      } finally {
        if (valid()) setLoading(false);
      }
    },
    [planId, preview, userId, localPlans, bringAsked],
  );
  const { refresh } = useFocusedRefresh(load, { identity });

  // Bring mode reads the allowance again whenever a refusal (or any other line) appears, so the cap and the lines say
  // what the server holds now. A batch refused with 'Not allowed to bring people here' while bringing is still allowed
  // held someone the host removed: the line says so (C5). Otherwise the screen says no one can be brought.
  const shownError = useRef<string | null>(null);
  const shownPlan = useRef<string | undefined>(undefined);
  shownPlan.current = plan?.id;
  useEffect(() => {
    const before = shownError.current;
    shownError.current = contacts.error;
    if (!bringing || !plan || !contacts.error || before !== null) return;
    const refused = contacts.error === CIRCLE_COPY.notAllowed;
    const id = plan.id;
    void circleGateway.allowance(id).then(
      (next) => {
        if (shownPlan.current !== id) return;
        setAllowance(next);
        if (refused && next.mayBring) contacts.setError(CIRCLE_COPY.oneRefused);
      },
      // The line already shown stays; the next load reads the allowance again.
      () => {},
    );
  }, [contacts.error, bringing, plan?.id]);

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
        <Title>
          {contacts.outcome ? INVITE_COPY.almostHeading : bringing ? CIRCLE_COPY.bringSomeone : INVITE_COPY.heading}
        </Title>
        {plan && !contacts.outcome && bringing && allowance && (
          canBring ? (
            <>
              <Copy>{CIRCLE_COPY.bringLine(organizer, allowance.remaining, plan.title.trim())}</Copy>
              <ConnectionsPicker k={contacts} />
              {contacts.connections.length > 0 && <SectionTitle>{INVITE_COPY.phoneContacts}</SectionTitle>}
              <PickStep k={contacts} previewing={preview} />
            </>
          ) : (
            <Copy accessibilityLiveRegion="polite">{allowance.mayBring ? CIRCLE_COPY.noneLeft : CIRCLE_COPY.notAllowed}</Copy>
          )
        )}
        {plan && !contacts.outcome && !bringing && (
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
        {plan && !preview && !bringing && (
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
