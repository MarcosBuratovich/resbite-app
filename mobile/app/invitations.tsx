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
import { useAnnounce } from "../src/design/useAnnounce";
import { useApp } from "../src/state/AppState";
import { useContactInvites, type Message, type Sendable } from "../src/state/useContactInvites";
import { useAccount } from "../src/state/AccountState";
import { knownName, rememberName } from "../src/state/knownNames";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { useFocusedRefresh, type Run } from "../src/state/useFocusedRefresh";
import { planGateway } from "../src/services/plans";
import { readProfile } from "../src/services/profile";
import { readGuests, UNNAMED_GUEST } from "../src/services/rsvp";
import { canEditPlan, type Plan } from "../src/domain/plans";
import { bringProgress, firstGuestName, firstName, lineAfterAllowance } from "../src/domain/circle";
import { CIRCLE_COPY } from "../src/domain/circleCopy";
import { messageFor } from "../src/domain/contactInvites";
import { LINK_INFO, linkDate } from "../src/domain/eventLinks";
import { circleGateway, type Allowance } from "../src/services/circle";
import { errorField } from "../src/services/contactInvites";

const unavailable = INVITE_COPY.hostsOnly;
const loadFailed = "Couldn’t load this resbite. Check your connection and try again.";
/** The allowance of someone the server doesn't count as invited (42501 'Not invited'): nothing to bring. */
const NOTHING: Allowance = { allowed: 0, used: 0, remaining: 0, level: 0, mayBring: false };
/** A person's display name, trimmed; null when it is blank or can't be read. */
const nameOf = (id: string) =>
  readProfile(id).then(
    (profile) => profile?.display_name?.trim() || null,
    () => null,
  );

/**
 * "Invite people" (/invitations?plan=<id>): a host (the owner or an admin) sets the circle of trust (CO-04), picks
 * Resbite connections (CO-03), phone contacts or adds numbers to invite, then sends each person's own link. The event
 * link (Share, Copy and Turn off) follows the contacts.
 *
 * Bring mode (CO-06, `&bring=1`, from the resbite page's Bring someone row): a guest the host's circle trusts picks
 * connections and phone contacts the same way, up to the invites left, with no circle card, no event link and none of
 * the host's help about links; each link's message names them and the organizer (CO-P9). A host ignores `bring`; anyone
 * else without it is refused.
 */
