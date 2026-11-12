import React, { useState, useCallback, useRef, useEffect } from "react";
import { AppState, Image, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router";
import { Ban, Check, Flag, Lightbulb, Plus, RotateCcw, UserRound } from "lucide-react-native";
import { artwork } from "../../src/services/catalogue";
import { eventPicture } from "../../src/domain/events";
import { supabase } from "../../src/services/supabase";
import { useApp, LocalPlan } from "../../src/state/AppState";
import { Copy, Title, ErrorNote, Reveal, TextAction, s, useLargeText } from "../../src/design/ui";
import { Chip, chipToneFor, CoverCard, Fab, IconButton, Segmented, Tile, focusHeading } from "../../src/design/kit";
import { fonts } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { GrabberSheet } from "../../src/design/GrabberSheet";
import { MenuRow } from "../../src/design/MenuRow";
import { BlockQuestion, BlockedLine, ReportSheet } from "../../src/design/ReportSheet";
import { createdNotice } from "../../src/domain/planCopy";
import { planCoverStore } from "../../src/services/planCovers";
import {
  cardChips,
  showsDoAgain,
  cardLabel,
  coverNotice,
  eventPlace,
  groupPlans,
  invitationCards,
  withoutInvitations,
} from "../../src/domain/eventView";
import { planFromRow, type PlanRow } from "../../src/domain/plans";
import { planListColumns } from "../../src/services/plans";
import { EVENT_COPY } from "../../src/domain/eventPage";
import { INVITE_COPY } from "../../src/domain/inviteCopy";
import { RequestCard } from "../../src/design/GuestSteps";
import { NotificationAsk } from "../../src/design/NotificationAsk";
import { useNotificationAsk } from "../../src/state/useNotificationAsk";
import { joinRequestGateway, type MyRequest } from "../../src/services/joinRequests";
import { ANSWER_OPTIONS, reconcileRsvp, responseFor, type AnswerKey, type RsvpAttempt } from "../../src/domain/rsvp";
import { readRsvp, writeRsvp } from "../../src/services/rsvp";
import { chatGateway, type ChatOverview } from "../../src/services/chat";
import { currentOccurrences, invitationDot, pendingCardNote, unreadDot } from "../../src/domain/chatRules";
import { leftGroups } from "../../src/state/useGroupLeave";
import { firstName } from "../../src/domain/circle";
import {
  SAFETY_COPY,
  invitationAccessibilityActions,
  invitationActionLabel,
  invitationActions,
  type InvitationAction,
  type ReportTarget,
} from "../../src/domain/safetyCopy";
import { onBlocksChanged, overviewAfterBlock } from "../../src/services/safety";

/** An invitation's Report and Block in its sheet (plan 3, S7): the list, a report, the block confirm, its result. */
type InvitationStep =
  | { kind: "list" }
  | { kind: "report"; target: ReportTarget }
  | { kind: "block"; userId: string; name: string; theyHost: boolean }
  | { kind: "blocked" };

// The last save notice already shown, so a remount or web history restoring the same URL never
// repeats a saved toast. Each save passes a fresh `notice` id.
let shownNotice: string | undefined;
// The last "gone" note tap already shown (its `n`), kept apart from the saved notice id.
let shownGone: string | undefined;

type Attendee = {
  plan_id: string;
  user_id: string;
  response: string;
  version: number;
  profiles: { display_name: string } | null;
};

export default function Plans() {
  const largeText = useLargeText();
  const { created, cover, notice, n } = useLocalSearchParams(),
    { preview, localPlans, session, createdPlan } = useApp(),
    [plans, setPlans] = useState<LocalPlan[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [segment, setSegment] = useState<"upcoming" | "past">("upcoming"),
    [attendees, setAttendees] = useState<Attendee[]>([]),
    // Plan 3: the open-link requests still waiting for their host, or declined.
    [requests, setRequests] = useState<MyRequest[]>([]),
    [hosts, setHosts] = useState<Record<string, string>>({}),
    // Task 8: the unread dots on tiles and the invitations' announcements (my_chat_overview); null until one is read.
    [overview, setOverview] = useState<ChatOverview | null>(null),
    [answering, setAnswering] = useState<string | null>(null),
    [answerError, setAnswerError] = useState<{ plan: string; message: string } | null>(null),
    // The last answer confirmed from an Invitations row: Going or Maybe brings the notification ask.
    [answered, setAnswered] = useState<{ scope: string; response: string } | null>(null),
    // Plan 3: the invitation whose Report and Block are open, and where they stand.
    [reporting, setReporting] = useState<{ planId: string; step: InvitationStep } | null>(null);
  const scope = preview ? "preview" : session?.user.id;
  // Found by the reconcile that runs when the tabs open (see useReconcileCreate), not by this screen.
  const createdTitle = createdPlan && createdPlan.scope === scope ? createdPlan.title : null;
  const identity = useRef(scope);
  identity.current = scope;
  const [loadedFor, setLoadedFor] = useState<string>();
  const request = useRef<AbortController | null>(null);
  // The latest read of the overview wins (review M5): a refresh still in flight can't land after the read a block makes.
  const overviewRead = useRef(0);
  useEffect(() => {
    setPlans([]);
    setAttendees([]);
    setRequests([]);
    setHosts({});
    setOverview(null);
    setLoadedFor(undefined);
    setError(null);
    setBusy(false);
  }, [scope]);
  const refresh = useCallback(async () => {
    request.current?.abort();
    if (preview || !session) {
      setPlans([]);
      setAttendees([]);
      setRequests([]);
      setOverview(null);
      setBusy(false);
      return;
    }
    const uid = session.user.id;
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => identity.current === uid && request.current === controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    // A group left after this read starts stays hidden even if the read still lists it (UI Q3).
    const startedAt = Date.now();
    setBusy(true);
    setError(null);
    // The chats never hold the list back (H36): the overview lands when it arrives, and a failure keeps the last dots and
    // announcements (K-S13), as the requests' read does.
    const overviewTicket = ++overviewRead.current;
    void chatGateway.overview().then(
      (chats) => {
        if (isCurrent() && overviewTicket === overviewRead.current) setOverview(chats);
      },
      () => {},
    );
    try {
      const [p, a, q] = await Promise.all([
        supabase.from("plans").select(planListColumns).order("starts_at").abortSignal(controller.signal),
        supabase
          .from("attendees")
          .select("plan_id,user_id,response,version,profiles(display_name)")
          .abortSignal(controller.signal),
        // Requests never block My resbites: a failed read keeps the last list.
        joinRequestGateway.mine().catch(() => null),
      ]);
      if (!isCurrent()) return;
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      setLoadedFor(uid);
      leftGroups.settle(startedAt, uid);
      const read = ((p.data || []) as unknown as PlanRow[]).map(planFromRow);
      setPlans(read);
      if (q) setRequests(q);
      // Cover changes for cancelled or ended plans, or plans no longer this person's to host, can never complete: drop
      // them quietly. The plans carry their admins, whose changes stay.
      void planCoverStore.discardStaleCoverJournals(uid, read).catch(() => {});
      const mine = (a.data || []) as unknown as Attendee[];
      setAttendees(mine);
      // The host's name for each invitation card; without it the card says "Your host invited you".
      const owners = [
        ...new Set(invitationCards(p.data || [], mine, uid, Date.now()).map((x) => x.owner_id ?? "").filter(Boolean)),
      ];
      if (owners.length) {
        const names = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", owners)
          .abortSignal(controller.signal)
          .then(
            (r) => r.data ?? [],
            () => [],
          );
        if (!isCurrent()) return;
        setHosts(Object.fromEntries(names.map((n) => [n.id, n.display_name])));
      } else setHosts({});
    } catch (e) {
      if (isCurrent())
        setError(
          "We couldn’t refresh your plans. Previously loaded details may be out of date. Try again when you’re connected.",
        );
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setBusy(false);
    }
  }, [preview, session?.user.id]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      let previous = AppState.currentState;
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active" && previous !== "active") void refresh();
        previous = next;
      });
      return () => {
        subscription.remove();
        request.current?.abort();
        request.current = null;
      };
    }, [refresh]),
  );
  // A create the launch reconcile found may have landed after this screen's list read: read again.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (createdTitle) void refreshRef.current();
  }, [createdTitle]);
  // A group left from its chat or resbite page, whichever screen the person is on by then: read the list again (UI Q4).
  useEffect(() => leftGroups.listen(() => void refreshRef.current()), []);
  // After a block or unblock anywhere (plan 3): the overview again, which leaves out what someone blocked wrote and who
  // they are, so an invitation's line and its announcer and inviter go (NOTE 2). Nothing else changes here.
  const readOverview = useRef(() => {});
  readOverview.current = () => {
    if (preview || !session) return;
    const uid = session.user.id;
    const ticket = ++overviewRead.current;
    void chatGateway.overview().then(
      (chats) => {
        if (identity.current === uid && ticket === overviewRead.current) setOverview(chats);
      },
      () => {},
    );
  };
  // A confirmed block takes that person's announcements off the cards at once (ruling SR12), then the overview is read again.
  useEffect(
    () =>
      onBlocksChanged((change) => {
        setOverview((now) => overviewAfterBlock(now, change));
        readOverview.current();
      }),
    [],
  );
  // Every occurrence of a group left on this phone is gone from the list at once, even if the next read fails (UI Q3).
  const list = leftGroups.without(preview ? localPlans : loadedFor === session?.user.id && session ? plans : [], session?.user.id ?? null);
  const now = Date.now();
  const invitations = preview || !session ? [] : invitationCards(list, attendees, session.user.id, now);
  // A plan the account can already read (invited in person since) shows as itself, not as a request.
  const waiting =
    preview || !session || loadedFor !== session.user.id
      ? []
      : requests.filter((q) => !list.some((p) => p.id === q.plan_id));
  const { upcoming: ahead, past } = groupPlans(list, now);
  const upcoming = withoutInvitations(ahead, invitations);
  const shown = segment === "upcoming" ? upcoming : past;
  // Each series' current occurrence among the listed plans: only its tile carries the chat's dot.
  const current = currentOccurrences(list);
  // Answers an invitation exactly as the event page does: read, reconcile, write when still needed, confirm.
  async function answer(p: LocalPlan, key: AnswerKey) {
    const me = attendees.find((a) => a.plan_id === p.id && a.user_id === session?.user.id);
    const uid = session?.user.id;
    if (!me || !uid || answering) return;
    const attempt: RsvpAttempt = {
      planId: p.id,
      planVersion: p.version,
      version: me.version,
      response: responseFor(key, me.response),
    };
    const valid = () => identity.current === uid;
    setAnswering(p.id);
    setAnswerError(null);
    try {
      let next = await readRsvp(p.id, uid);
      if (!valid()) return;
      if (reconcileRsvp(attempt, next) === "retry") {
        try {
          await writeRsvp(attempt);
        } catch {
          /* Confirm saved state before saying anything. */
        }
        if (!valid()) return;
        next = await readRsvp(p.id, uid);
        if (!valid()) return;
      }
      const result = reconcileRsvp(attempt, next);
      if (result === "confirmed") setAnswered({ scope: uid, response: attempt.response });
      if (result !== "confirmed")
        setAnswerError({
          plan: p.id,
          message:
            result === "unavailable"
              ? EVENT_COPY.responsesClosed
              : result === "review"
                ? "The plan or your response changed. Open it to review the latest details."
                : "Your response is not confirmed. Try again.",
        });
      await refresh();
    } catch {
      if (valid())
        setAnswerError({ plan: p.id, message: "We could not confirm your response. Check your connection, then retry." });
    } finally {
      if (valid()) setAnswering(null);
    }
  }
  /**
   * What an unanswered invitation's card offers to report or block (S7, B4, R-Q1, I-2): its announcement while the card
   * shows it, the person who invited them, and the owner the byline names. My resbites reads no blocks, so after "Block
   * Ana" the owner is still offered; blocking again stores nothing new (Known gaps).
   */
  const actionsFor = (p: LocalPlan, note: string | null): InvitationAction[] =>
    invitationActions({
      announcement: note && overview ? (overview.announcements[p.id] ?? null) : null,
      inviterId: overview?.inviters[p.id] ?? null,
      owner: p.owner_id ? { userId: p.owner_id, name: firstName(hosts[p.owner_id]) } : null,
      viewerId: session?.user.id ?? "",
      names: overview?.names ?? {},
    });
  /** One of an invitation's actions, from its sheet or from the screen reader's actions on the card. */
  const stepFor = (p: LocalPlan, action: InvitationAction): InvitationStep =>
    action.kind === "reportMessage"
      ? { kind: "report", target: { kind: "message", id: action.id } }
      : action.kind === "reportPerson"
        ? { kind: "report", target: { kind: "user", userId: action.userId, series: p.series_id, name: action.name } }
        : { kind: "block", userId: action.userId, name: action.name, theyHost: action.theyHost };
  const start = () => router.push("/arrange");
  const open = (p: LocalPlan) => {
    router.setParams({ created: "0", cover: "none" });
    router.push({ pathname: "/event", params: { plan: p.id } });
  };
  const noticeId = typeof notice === "string" ? notice : undefined;
  const pathname = usePathname();
  const [toastNotice, setToastNotice] = useState<string>();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    // Leaving /plans ends the toast; a notice id is shown at most once.
    if (pathname !== "/plans") {
      setToastNotice(undefined);
      setGone(false);
    } else if (noticeId === "gone") {
      // A tapped notification's note: shown once per tap (its `n`), so Back to the same URL never brings it again.
      if (typeof n === "string" && n !== shownGone) {
        shownGone = n;
        setGone(true);
      }
    } else if (noticeId && noticeId !== shownNotice) {
      shownNotice = noticeId;
      setToastNotice(noticeId);
    }
  }, [noticeId, n, pathname]);
  const toast =
    !noticeId || toastNotice !== noticeId
      ? null
      : created === "1"
        ? preview
          ? "Preview saved"
          : "Resbite saved"
        : null;
  // A tapped notification for an event that can't be read any more (usePushRouting).
  const goneNote = gone ? INVITE_COPY.goneNotice : null;
  // Plan 4: "Get notified?" after creating an event, or after a Going or Maybe answer from an Invitations row.
  const ask = useNotificationAsk({
    created: created === "1",
    response: answered && answered.scope === scope ? answered.response : null,
  });
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 110 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={busy} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Title>My resbites</Title>
          <IconButton icon={UserRound} label="Your profile" onPress={() => router.navigate("/profile")} />
        </View>
        <PreviewNotice />
        <ErrorNote message={goneNote} />
        <ErrorNote message={ask.error} />
        {(invitations.length > 0 || waiting.length > 0) && (
          <View style={{ gap: 12 }}>
            <Copy accessibilityRole="header" style={styles.invitationsHeading}>
              {INVITE_COPY.invitationsHeading}
            </Copy>
            {invitations.map((p) => {
              const host = hosts[p.owner_id ?? ""]?.trim() || INVITE_COPY.hostFallback;
              // The latest announcement sent to Everyone invited, under the title (spec "The announcement on the invitation card").
              const note = pendingCardNote(p, "pending", overview, session?.user.id ?? "", now);
              // Plan 3: Report and Block, by a long-press on the card and as its accessibility actions (S7).
              const safety = actionsFor(p, note);
              const safetyActions = invitationAccessibilityActions(safety);
              const place = eventPlace({ owner: false, response: "pending", place: p.place_label, area: p.area }).line;
              const chips = cardChips({ owner: false, status: p.status, response: "pending", starts_at: p.starts_at, ends_at: p.ends_at }, now);
              return (
                <View key={p.id} style={{ gap: 8 }}>
                  <CoverCard
                    picture={eventPicture(p)}
                    title={p.title}
                    startsAt={p.starts_at}
                    endsAt={p.ends_at}
                    place={place}
                    byline={INVITE_COPY.invitedYou(host)}
                    note={note}
                    // I3: on a group, someone who hasn't answered is in its chat (my_chat_overview lists it), so the card
                    // carries the series' unread dot as the tile does; a one-off's admin who hasn't answered is in its
                    // chat as a host, and gets no new dot (ruling GR6 M6).
                    dot={invitationDot(p, session?.user.id ?? "", current, overview)}
                    chips={chips.map((text) => ({ key: text, text, tone: chipToneFor(text) }))}
                    label={`${INVITE_COPY.invitedYou(host)}, ${cardLabel(
                      { title: p.title, startsAt: p.starts_at, endsAt: p.ends_at, place: place ?? "", chips, photo: p.cover_description },
                      new Date(now),
                    )}`}
                    onPress={() => open(p)}
                    onLongPress={safety.length ? () => setReporting({ planId: p.id, step: { kind: "list" } }) : undefined}
                    accessibilityActions={safetyActions}
                    onAccessibilityAction={(name) => {
                      const action = safety[safetyActions.findIndex((a) => a.name === name)];
                      if (action) setReporting({ planId: p.id, step: stepFor(p, action) });
                    }}
                  />
                  <Segmented
                    label={INVITE_COPY.yourAnswer(p.title)}
                    options={ANSWER_OPTIONS}
                    value={null}
                    disabled={answering !== null}
                    onChange={(key) => void answer(p, key)}
                  />
                  {answerError?.plan === p.id && <ErrorNote message={answerError.message} />}
                </View>
              );
            })}
            {waiting.map((q) => (
              <RequestCard key={`request-${q.plan_id}`} request={q} now={new Date(now)} />
            ))}
          </View>
        )}
        <Segmented
          label="Show"
          options={[
            { key: "upcoming", text: "Upcoming" },
            { key: "past", text: "Past" },
          ] as const}
          value={segment}
          onChange={setSegment}
        />
        <Fab placement="inline" onPress={start} />
        {toast && (
          <Reveal style={{ alignSelf: "flex-start" }}>
            <View accessibilityLiveRegion="polite">
              <Chip icon={Check} tone="aqua" text={toast} />
            </View>
          </Reveal>
        )}
        <ErrorNote message={coverNotice(cover)} />
        {createdTitle && (
          <Reveal style={{ alignSelf: "flex-start" }}>
            <View accessibilityLiveRegion="polite">
              <Chip icon={Check} tone="aqua" text={createdNotice(createdTitle)} />
            </View>
          </Reveal>
        )}
        <ErrorNote message={error} />
        {error && <IconButton icon={RotateCcw} label="Refresh plans" busy={busy} onPress={() => void refresh()} />}
        {busy && list.length === 0 && <Copy accessibilityLiveRegion="polite">Loading your plans…</Copy>}
        {shown.length === 0 && !busy && !error ? (
          segment === "upcoming" ? (
            <View style={styles.empty}>
              <Image
                source={artwork["get-out-with-bikes"]}
                style={{ height: 180, width: "100%" }}
                resizeMode="contain"
              />
              <Copy style={styles.emptyTitle}>Nothing planned</Copy>
              <View style={[styles.emptyTiles, largeText && { flexDirection: "column" }]}>
                <View style={styles.emptyTile}>
                  <Tile icon={Plus} title="Start" label="Start a new resbite" onPress={start} />
                </View>
                <View style={styles.emptyTile}>
                  <Tile icon={Lightbulb} title="Ideas" label="Browse ideas" onPress={() => router.navigate("/create")} />
                </View>
              </View>
            </View>
          ) : (
            <Copy style={s.muted}>Nothing here yet.</Copy>
          )
        ) : (
          shown.map((p) => {
            const owner = preview || p.owner_id === session?.user.id;
            const mine = attendees.find((a) => a.plan_id === p.id && a.user_id === session?.user.id);
            const going = attendees.filter((a) => a.plan_id === p.id && a.response === "accepted").length;
            const chips = cardChips(
              { owner, status: p.status, response: mine?.response ?? "pending", going, starts_at: p.starts_at, ends_at: p.ends_at },
              now,
            );
            // GI1: as on the event page, an invitee who hasn’t answered sees the area (or no place), never the place.
            const place = eventPlace({ owner, response: mine?.response ?? null, place: p.place_label, area: p.area }).line;
            const over = showsDoAgain(p, preview ? undefined : session?.user.id, now, preview);
            // CH-P9: a neutral dot while the series' chat is open and has messages this person hasn't read, on its current
            // occurrence only (H37 Q4).
            const dot = !preview && current.has(p.id) && unreadDot(overview?.chats[p.series_id]);
            // A resbite started without an answer yet keeps its announcement until it ends (H37 Q5).
            const note = preview ? null : pendingCardNote(p, mine?.response, overview, session?.user.id ?? "", now);
            return (
              <View key={p.id} style={{ gap: 4 }}>
                <CoverCard
                  picture={eventPicture(p)}
                  title={p.title}
                  startsAt={p.starts_at}
                  endsAt={p.ends_at}
                  place={place}
                  dimmed={p.status === "cancelled"}
                  dot={dot}
                  note={note}
                  chips={chips.map((text) => ({ key: text, text, tone: chipToneFor(text) }))}
                  label={cardLabel(
                    { title: p.title, startsAt: p.starts_at, endsAt: p.ends_at, place: place ?? "", chips, photo: p.cover_description },
                    new Date(now),
                  )}
                  onPress={() => open(p)}
                />
                {over ? (
                  <TextAction title={EVENT_COPY.doThisAgain} onPress={() => router.push({ pathname: "/arrange", params: { again: p.id } })} />
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
      <SafeAreaView edges={["bottom"]} pointerEvents="box-none" style={styles.fabLayer}>
        <Fab placement="float" onPress={start} />
      </SafeAreaView>
      <NotificationAsk ask={ask} />
      <InvitationSheet
        reporting={reporting}
        plan={reporting ? (invitations.find((p) => p.id === reporting.planId) ?? null) : null}
        actionsFor={(p) => actionsFor(p, pendingCardNote(p, "pending", overview, session?.user.id ?? "", now))}
        stepFor={stepFor}
        onStep={(step) => setReporting((r) => (r ? { ...r, step } : r))}
        onClose={() => setReporting(null)}
      />
    </SafeAreaView>
  );
}

/**
 * An invitation's Report and Block (plan 3, S7, B4): its actions as rows, then the report or the block confirm in
 * place (`blockQuestion(name, false, theyHost)`), and "Blocked" after it. The list follows the overview read again after
 * a block, so the announcer and the inviter go.
 */
function InvitationSheet({
  reporting,
  plan,
  actionsFor,
  stepFor,
  onStep,
  onClose,
}: {
  reporting: { planId: string; step: InvitationStep } | null;
  plan: LocalPlan | null;
  actionsFor: (p: LocalPlan) => InvitationAction[];
  stepFor: (p: LocalPlan, action: InvitationAction) => InvitationStep;
  onStep: (step: InvitationStep) => void;
  onClose: () => void;
}) {
  const step = reporting?.step ?? null;
  // The list takes focus on its first row, and after Keep on the Block row it came from (H32 Q53, ruling SR6 D1).
  const rows = React.useRef(new Map<string, View>());
  const backTo = React.useRef<string | null>(null);
  const keyOf = (action: InvitationAction) => (action.kind === "reportMessage" ? `message:${action.id}` : `${action.kind}:${action.userId}`);
  const actions = plan ? actionsFor(plan) : [];
  const first = actions[0] ? keyOf(actions[0]) : null;
  useEffect(() => {
    if (step?.kind !== "list") return;
    const key = backTo.current ?? first;
    backTo.current = null;
    const frame = requestAnimationFrame(() => focusHeading((key ? rows.current.get(key) : undefined) ?? null));
    return () => cancelAnimationFrame(frame);
    // When the list comes into view, not on every redraw.
  }, [step?.kind, reporting?.planId]);
  return (
    <GrabberSheet visible={reporting !== null && plan !== null} label={SAFETY_COPY.reportOrBlock} onClose={onClose}>
      {!plan || !step ? null : step.kind === "report" ? (
        <ReportSheet target={step.target} onDone={onClose} />
      ) : step.kind === "block" ? (
        <BlockQuestion
          userId={step.userId}
          name={step.name}
          youHost={false}
          theyHost={step.theyHost}
          onBlocked={() => onStep({ kind: "blocked" })}
          onClosed={onClose}
          onKeep={() => {
            backTo.current = `block:${step.userId}`;
            onStep({ kind: "list" });
          }}
        />
      ) : step.kind === "blocked" ? (
        <BlockedLine />
      ) : (
        <View>
          {actions.map((action) => (
            <MenuRow
              key={keyOf(action)}
              ref={(node) => {
                if (node) rows.current.set(keyOf(action), node);
                else rows.current.delete(keyOf(action));
              }}
              title={invitationActionLabel(action)}
              icon={action.kind === "block" ? Ban : Flag}
              destructive={action.kind === "block"}
              onPress={() => onStep(stepFor(plan, action))}
            />
          ))}
        </View>
      )}
    </GrabberSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  invitationsHeading: { fontFamily: fonts.display, fontSize: 22 },
  empty: { gap: 20, paddingVertical: 24 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, textAlign: "center" },
  emptyTiles: { flexDirection: "row", gap: 12 },
  emptyTile: { flex: 1 },
  fabLayer: { position: "absolute", right: 20, bottom: 20 },
});