export default function Invitations() {
  const { plan: planId, bring } = useLocalSearchParams<{ plan: string; bring?: string }>();
  const { session, preview, localPlans } = useApp();
  const userId = session?.user.id;
  const bringAsked = bring === "1";
  const identity = `${preview ? "preview" : (userId ?? "")}:${planId}`;
  const [plan, setPlan] = useState<Plan | null>(null);
  // With `bring`, the screen doesn't know whether it is bring mode or a host's until the plan is read, so it has no title.
  const [mode, setMode] = useState<"host" | "bring" | null>(bringAsked ? null : "host");
  /** This account's own name, for the links' message; null when it isn't known. */
  const [own, setOwn] = useState<string | null>(null);
  /** Bring mode: the organizer's first name (null when it isn't known), and what this guest may bring. */
  const [organizer, setOrganizer] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [onPlan, setOnPlan] = useState<string[]>([]);
  const [firstGuest, setFirstGuest] = useState<string>(CIRCLE_COPY.eachGuest);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const account = useAccount();
  // The session's own name, already read with the account: bring mode uses it before reading the profile (C23).
  const accountName = useRef(account.displayName);
  accountName.current = account.displayName;
  const bringing = mode === "bring";
  /** Bring mode with invites left: the pickers show, capped at what is left. */
  const canBring = bringing && !!allowance?.mayBring && allowance.remaining > 0;
  const contacts = useContactInvites({
    planId,
    scope: preview ? undefined : userId,
    userPhone: account.user?.phone,
    message: messageFor({
      own: bringing ? (own ?? account.displayName) : own,
      organizer: bringing ? organizer : undefined,
      title: plan?.title.trim() ?? "",
      when: plan ? linkDate(plan.starts_at, plan.ends_at) : "",
    }),
    enabled: !preview && !!plan && (mode === "host" || canBring),
    onPlan,
    limit: bringing ? (allowance?.remaining ?? 0) : undefined,
  });

  // Every read of the allowance is numbered: only the latest one counts (C20). It may also change the refusal line
  // (`lineAfterAllowance`): on the Pick step a used-all line goes once invites are left again; after a refusal,
  // 'Not allowed' while bringing is still allowed becomes C5's line.
  const allowanceRead = useRef(0);
  const picking = useRef(true);
  picking.current = !contacts.outcome;
  const setLine = contacts.setError;
  const takeAllowance = useCallback(
    (ticket: number, next: Allowance, afterRefusal: boolean) => {
      if (ticket !== allowanceRead.current) return;
      setAllowance(next);
      setLine((line) => lineAfterAllowance(line, next, { afterRefusal, picking: picking.current }));
    },
    [setLine],
  );

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
          // A guest who can no longer read the resbite (removed, say) can't bring anyone to it.
          if (bringAsked && !preview) {
            setMode("bring");
            throw Error(CIRCLE_COPY.notAllowed);
          }
          throw Error(unavailable);
        }
        // Bring mode, for anyone but a host (the owner or an admin), who gets host mode whatever `bring` says.
        const hosting = preview || found.owner_id === userId || found.admins.includes(userId ?? "");
        if (bringAsked && !hosting) {
          const ticket = ++allowanceRead.current;
          // Names already read come first, the resbite page's and the session's; the profiles are read only without them.
          const knownOrganizer = knownName(userId, found.owner_id);
          const [allowed, organizerName, ownName, guests] = await Promise.all([
            // The server decides whether this guest may bring (CO-P8); someone it doesn't count as invited may not.
            circleGateway.allowance(found.id).catch((e: unknown) => {
              if (errorField(e, "code") === "42501") return NOTHING;
              throw Error(loadFailed);
            }),
            // The organizer's name, for the line under the title and the links' message.
            knownOrganizer ?? (found.owner_id ? nameOf(found.owner_id) : null),
            // This guest's own name: the message's inviter.
            accountName.current ?? nameOf(userId!),
            // Who is on the resbite already, so their connections read "Invited".
            readGuests(found.id).then(
              (list) => list.map((g) => g.userId),
              (): string[] => [],
            ),
          ]);
          if (!valid()) return;
          rememberName(userId, found.owner_id, organizerName);
          setMode("bring");
          setPlan(found);
          setOwn(ownName);
          setOrganizer(firstName(organizerName) || null);
          takeAllowance(ticket, allowed, false);
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
            nameOf(userId!),
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
    [planId, preview, userId, localPlans, bringAsked, takeAllowance],
  );
  const { refresh } = useFocusedRefresh(load, { identity });

  // Bring mode reads the allowance again whenever a refusal (or any other line) appears, so the cap and the lines say
  // what the server holds now (C5, C20).
  const shownError = useRef<string | null>(null);
  const shownPlan = useRef<string | undefined>(undefined);
  shownPlan.current = plan?.id;
  useEffect(() => {
    const before = shownError.current;
    shownError.current = contacts.error;
    if (!bringing || !plan || !contacts.error || before !== null) return;
    const ticket = ++allowanceRead.current;
    const id = plan.id;
    void circleGateway.allowance(id).then(
      (next) => {
        if (shownPlan.current === id) takeAllowance(ticket, next, true);
      },
      // The line already shown stays; the next load reads the allowance again.
      () => {},
    );
  }, [contacts.error, bringing, plan?.id, takeAllowance]);

  // A bringer's link names them and the organizer. A name still unknown is read again as the link goes (C20); without
  // it the message is worded without it.
  const resolving = useRef(false);
  async function sendLink(item: Sendable, via: "whatsapp" | "messages") {
    if (resolving.current) return;
    let words: Message | undefined;
    if (bringing && plan) {
      resolving.current = true;
      try {
        const ownName = own ?? accountName.current ?? (userId ? await nameOf(userId) : null);
        const organizerName =
          organizer ?? knownName(userId, plan.owner_id) ?? (plan.owner_id ? await nameOf(plan.owner_id) : null);
        if (ownName) setOwn(ownName);
        if (organizerName) setOrganizer(firstName(organizerName) || null);
        words = messageFor({
          own: ownName,
          organizer: organizerName,
          title: plan.title.trim(),
          when: linkDate(plan.starts_at, plan.ends_at),
        });
      } finally {
        resolving.current = false;
      }
    }
    contacts.setError(await contacts.send(item, via, words));
  }

  const progress = canBring && allowance ? bringProgress(allowance.remaining, contacts.inviteCount) : null;
  /** Bring mode with nothing to pick: why, and at 0 left where a sent invitation can go again (C23). */
  const bringEnd =
    bringing && plan && !contacts.outcome && allowance && !canBring
      ? allowance.mayBring
        ? [CIRCLE_COPY.noneLeft, CIRCLE_COPY.sendAgainHint]
        : [CIRCLE_COPY.notAllowed]
      : null;
  // VoiceOver hears bring mode's refusal and cap lines as they appear (C23).
  useAnnounce(bringEnd?.join(" "));
  useAnnounce(bringing ? contacts.error : null);
  useAnnounce(bringing ? error : null);
  useAnnounce(progress?.overCap ? progress.line : null);
  const title = contacts.outcome
    ? INVITE_COPY.almostHeading
    : mode === "bring"
      ? CIRCLE_COPY.bringSomeone
      : mode === "host"
        ? INVITE_COPY.heading
        : null;

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
          {/* The help is the host's (the event link, approvals): a bringer has none of it. */}
          {mode === "host" && <IconButton icon={Info} label="About invitation links" onPress={() => setAbout(true)} />}
        </View>
        {!!title && <Title>{title}</Title>}
        {plan && !contacts.outcome && bringing && allowance && progress && (
          <>
            <View style={{ gap: 4 }}>
              <Copy>{CIRCLE_COPY.bringLine(organizer ?? INVITE_COPY.hostFallback, allowance.remaining, plan.title.trim())}</Copy>
              <Copy accessibilityLiveRegion="polite" style={progress.overCap ? undefined : styles.count}>
                {progress.line}
              </Copy>
            </View>
            <ConnectionsPicker k={contacts} />
            {contacts.connections.length > 0 && <SectionTitle>{INVITE_COPY.phoneContacts}</SectionTitle>}
            <PickStep k={contacts} previewing={preview} />
          </>
        )}
        {bringEnd && (
          <View style={{ gap: 6 }}>
            <Copy accessibilityLiveRegion="polite">{bringEnd[0]}</Copy>
            {bringEnd[1] && <Copy style={s.muted}>{bringEnd[1]}</Copy>}
          </View>
        )}
        {plan && !contacts.outcome && mode === "host" && (
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
            onSend={(item, via) => void sendLink(item, via)}
            onDone={() => (router.canGoBack() ? router.back() : router.replace("/plans"))}
          />
        )}
        {plan && !preview && mode === "host" && (
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
      <InfoSheet visible={about && mode === "host"} title="Invitation links" onClose={() => setAbout(false)}>
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
  // The count under the bring line reads as a quiet aside; the over-cap line in its place, as the plain text it is.
  count: { fontFamily: fonts.medium, fontSize: 13 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
